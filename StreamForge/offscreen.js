import { DownloadQueue } from './download-queue.js';
import { parseMasterPlaylist, parseMediaPlaylist, chooseBestVariant, chooseVariant, isHlsPlaylist, isMasterPlaylist, looksLikeHlsPlaylistBytes } from './hls.js';
import { parseDashManifest } from './dash.js';
import { muxFmp4Files } from './fmp4mux.js';
import { TsMuxer, extractPesFromTs, isMpegTs, isAdts } from './tsmux.js';
import { shouldRetryStatus, failureInfo, formatDiagnostic, backoffMs, reduceConcurrencyForFailure, shouldApplyConcurrencyDecrease, growConcurrency, redactUrl, readWithInactivityTimeout } from './network.js';
import { cacheModeForRequest } from './request-profile.js';
import { TransferMetrics, muxEtaSeconds } from './metrics.js';
import { pairHlsSegments } from './hls-pipeline.js';
import { createDynamicLimiter, recommendedBufferLimits, effectiveBufferPairs, pipelineBottleneck } from './pipeline-runtime.js';
import { canonicalMediaMime, normalizeMediaFilename, inspectMediaHead, createTypedMediaBlob, describeDownloadError } from './export.js';

const activeUrls=new Map();
const downloadQueue = new DownloadQueue();
function formatBytes(bytes){const n=Number(bytes||0);if(n>=1073741824)return `${(n/1073741824).toFixed(2)} GB`;if(n>=1048576)return `${(n/1048576).toFixed(1)} MB`;if(n>=1024)return `${(n/1024).toFixed(1)} KB`;return `${n} B`;}
function safeName(raw,fallback='StreamForge-Download'){ const text=String(raw||fallback).replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim(); return (text||fallback).slice(0,140); }
function networkState(job){
  if(!job._net) job._net={concurrency:4,min:1,max:8,successStreak:0,retries:0,lastRetryAt:0,lastDecreaseAt:0,growthCooldownUntil:0};
  return job._net;
}
function metricsState(job){ if(!job._metrics) job._metrics=new TransferMetrics(); return job._metrics; }


async function ensureBrowserRequestContext(url, job) {
  if (!job._contextHosts) job._contextHosts = new Map();
  let host = '';
  try { host = new URL(url).hostname; } catch { return null; }
  if (!host) return null;
  if (job._contextHosts.has(host)) return job._contextHosts.get(host);
  let result = null;
  try {
    const contextJob = { jobId: job.jobId, tabId: job.tabId, frameId: job.frameId, pageUrl: job.pageUrl || '', referer: job.referer || '', origin: job.origin || '', requestProfile: job.requestProfile || {} };
    const response = await chrome.runtime.sendMessage({ type: 'sf_prepare_request_context', target: 'background', job: contextJob, url });
    result = response?.context || null;
  } catch {}
  job._contextHosts.set(host, result);
  if (result?.flags?.length) {
    await sendProgress(job, 'preparing', 1, `Browser-Kontext: ${result.flags.join(' · ')} · ${host}`, { requestContext: { host, flags: result.flags, cookieCount: result.cookieCount || 0, active: Boolean(result.ok) } });
  }
  return result;
}
function fetchOptions(job,range=null,signal=null,cacheMode='default'){
  const headers={}; if(range)headers.Range=`bytes=${range.start}-${range.end}`;
  const opt={credentials:'include',cache:cacheMode,headers};
  if(signal)opt.signal=signal;
  if(job.referer&&/^https?:\/\//i.test(job.referer))opt.referrer=job.referer;
  return opt;
}
async function hasHostPermission(url){
  try{const u=new URL(url);return await chrome.permissions.contains({origins:[`${u.protocol}//${u.host}/*`]});}catch{return true;}
}
function retryAfterSeconds(response){
  const v=Number(response?.headers?.get?.('retry-after')||0); return Number.isFinite(v)?v:0;
}
function segmentLabel(ctx={}){
  const label=ctx.label||'Segment'; const idx=Number(ctx.index||0),total=Number(ctx.total||0);
  return idx&&total?`${label} ${idx}/${total}`:label;
}
async function fetchRetry(url,job,range=null,{attempts=6,timeoutMs=30000,ctx={}}={}){
  let last=null; const net=networkState(job); const label=segmentLabel(ctx);
  await ensureBrowserRequestContext(url, job);
  const isManifest=/playlist|manifest|mpd/i.test(label);
  for(let attempt=1;attempt<=attempts;attempt++){
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs + Math.min(10000,(attempt-1)*1500));
    let response=null;
    try{
      const cacheMode=cacheModeForRequest({attempt,isManifest});
      response=await fetch(url,fetchOptions(job,range,controller.signal,cacheMode));
      clearTimeout(timer);
      if(!response.ok&&response.status!==206){
        const status=response.status; const err=new Error(`HTTP ${status}`); err.status=status; err.response=response; throw err;
      }
      net.successStreak++;
      if(net.successStreak>=12&&net.concurrency<net.max&&Date.now()>=Number(net.growthCooldownUntil||0)){
        net.concurrency=growConcurrency(net.concurrency,net.max);
        net.successStreak=0;
      }
      return response;
    }catch(e){
      clearTimeout(timer); last=e;
      const timedOut=e?.name==='AbortError'; const status=Number(e?.status||response?.status||0); const permission=await hasHostPermission(url);
      const info=failureInfo({url,status,timedOut,permission,message:String(e?.message||e),online:navigator.onLine!==false});
      const retryable=permission&&info.retryable&&(timedOut||shouldRetryStatus(status)||(!status&&e instanceof TypeError));
      const diag={code:info.code,title:info.title,text:info.text,suggestion:info.suggestion,url:redactUrl(url),label,attempt,attempts,status,when:Date.now()};
      if(!retryable||attempt>=attempts){
        const err=new Error(formatDiagnostic(info,{label,attempt,attempts,concurrency:net.concurrency})); err.status=status; err.url=url; err.code=info.code; err.info=info; err.cause=e;
        await sendProgress(job,'error',Number(ctx.progress||0),`${label}: ${info.title}`,{diagnostic:diag,retry:attempt,concurrency:net.concurrency,host:redactUrl(url)});
        throw err;
      }
      const old=net.concurrency;
      const now=Date.now();
      if(shouldApplyConcurrencyDecrease(net.lastDecreaseAt,{now,status})){
        net.concurrency=reduceConcurrencyForFailure(net.concurrency,{status,timedOut,min:net.min});
        if(net.concurrency!==old) net.lastDecreaseAt=now;
      }
      net.successStreak=0; net.retries++; net.lastRetryAt=now; net.growthCooldownUntil=Math.max(Number(net.growthCooldownUntil||0),now+8000);
      const wait=backoffMs(attempt,retryAfterSeconds(response));
      await sendProgress(job,'downloading',Number(ctx.progress||0),`${label}: ${info.title} – Retry ${attempt+1}/${attempts} in ${(wait/1000).toFixed(wait>=1000?1:0)} s · Parallelität ${net.concurrency}${old!==net.concurrency?` (↓ von ${old})`:''}`,{retry:attempt,concurrency:net.concurrency,host:redactUrl(url),diagnostic:diag});
      await new Promise(r=>setTimeout(r,wait+Math.floor(Math.random()*220)));
    }
  }
  throw last||new Error(`${label}: Netzwerkfehler`);
}
async function getText(url,job,ctx={label:'Playlist'}){
  let last=null;
  for(let bodyAttempt=1;bodyAttempt<=3;bodyAttempt++){
    const response=await fetchRetry(url,job,null,{attempts:6,timeoutMs:22000,ctx});
    try{
      const bytes=await readResponseBytes(response,job,{stallTimeoutMs:12000,countMetrics:false});
      return new TextDecoder().decode(bytes);
    }catch(e){
      last=e;
      if(e?.code!=='BODY_STALL_TIMEOUT'||bodyAttempt>=3)throw e;
      const wait=Math.min(2500,400*bodyAttempt);
      await sendProgress(job,'preparing',Number(ctx.progress||0),`${segmentLabel(ctx)}: Manifest-Datenstrom hängt – Retry ${bodyAttempt+1}/3`,{diagnostic:{code:'BODY_STALL_TIMEOUT',title:'Manifest-Datenstrom hängt',text:'Der Server hat HTTP-Header gesendet, danach aber keine weiteren Daten geliefert.',suggestion:'StreamForge öffnet die Playlist-Verbindung automatisch neu.',label:segmentLabel(ctx),attempt:bodyAttempt,attempts:3,when:Date.now()}});
      await new Promise(r=>setTimeout(r,wait));
    }
  }
  throw last||new Error(`${segmentLabel(ctx)}: Manifest konnte nicht gelesen werden.`);
}
async function readResponseBytes(response,job,{stallTimeoutMs=20000,countMetrics=true}={}){
  const metrics=metricsState(job);
  const reader=response.body?.getReader?.();
  if(!reader){
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(countMetrics)metrics.addDownloaded(bytes.byteLength);
    return bytes;
  }
  const expected=Number(response.headers?.get?.('content-length')||0);
  let target=Number.isFinite(expected)&&expected>0&&expected<=128*1024*1024?new Uint8Array(expected):null;
  let chunks=target?null:[]; let total=0;
  while(true){
    const {done,value}=await readWithInactivityTimeout(reader,stallTimeoutMs); if(done)break;
    if(!value?.byteLength)continue;
    if(countMetrics)metrics.addDownloaded(value.byteLength);
    if(target){
      if(total+value.byteLength>target.byteLength){
        const grown=new Uint8Array(Math.max(total+value.byteLength,Math.ceil(target.byteLength*1.5)));grown.set(target);target=grown;
      }
      target.set(value,total);
    }else chunks.push(value);
    total+=value.byteLength;
  }
  if(target)return total===target.byteLength?target:target.slice(0,total);
  const out=new Uint8Array(total);let off=0;for(const chunk of chunks){out.set(chunk,off);off+=chunk.byteLength;}return out;
}
async function getBytes(part,job,ctx={}){
  let last=null;
  for(let bodyAttempt=1;bodyAttempt<=3;bodyAttempt++){
    const r=await fetchRetry(part.url,job,part.range,{attempts:6,timeoutMs:35000,ctx});
    try{
      let bytes=await readResponseBytes(r,job);
      if(part.range&&r.status!==206&&bytes.length>part.range.end)bytes=bytes.slice(part.range.start,part.range.end+1);
      if(looksLikeHlsPlaylistBytes(bytes)){const info={code:'PLAYLIST_AS_SEGMENT',title:'Playlist statt Mediendaten',text:`${segmentLabel(ctx)} lieferte erneut eine HLS-Playlist statt Video-/Audiodaten.`,suggestion:'Player/Seite neu laden; die Segment-URL könnte abgelaufen oder umgeleitet worden sein.',url:redactUrl(part.url),label:segmentLabel(ctx),when:Date.now()};await sendProgress(job,'error',Number(ctx.progress||0),`${segmentLabel(ctx)}: Playlist statt Mediendaten`,{diagnostic:info});const e=new Error(`${info.title}: ${info.text} ${info.suggestion}`);e.code=info.code;throw e;}
      return bytes;
    }catch(e){
      last=e;
      if(e?.code==='PLAYLIST_AS_SEGMENT'||bodyAttempt>=3)throw e;
      const net=networkState(job); const old=net.concurrency; const now=Date.now();
      if(shouldApplyConcurrencyDecrease(net.lastDecreaseAt,{now,status:0})){
        net.concurrency=reduceConcurrencyForFailure(net.concurrency,{bodyInterrupted:true,min:net.min});
        if(net.concurrency!==old) net.lastDecreaseAt=now;
      }
      net.successStreak=0; net.retries++; net.lastRetryAt=now; net.growthCooldownUntil=Math.max(Number(net.growthCooldownUntil||0),now+8000);
      const wait=backoffMs(bodyAttempt);
      await sendProgress(job,'downloading',Number(ctx.progress||0),`${segmentLabel(ctx)}: Übertragung während des Segments abgebrochen – Retry ${bodyAttempt+1}/3 in ${(wait/1000).toFixed(1)} s · Parallelität ${net.concurrency}${old!==net.concurrency?` (↓ von ${old})`:''}`,{retry:net.retries,retries:net.retries,concurrency:net.concurrency,host:redactUrl(part.url),diagnostic:{code:'BODY_READ_RETRY',title:'Segmentübertragung unterbrochen',text:'Die Verbindung ist nach den HTTP-Headern während der Segmentdaten abgebrochen. StreamForge lädt dieses Segment vollständig neu.',suggestion:'Automatischer Retry läuft.',url:redactUrl(part.url),label:segmentLabel(ctx),attempt:bodyAttempt,attempts:3,when:Date.now()}});
      await new Promise(r=>setTimeout(r,wait+Math.floor(Math.random()*180)));
    }
  }
  throw last||new Error(`${segmentLabel(ctx)}: Segment konnte nicht gelesen werden.`);
}
async function sendProgress(job,state,progress,message,extra={}){try{await chrome.runtime.sendMessage({type:'sf_download_progress',target:'background',jobId:job.jobId,tabId:job.tabId,candidateId:job.candidateId,state,progress,message,...extra});}catch{}}
async function removeTemps(names){try{const root=await navigator.storage.getDirectory();for(const n of names)try{await root.removeEntry(n);}catch{}}catch{}}
async function openTemp(name){ const root=await navigator.storage.getDirectory(); try{await root.removeEntry(name);}catch{} const handle=await root.getFileHandle(name,{create:true}); return {root,handle,writable:await handle.createWritable()}; }

async function writePartsToTemp(parts,tempName,job,{start=3,end=80,label='Spur',downloadStart=0,downloadEnd=100}={}){
  const {handle,writable}=await openTemp(tempName);
  const metrics=metricsState(job);
  const phaseStartedAt=performance.now();
  const limiter=createDynamicLimiter(()=>networkState(job).concurrency);
  const slots=new Map();
  const readyIndexes=new Set();
  let nextSchedule=0,nextWrite=0,downloaded=0,ready=0,written=0,bufferedBytes=0,totalDownloadedBytes=0;
  let stopped=false,progressPromise=null;

  const limits=()=>recommendedBufferLimits(networkState(job).concurrency,{minPairs:12,maxPairs:32,multiplier:3,maxBytes:128*1024*1024});
  const capacity=()=>{
    const avg=downloaded>0?Math.max(1,totalDownloadedBytes/downloaded):4*1024*1024;
    return effectiveBufferPairs(networkState(job).concurrency,avg,limits());
  };

  const scheduleWindow=()=>{
    const cap=capacity();
    const lim=limits();
    while(nextSchedule<parts.length && nextSchedule-nextWrite<cap){
      const scheduledAhead=nextSchedule-nextWrite;
      if(bufferedBytes>=lim.maxBytes && scheduledAhead>=Math.max(2,networkState(job).concurrency))break;
      const index=nextSchedule++;
      const baseProgress=Math.round(start+(index/Math.max(parts.length,1))*(end-start));
      const promise=limiter.run(()=>getBytes(parts[index],job,{label:`${label}-Segment`,index:index+1,total:parts.length,progress:baseProgress}))
        .then(bytes=>{
          downloaded++;
          totalDownloadedBytes+=bytes.byteLength;
          ready++;
          readyIndexes.add(index);
          bufferedBytes+=bytes.byteLength;
          return {bytes};
        },error=>({error}));
      slots.set(index,promise);
    }
    limiter.refresh();
  };

  const emitProgress=()=>{
    if(progressPromise)return progressPromise;
    progressPromise=(async()=>{
      const dlFraction=downloaded/Math.max(parts.length,1);
      const progress=Math.round(start+dlFraction*(end-start));
      const downloadProgress=Math.round(downloadStart+dlFraction*(downloadEnd-downloadStart));
      const cap=capacity();
      const lim=limits();
      const eta=metrics.etaSeconds(downloaded,parts.length,phaseStartedAt,{minDone:10,minElapsedSeconds:6});
      const mx=metrics.snapshot({
        phase:'downloading',phaseStartedAt,downloadProgress,muxProgress:0,
        segmentDone:downloaded,segmentTotal:parts.length,concurrency:networkState(job).concurrency,retries:networkState(job).retries,
        activeRequests:limiter.active(),queuedRequests:limiter.queued(),bufferPairs:ready,bufferCapacity:cap,bufferedBytes,bufferMaxBytes:lim.maxBytes,
        etaSeconds:eta,etaPending:downloaded<10||eta<=0,
        bottleneck:(!readyIndexes.has(nextWrite)&&(limiter.active()>0||limiter.queued()>0))?'Netzwerk':''
      });
      await sendProgress(job,'downloading',Math.min(progress,end),`${label}: ${downloaded}/${parts.length} Teile · ${(totalDownloadedBytes/1048576).toFixed(1)} MB · Puffer ${ready}/${cap} · Parallelität ${networkState(job).concurrency}`,{bytes:written,prefetch:true,prefetchRequests:limiter.active()+limiter.queued(),...mx});
    })().finally(()=>{progressPromise=null;});
    return progressPromise;
  };

  try{
    scheduleWindow();
    const ticker=setInterval(()=>{if(!stopped)emitProgress().catch(()=>{});},500);
    try{
      while(nextWrite<parts.length){
        scheduleWindow();
        const settled=await slots.get(nextWrite);
        if(!settled)throw new Error(`${label}-Prefetch-Puffer ist inkonsistent.`);
        if(settled.error)throw settled.error;
        const bytes=settled.bytes;
        const writeIndex=nextWrite;
        slots.delete(writeIndex);
        ready=Math.max(0,ready-1);
        readyIndexes.delete(writeIndex);
        bufferedBytes=Math.max(0,bufferedBytes-bytes.byteLength);
        // Advance the ordered window before awaiting the local write. Network
        // requests can therefore refill the free slot while OPFS writes.
        nextWrite++;
        scheduleWindow();
        await writable.write(bytes);
        written+=bytes.byteLength;
      }
    }finally{
      stopped=true;
      clearInterval(ticker);
    }
    await emitProgress();
    await writable.close();
    return {handle,bytes:written};
  }catch(e){
    try{limiter.cancelPending(e);}catch{}
    try{await writable.abort();}catch{}
    await removeTemps([tempName]);
    throw e;
  }
}

function mediaParts(media){
  const out=[];let mapKey='';
  for(const seg of media.segments){ if(seg.map){const k=`${seg.map.url}|${seg.map.range?.start??''}|${seg.map.range?.end??''}`;if(k!==mapKey){out.push(seg.map);mapKey=k;}} out.push({url:seg.url,range:seg.range}); }
  return out;
}
async function resolveHls(job){
  let playlistUrl=job.url;
  let text=await getText(playlistUrl,job,{label:'HLS-Playlist'});
  let audioMedia=null;
  let audioTrack=null;
  let best=null;
  let selectedHeight=Number(job.height||0);
  const visited=new Set();

  for(let depth=0;depth<6;depth++){
    if(!isHlsPlaylist(text))throw new Error('Die URL ist keine gültige HLS-Playlist.');
    if(!isMasterPlaylist(text)) break;
    if(visited.has(playlistUrl))throw new Error('HLS-Master-Playlist enthält eine Schleife.');
    visited.add(playlistUrl);

    const master=parseMasterPlaylist(text,playlistUrl);
    const selectedVariant=depth===0?String(job.selectedVariant||''):'';
    const chosen=selectedVariant?chooseVariant(master,{uri:selectedVariant,height:Number(job.selectedHeight||0),bandwidth:Number(job.selectedBandwidth||0)}):chooseBestVariant(master);
    if(!chosen)throw new Error('Keine HLS-Qualitätsvariante gefunden.');
    best=chosen;
    if(chosen.height) selectedHeight=chosen.height;
    await sendProgress(job,'preparing',Math.min(1+depth,6),chosen.height?`HLS-Ebene ${depth+1}: ${chosen.height}p${selectedVariant?' ausgewählt':' gewählt'}`:`HLS-Ebene ${depth+1} gewählt`);

    // Falls diese Master-Ebene eine separate Audiospur definiert, merken/auflösen.
    if(chosen.separateAudio){
      const group=master.audioGroups.get(chosen.audioGroup)||[];
      const selectedKey=String(job.selectedAudio||'');
      const keyOf=x=>[x.groupId||'',x.language||'',x.name||''].join('|');
      const audio=(selectedKey&&group.find(x=>keyOf(x)===selectedKey&&x.uri))||group.find(x=>x.isDefault&&x.uri)||group.find(x=>x.isAutoSelect&&x.uri)||group.find(x=>x.uri);
      if(!audio?.uri)throw new Error('Separate HLS-Audiospur konnte nicht aufgelöst werden.');
      audioTrack=audio;
      let audioUrl=audio.uri;
      let audioText=await getText(audioUrl,job,{label:'HLS-Audio-Playlist'});
      for(let aDepth=0;aDepth<4 && isMasterPlaylist(audioText);aDepth++){
        const am=parseMasterPlaylist(audioText,audioUrl); const av=chooseBestVariant(am);
        if(!av?.uri)throw new Error('Verschachtelte HLS-Audiospur konnte nicht aufgelöst werden.');
        audioUrl=av.uri; audioText=await getText(audioUrl,job,{label:'HLS-Audio-Playlist'});
      }
      audioMedia=parseMediaPlaylist(audioText,audioUrl);
      if(audioMedia.encrypted)throw new Error('Verschlüsselte/geschützte HLS-Audiospur wird nicht verarbeitet.');
    }

    playlistUrl=chosen.uri;
    text=await getText(playlistUrl,job,{label:'HLS-Playlist'});
  }

  if(isMasterPlaylist(text))throw new Error('HLS enthält mehr als 6 verschachtelte Master-Playlists.');
  const videoMedia=parseMediaPlaylist(text,playlistUrl);
  if(videoMedia.encrypted)throw new Error('Verschlüsselter/geschützter HLS-Stream wird nicht verarbeitet.');
  if(!videoMedia.segments.length)throw new Error('Keine HLS-Segmente gefunden.');
  return {videoMedia,audioMedia,audioTrack,best:{...(best||{}),height:selectedHeight||best?.height||0}};
}

function mimeForFilename(filename){ const lower=String(filename||'').toLowerCase();return lower.endsWith('.mp4')?'video/mp4':lower.endsWith('.ts')?'video/mp2t':lower.endsWith('.webm')?'video/webm':'application/octet-stream'; }
async function prepareExportBlob(record){
  const jobId=String(record?.jobId||'');
  if(!jobId)throw new Error('Export-Job-ID fehlt.');
  const current=activeUrls.get(jobId);
  if(current?.blobUrl)return {jobId,blobUrl:current.blobUrl,tempName:current.tempName,tempNames:current.tempNames,filename:current.filename,bytes:current.bytes,mime:current.mime};
  const tempName=String(record?.tempName||'');
  if(!tempName)throw new Error('Temporäre Exportdatei ist nicht bekannt.');
  const root=await navigator.storage.getDirectory();
  let handle;
  try{handle=await root.getFileHandle(tempName);}catch{const e=new Error('Die fertig gemuxte temporäre Datei ist nicht mehr vorhanden.');e.code='EXPORT_TEMP_MISSING';throw e;}
  const file=await handle.getFile();
  if(!file.size){const e=new Error('EXPORT_EMPTY');e.code='EXPORT_EMPTY';throw e;}

  const requestedMime=canonicalMediaMime(record?.mime||mimeForFilename(record?.filename||tempName));
  const headBytes=new Uint8Array(await file.slice(0,Math.min(file.size,64*1024)).arrayBuffer());
  const inspection=inspectMediaHead(headBytes,requestedMime);
  if(!inspection.ok){const e=new Error(inspection.code);e.code=inspection.code;e.detectedMime=inspection.detectedMime||'';throw e;}

  const mime=canonicalMediaMime(inspection.detectedMime||requestedMime);
  const filename=normalizeMediaFilename(String(record?.filename||tempName),mime);
  // A Blob containing a File references the File's data; it does not build a
  // multi-gigabyte Uint8Array in JavaScript. The explicit MIME type is vital:
  // OPFS File objects frequently expose an empty file.type, which made Chrome
  // occasionally treat the blob as text and append/save it as .txt.
  const exportBlob=createTypedMediaBlob(file,mime);
  const blobUrl=URL.createObjectURL(exportBlob);
  const entry={jobId,blobUrl,tempName,tempNames:Array.isArray(record?.tempNames)&&record.tempNames.length?record.tempNames:[tempName],filename,bytes:file.size,mime,typedBlob:exportBlob};
  activeUrls.set(jobId,entry);
  return {jobId,blobUrl,tempName:entry.tempName,tempNames:entry.tempNames,filename,bytes:file.size,mime};
}
async function releaseExport(jobId){const e=activeUrls.get(String(jobId||''));if(!e)return;try{if(e.blobUrl)URL.revokeObjectURL(e.blobUrl);}catch{}activeUrls.delete(String(jobId||''));}
async function publishFile(job,tempName,filename,tempNames){
  let prepared;
  try{
    prepared=await prepareExportBlob({jobId:job.jobId,tempName,tempNames,filename,mime:mimeForFilename(filename)});
  }catch(e){
    const code=String(e?.code||'EXPORT_PREPARE_FAILED');
    if(code.startsWith('EXPORT_')&&code!=='EXPORT_TEMP_MISSING') await removeTemps(Array.isArray(tempNames)&&tempNames.length?tempNames:[tempName]);
    const info=describeDownloadError(code);
    await sendProgress(job,'error',100,`${info.title}: ${info.text}`,{diagnostic:{code:info.code,title:info.title,text:info.text,suggestion:info.suggestion,label:'Finale Dateiprüfung',when:Date.now()}});
    throw e;
  }
  const metrics=metricsState(job);metrics.addOutput(prepared.bytes);
  await sendProgress(job,'ready',99,`Fertig (${prepared.mime}) · ${formatBytes(prepared.bytes)} – Speicherort wird geöffnet …`,{bytes:prepared.bytes,...metrics.snapshot({phase:'ready',downloadProgress:100,muxProgress:job._hadMux?100:0,etaSeconds:0,bottleneck:''})});
  await chrome.runtime.sendMessage({type:'sf_blob_ready',target:'background',jobId:job.jobId,tabId:job.tabId,candidateId:job.candidateId,...prepared});
}

async function muxTemps(job,videoName,audioName,outputName){
  const root=await navigator.storage.getDirectory(); const [vh,ah]=await Promise.all([root.getFileHandle(videoName),root.getFileHandle(audioName)]); const [vf,af]=await Promise.all([vh.getFile(),ah.getFile()]); const out=await openTemp(outputName); const muxStartedAt=performance.now(); job._hadMux=true;
  try{
    await sendProgress(job,'muxing',82,'Download abgeschlossen · Audio und Video werden lokal gemuxt …',{phase:'muxing',downloadProgress:100,muxProgress:0,speedBps:0,etaSeconds:0,bottleneck:'Muxing'});
    await muxFmp4Files(vf,af,out.writable,(done,total)=>{const pct=Math.round(done/Math.max(total,1)*100);const p=82+Math.round(pct*0.15);sendProgress(job,'muxing',Math.min(p,97),`Muxing: ${done}/${total} Fragmente`,{phase:'muxing',downloadProgress:100,muxProgress:pct,speedBps:0,etaSeconds:muxEtaSeconds(done,total,muxStartedAt),segmentDone:done,segmentTotal:total,bottleneck:'Muxing'}).catch(()=>{});});
    await out.writable.close();
  }
  catch(e){try{await out.writable.abort();}catch{}await removeTemps([outputName]);throw e;}
}

function concatBytes(parts){ const total=parts.reduce((n,p)=>n+p.length,0); const out=new Uint8Array(total); let o=0; for(const p of parts){out.set(p,o);o+=p.length;} return out; }

async function muxSeparatedTsHls(job,videoMedia,audioMedia,outputName){
  const out=await openTemp(outputName);
  // A persistent 2 MiB TS output buffer keeps OPFS writes large and cheap.
  const muxer=new TsMuxer(out.writable,{flushBytes:2*1024*1024});
  const metrics=metricsState(job);
  const phaseStartedAt=performance.now();
  job._hadMux=true;
  let limiter=null;
  try{
    const vSegs=videoMedia.segments||[], aSegs=audioMedia.segments||[];
    if(!vSegs.length||!aSegs.length)throw new Error('Getrennte HLS-Spuren enthalten keine Segmente.');

    const pairs=pairHlsSegments(vSegs,aSegs);
    const missing=pairs.find(x=>!x.hasAudioCoverage);
    if(missing)throw new Error(`Für Videosegment ${missing.videoIndex+1} wurde auf der HLS-Zeitleiste keine passende Audiospur gefunden.`);

    limiter=createDynamicLimiter(()=>networkState(job).concurrency);
    const slots=new Map();
    let nextSchedule=0, muxedPairs=0, downloadedPairs=0, readyPairs=0, bufferedBytes=0, totalPairBytes=0;
    const readyIndexes=new Set();
    let stopped=false, progressPromise=null;

    const bufferLimits=()=>recommendedBufferLimits(networkState(job).concurrency,{minPairs:12,maxPairs:32,multiplier:3,maxBytes:160*1024*1024});
    const pairBytes=item=>Number(item?.vb?.byteLength||0)+Number(item?.ab?.byteLength||0);
    const effectivePairCapacity=()=>{
      const limits=bufferLimits();
      const avg=downloadedPairs>0?Math.max(1,totalPairBytes/downloadedPairs):8*1024*1024;
      return effectiveBufferPairs(networkState(job).concurrency,avg,limits);
    };

    const fetchPair=async(pair)=>{
      const i=pair.videoIndex,vs=vSegs[i];
      const progress=8+Math.round((i/Math.max(vSegs.length,1))*88);
      const videoPromise=limiter.run(()=>getBytes({url:vs.url,range:vs.range},job,{label:'Video-Segment',index:i+1,total:vSegs.length,progress}));
      const audioPromises=pair.audioIndexes.map(j=>limiter.run(()=>getBytes({url:aSegs[j].url,range:aSegs[j].range},job,{label:'Audio-Segment',index:j+1,total:aSegs.length,progress})));
      const [vb,audioParts]=await Promise.all([videoPromise,Promise.all(audioPromises)]);
      const item={pair,vb,ab:audioParts.length?concatBytes(audioParts):null};
      const size=pairBytes(item);
      downloadedPairs++;
      totalPairBytes+=size;
      readyPairs++;
      readyIndexes.add(pair.videoIndex);
      bufferedBytes+=size;
      return item;
    };

    const scheduleWindow=()=>{
      const limits=bufferLimits();
      const cap=effectivePairCapacity();
      // Pair count prevents unbounded promise/request queues. The byte budget
      // prevents a fast CDN from filling RAM when the muxer or disk stalls.
      // A small network-width allowance keeps requests moving even when the
      // ready buffer is close to the byte cap.
      while(nextSchedule<pairs.length && nextSchedule-muxedPairs<cap){
        const scheduledAhead=nextSchedule-muxedPairs;
        if(bufferedBytes>=limits.maxBytes && scheduledAhead>=Math.max(2,networkState(job).concurrency))break;
        const index=nextSchedule++;
        const promise=fetchPair(pairs[index]).then(value=>({value}),error=>({error}));
        slots.set(index,promise);
      }
      limiter.refresh();
    };

    const emitProgress=()=>{
      if(progressPromise)return progressPromise;
      progressPromise=(async()=>{
        const total=pairs.length;
        const dlPct=Math.round((downloadedPairs/Math.max(total,1))*100);
        const muxPct=Math.round((muxedPairs/Math.max(total,1))*100);
        const cap=effectivePairCapacity();
        const limits=bufferLimits();
        const eta=metrics.etaSeconds(downloadedPairs,total,phaseStartedAt,{minDone:10,minElapsedSeconds:6});
        const bottleneck=pipelineBottleneck({downloadDone:downloadedPairs,muxDone:muxedPairs,total,bufferPairs:readyPairs,bufferCapacity:cap,activeRequests:limiter.active(),queuedRequests:limiter.queued(),headReady:readyIndexes.has(muxedPairs)});
        const mx=metrics.snapshot({phase:'streaming_mux',phaseStartedAt,downloadProgress:dlPct,muxProgress:muxPct,segmentDone:downloadedPairs,segmentTotal:total,muxSegmentDone:muxedPairs,muxSegmentTotal:total,concurrency:networkState(job).concurrency,retries:networkState(job).retries,activeRequests:limiter.active(),queuedRequests:limiter.queued(),bufferPairs:readyPairs,bufferCapacity:cap,bufferedBytes,bufferMaxBytes:limits.maxBytes,etaSeconds:eta,etaPending:downloadedPairs<10||eta<=0,bottleneck});
        await sendProgress(job,'downloading',Math.min(8+Math.round((Math.max(dlPct,muxPct)/100)*88),96),`Download ${dlPct}% · Muxing ${muxPct}% · Puffer ${readyPairs}/${cap}`,{bytes:muxer.bytesWritten,prefetch:true,prefetchRequests:limiter.active()+limiter.queued(),...mx});
      })().finally(()=>{progressPromise=null;});
      return progressPromise;
    };

    scheduleWindow();
    // UI/storage updates are deliberately outside the mux loop. Neither OPFS
    // nor the network pipeline waits for the popup/background service worker.
    const ticker=setInterval(()=>{if(!stopped)emitProgress().catch(()=>{});},500);
    try{
      while(muxedPairs<pairs.length){
        scheduleWindow();
        const settled=await slots.get(muxedPairs);
        if(!settled)throw new Error('TS/AAC-Pufferzustand ist inkonsistent.');
        if(settled.error)throw settled.error;
        const item=settled.value;
        slots.delete(muxedPairs);
        readyPairs=Math.max(0,readyPairs-1);
        readyIndexes.delete(muxedPairs);
        bufferedBytes=Math.max(0,bufferedBytes-pairBytes(item));

        // Free a buffer slot before local muxing starts, so the network can
        // immediately fetch farther ahead while output remains ordered.
        scheduleWindow();

        const {pair,vb,ab}=item;
        const i=pair.videoIndex,vs=vSegs[i];
        const discontinuity=Boolean(vs?.discontinuity || (pair.audioIndexes||[]).some(ai=>aSegs[ai]?.discontinuity));
        if(discontinuity) await muxer.markDiscontinuity();
        if(!isMpegTs(vb))throw new Error('Die Videospur ist kein MPEG-TS. Gemischtes fMP4/TS-HLS wird noch nicht unterstützt.');
        if(ab&&!isMpegTs(ab)&&!isAdts(ab))throw new Error('Die separate Audiospur ist weder MPEG-TS noch AAC/ADTS.');
        const muxStarted=performance.now();
        if(ab){
          let audioStartPts=null,videoExtract=null;
          if(isAdts(ab)){
            // Reuse this parse in TsMuxer so ADTS streams do not scan the same
            // video TS segment twice just to determine its first PTS.
            videoExtract=extractPesFromTs(vb,'video');
            const firstVideoPts=videoExtract.pes.find(x=>Number.isFinite(x.pts))?.pts;
            if(Number.isFinite(firstVideoPts)){
              const firstAudio=aSegs[pair.audioIndexes[0]];
              audioStartPts=firstVideoPts+((firstAudio?.start||0)-(vs.start||0))*90000;
            }
          }
          await muxer.writePair(vb,ab,{audioStartPts,videoExtract});
        }else{
          await muxer.writeVideo(vb);
        }
        metrics.addTiming(0,performance.now()-muxStarted);
        muxedPairs++;
        metrics.addOutput(muxer.bytesWritten);
        // No awaited progress message here: this is the critical hot path.
      }
    }finally{
      stopped=true;
      clearInterval(ticker);
    }
    // Commit the persistent TS buffer only once at the end (or when it reaches
    // its 2 MiB threshold internally), then send one final status snapshot.
    await muxer.flush();
    await emitProgress();
    await out.writable.close();
    return {bytes:muxer.bytesWritten,physicalBytes:muxer.physicalBytesWritten,writerCalls:muxer.writerCalls};
  }catch(e){
    try{limiter?.cancelPending?.(e);}catch{}
    try{await out.writable.abort();}catch{}
    await removeTemps([outputName]);
    throw e;
  }
}
async function downloadHls(job){
  await sendProgress(job,'preparing',0,'HLS wird vorbereitet …'); const {videoMedia,audioMedia,audioTrack,best}=await resolveHls(job); const q=Number(best?.height||job.height||0);
  if(!audioMedia){ const ext=videoMedia.fmp4?'.mp4':'.ts',name=`streamforge-${job.jobId}${ext}`; await writePartsToTemp(mediaParts(videoMedia),name,job,{start:3,end:96,label:'HLS',downloadStart:0,downloadEnd:100}); await publishFile(job,name,`${safeName(job.outputBaseName||job.title)}${ext}`,[name]); return; }
  if(videoMedia.fmp4&&audioMedia.fmp4){
    const vn=`streamforge-${job.jobId}-video.mp4`,an=`streamforge-${job.jobId}-audio.mp4`,out=`streamforge-${job.jobId}-muxed.mp4`;
    try{ await writePartsToTemp(mediaParts(videoMedia),vn,job,{start:3,end:42,label:'Video',downloadStart:0,downloadEnd:55}); await writePartsToTemp(mediaParts(audioMedia),an,job,{start:42,end:80,label:'Audio',downloadStart:55,downloadEnd:100}); await muxTemps(job,vn,an,out); await removeTemps([vn,an]); await publishFile(job,out,`${safeName(job.outputBaseName||job.title)}.mp4`,[out]); }
    catch(e){await removeTemps([vn,an,out]);throw e;} return;
  }
  if(!videoMedia.fmp4&&!audioMedia.fmp4){
    const out=`streamforge-${job.jobId}-muxed.ts`; await sendProgress(job,'downloading',7,'Video + Audio werden geladen · Muxing läuft parallel …',{phase:'streaming_mux',downloadProgress:0,muxProgress:0,speedBps:0,etaSeconds:0,bottleneck:''});
    await muxSeparatedTsHls(job,videoMedia,audioMedia,out); await publishFile(job,out,`${safeName(job.outputBaseName||job.title)}.ts`,[out]); return;
  }
  throw new Error('Gemischte HLS-Spuren (eine fMP4-, eine MPEG-TS/AAC-Spur) werden noch nicht zusammengeführt.');
}

function dashTrackParts(track){ const parts=[];if(track.init?.url)parts.push(track.init);parts.push(...(track.segments||[]));return parts; }
async function downloadDash(job){
  await sendProgress(job,'preparing',0,'DASH-MPD wird analysiert …'); const text=await getText(job.url,job,{label:'DASH-Manifest'}); const dash=parseDashManifest(text,job.url);
  if(/webm/i.test(dash.video.mimeType||'')||/webm/i.test(dash.audio.mimeType||''))throw new Error('DASH-WebM-Muxing ist derzeit noch nicht unterstützt; fMP4/MP4-DASH wird unterstützt.');
  const vp=dashTrackParts(dash.video),ap=dashTrackParts(dash.audio); if(!vp.length||!ap.length)throw new Error('DASH-Segmente konnten nicht aufgelöst werden.');
  const vn=`streamforge-${job.jobId}-dash-video.mp4`,an=`streamforge-${job.jobId}-dash-audio.mp4`,out=`streamforge-${job.jobId}-dash-muxed.mp4`;
  try{ await sendProgress(job,'preparing',2,dash.video.height?`DASH ${dash.video.height}p · Audio ${Math.round((dash.audio.bandwidth||0)/1000)} kbps`:'DASH-Spuren gewählt'); await writePartsToTemp(vp,vn,job,{start:3,end:42,label:'Video',downloadStart:0,downloadEnd:55}); await writePartsToTemp(ap,an,job,{start:42,end:80,label:'Audio',downloadStart:55,downloadEnd:100}); await muxTemps(job,vn,an,out); await removeTemps([vn,an]); await publishFile(job,out,`${safeName(job.outputBaseName||job.title)}.mp4`,[out]); }
  catch(e){await removeTemps([vn,an,out]);throw e;}
}

async function cleanup(jobId,fallbackTempNames=[]){
  const key=String(jobId||''); const e=activeUrls.get(key); const names=e?.tempNames?.length?e.tempNames:(Array.isArray(fallbackTempNames)?fallbackTempNames:[]);
  await releaseExport(key); if(names.length)await removeTemps(names);
  try{await chrome.runtime.sendMessage({type:'sf_cleanup_request_context',target:'background',jobId:key});}catch{}
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.target!=='offscreen')return;
  if(message.type==='sf_hls_start'||message.type==='sf_dash_start'){
    const fn=message.type==='sf_hls_start'?downloadHls:downloadDash;
    const position=downloadQueue.waiting+(downloadQueue.busy?1:0);
    if(position>0) sendProgress(message.job,'queued',0,`Warteschlange · Position ${position}`).catch(()=>{});
    const key=`${message.job.tabId}:${message.job.candidateId}`;
    const queued=downloadQueue.enqueue(()=>fn(message.job),key);
    queued.promise.catch(async e=>{
      if(e?.code!=='QUEUE_CANCELLED') await sendProgress(message.job,'error',0,String(e?.message||e));
    });
    sendResponse({ok:true,queued:position>0,position});
    return false;
  }
  if(message.type==='sf_queue_cancel'){
    const key=`${message.tabId}:${message.candidateId}`;
    sendResponse({ok:downloadQueue.cancel(key)});
    return false;
  }
  if(message.type==='sf_export_prepare'){prepareExportBlob(message.export||{}).then(x=>sendResponse({ok:true,...x})).catch(e=>sendResponse({ok:false,error:String(e?.message||e),code:e?.code||'EXPORT_PREPARE_FAILED'}));return true;}
  if(message.type==='sf_export_release'){releaseExport(message.jobId).then(()=>sendResponse({ok:true}));return true;}
  if(message.type==='sf_export_discard'||message.type==='sf_download_cleanup'){cleanup(message.jobId,message.tempNames||[]).then(()=>sendResponse({ok:true}));return true;}
});
