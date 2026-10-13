import { buildMediaBasename, suggestNaming, validateNaming } from "./naming.js";
import { RenderGate, isNamingEditor } from "./ui-refresh.js";
import { shouldProbeNow } from "./probe-utils.js";
let tabId = null, items = [];
const audioSelections = new Map();
const qualitySelections = new Map();
const namingSelections = new Map();
const namingSaveTimers = new Map();
const renderGate = new RenderGate();
let deferredRenderScheduled = false;
let enrichRunning = false;
const list=document.querySelector('#list'), empty=document.querySelector('#empty'), count=document.querySelector('#count'), filter=document.querySelector('#filter'), template=document.querySelector('#itemTemplate');
const shortKind=k=>k==='hls'?'HLS':k==='dash'?'DASH':'MEDIA';
const fmtSize=n=>{ n=Number(n||0); if(!n)return''; const units=['B','KB','MB','GB']; let i=0; while(n>=1024&&i<units.length-1){n/=1024;i++} return `${n.toFixed(i>1?1:0)} ${units[i]}`; };
const fmtRate=n=>{n=Number(n||0);if(!n)return'';return `${fmtSize(n)}/s`;};
const fmtEta=s=>{s=Math.max(0,Math.round(Number(s||0)));if(!s)return'';const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;if(h)return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;return `${m}:${String(sec).padStart(2,'0')}`;};
function persistNaming(itemId,naming){
  namingSelections.set(itemId,{...naming});
  const old=namingSaveTimers.get(itemId); if(old)clearTimeout(old);
  namingSaveTimers.set(itemId,setTimeout(()=>{namingSaveTimers.delete(itemId);chrome.runtime.sendMessage({type:'sf_set_naming',tabId,id:itemId,naming}).catch(()=>{});},250));
}
function filenamePreviewText(naming){
  const checked=validateNaming(naming);
  return checked.ok?buildMediaBasename(checked.value):`⚠ ${checked.error}`;
}
async function getCurrentTab(){ const [tab]=await chrome.tabs.query({active:true,currentWindow:true}); return tab; }
function requestRender(){
  if(renderGate.requestRender()) render();
}
function flushDeferredRender(){
  if(deferredRenderScheduled)return;
  deferredRenderScheduled=true;
  setTimeout(()=>{
    deferredRenderScheduled=false;
    if(isNamingEditor(document.activeElement)){renderGate.beginEdit();return;}
    if(renderGate.endEdit()) render();
  },0);
}
async function load({forceProbe=false}={}){ const tab=await getCurrentTab(); tabId=tab?.id??null; if(!Number.isInteger(tabId))return; const result=await chrome.runtime.sendMessage({type:'sf_get',tabId}); items=result?.items||[]; requestRender(); enrichVisible({force:forceProbe}); }
function qualityText(item){ const p=item.probe||null; if(p?.summary)return p.summary; if(p?.height)return `${p.height}p`; if(p?.contentLength)return fmtSize(p.contentLength); if(p&&item.kind==='hls')return p.playlistType==='media'?'HLS · bereit':'HLS · analysiert'; if(p&&item.kind==='dash')return 'DASH · analysiert'; if(p&&item.kind==='media')return 'Medium · bereit'; if(['queued','preparing','downloading','muxing','saving'].includes(item.download?.state))return `${shortKind(item.kind)} · aktiv`; if(item.probeError)return 'Analysefehler'; return 'Analysiere …'; }
function diagnosticEntries(item){
  const out=[];
  if(item.probeDiagnostic) out.push(item.probeDiagnostic);
  else if(item.probeError) out.push({code:'PROBE_FAILED',title:'Manifest-Analyse fehlgeschlagen',text:item.probeError});
  for(const d of (item.download?.diagnostics||[])) out.push(d);
  const seen=new Set();
  return out.filter(d=>{const k=`${d.code||''}|${d.title||''}|${d.text||''}|${d.label||''}`;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,6);
}
function fillDiagnostics(box, entries){
  box.textContent='';
  for(const d of entries){
    const e=document.createElement('div');e.className='diagEntry';
    const title=document.createElement('span');title.className='diagTitle';title.textContent=d.title||d.label||'Diagnose';e.appendChild(title);
    if(d.code){const code=document.createElement('span');code.className='diagCode';code.textContent=d.code;e.appendChild(code);}
    if(d.text){const text=document.createElement('span');text.className='diagText';text.textContent=d.text;e.appendChild(text);}
    if(d.suggestion){const sug=document.createElement('span');sug.className='diagSuggestion';sug.textContent=`Hinweis: ${d.suggestion}`;e.appendChild(sug);}
    if(d.when||d.at){const t=document.createElement('span');t.className='diagTime';t.textContent=new Date(d.when||d.at).toLocaleTimeString();e.appendChild(t);}
    box.appendChild(e);
  }
}
function render(){
  const wanted=filter.value; const shown=wanted==='all'?items:items.filter(x=>x.kind===wanted); list.textContent=''; empty.style.display=shown.length?'none':'block'; count.textContent=String(items.length);
  for(const item of shown){
    const node=template.content.cloneNode(true); const article=node.querySelector('.item'); article.dataset.itemId=item.id; const img=node.querySelector('.preview'), fallback=node.querySelector('.previewFallback');
    if(item.previewUrl){ img.src=item.previewUrl; img.style.display='block'; fallback.style.display='none'; img.addEventListener('error',()=>{img.style.display='none';fallback.style.display='grid';},{once:true}); }
    else {img.style.display='none';fallback.style.display='grid';}
    node.querySelector('.qualityBadge').textContent=qualityText(item); node.querySelector('.kind').textContent=shortKind(item.kind); const ctx=item.download?.requestContext||item.probe?.requestContext; const cb=node.querySelector('.contextBadge'); if(ctx?.active||ctx?.flags?.length){cb.textContent='Browser-Kontext ✓';cb.title=(ctx.flags||[]).join(' · ');} else cb.hidden=true; node.querySelector('.hits').textContent=item.hits>1?`${item.hits}× erkannt`:'';
    node.querySelector('.security').textContent=item.probe?.encrypted?'geschützt':''; node.querySelector('.title').textContent=item.title||'Medienstream'; node.querySelector('.host').textContent=item.host||''; node.querySelector('.url').textContent=item.url; node.querySelector('.url').title=item.url;
    const qualityRow=node.querySelector('.qualityRow'), qualitySelect=node.querySelector('.qualitySelect'); const variants=item.probe?.variantOptions||[];
    const audioRow=node.querySelector('.audioRow'), audioSelect=node.querySelector('.audioSelect');
    const variantLabel=v=>[v.height?`${v.height}p`:(v.width?`${v.width}px`:''),v.bandwidth?`${(v.bandwidth/1_000_000).toFixed(v.bandwidth>=10_000_000?0:1)} Mbps`:'',v.frameRate?`${v.frameRate} fps`:''].filter(Boolean).join(' · ')||'Variante';
    const fillAudio=(selectedVariant='')=>{
      const chosen=variants.find(v=>v.uri===selectedVariant)||variants[0]||null;
      const all=item.probe?.allAudioTracks||item.probe?.audioTracks||[];
      const tracks=chosen?.audioGroup?all.filter(t=>t.groupId===chosen.audioGroup):all;
      audioSelect.textContent='';
      if(item.kind==='hls'&&tracks.length){ audioRow.hidden=false; for(const t of tracks){const o=document.createElement('option');o.value=t.key;o.textContent=[t.language||t.name,t.name&&t.name!==t.language?t.name:'',t.channels?t.channels+' ch':'',t.isDefault?'Standard':''].filter(Boolean).join(' · ');audioSelect.appendChild(o);} const remembered=audioSelections.get(item.id); const def=tracks.find(x=>x.isDefault)?.key||tracks[0]?.key||''; audioSelect.value=(remembered&&tracks.some(x=>x.key===remembered))?remembered:def; audioSelections.set(item.id,audioSelect.value); }
      else { audioRow.hidden=true; audioSelections.delete(item.id); }
    };
    if(item.kind==='hls'&&variants.length>1){ qualityRow.hidden=false; for(const v of variants){const o=document.createElement('option');o.value=v.uri;o.textContent=variantLabel(v);qualitySelect.appendChild(o);} const remembered=qualitySelections.get(item.id); const def=variants[0]?.uri||''; qualitySelect.value=(remembered&&variants.some(v=>v.uri===remembered))?remembered:def; qualitySelections.set(item.id,qualitySelect.value); node.querySelector('.qualityBadge').textContent=variantLabel(variants.find(v=>v.uri===qualitySelect.value)||variants[0]); qualitySelect.addEventListener('change',()=>{qualitySelections.set(item.id,qualitySelect.value);node.querySelector('.qualityBadge').textContent=variantLabel(variants.find(v=>v.uri===qualitySelect.value)||variants[0]);fillAudio(qualitySelect.value);}); fillAudio(qualitySelect.value); }
    else { const only=variants[0]?.uri||''; if(only)qualitySelections.set(item.id,only); fillAudio(only); }
    audioSelect.addEventListener('change',()=>audioSelections.set(item.id,audioSelect.value));
    const mediaType=node.querySelector('.mediaType'), nameTitle=node.querySelector('.nameTitle'), nameYear=node.querySelector('.nameYear'), nameSeason=node.querySelector('.nameSeason'), nameEpisode=node.querySelector('.nameEpisode'), movieNaming=node.querySelector('.movieNaming'), seriesNaming=node.querySelector('.seriesNaming'), filenamePreview=node.querySelector('.filenamePreview');
    const initialNaming={...(namingSelections.get(item.id)||item.naming||suggestNaming({mediaMeta:item.mediaMeta||{},title:item.title||''}))};
    namingSelections.set(item.id,initialNaming);
    mediaType.value=initialNaming.type==='series'?'series':'movie'; nameTitle.value=initialNaming.title||''; nameYear.value=initialNaming.year||''; nameSeason.value=initialNaming.season??''; nameEpisode.value=initialNaming.episode??'';
    const readNaming=()=>({type:mediaType.value==='series'?'series':'movie',title:nameTitle.value.trim(),year:nameYear.value.trim(),season:nameSeason.value,episode:nameEpisode.value});
    const refreshNaming=({save=true}={})=>{
      const naming=readNaming(); const isSeries=naming.type==='series'; movieNaming.hidden=isSeries; seriesNaming.hidden=!isSeries;
      const checked=validateNaming(naming); filenamePreview.dataset.valid=checked.ok?'true':'false'; filenamePreview.textContent=checked.ok?`Dateiname: ${buildMediaBasename(checked.value)}`:`Dateiname: ${filenamePreviewText(naming)}`;
      if(save)persistNaming(item.id,naming); else namingSelections.set(item.id,naming);
    };
    for(const el of [mediaType,nameTitle,nameYear,nameSeason,nameEpisode]){el.addEventListener(el===mediaType?'change':'input',()=>refreshNaming());}
    refreshNaming({save:false});
    const status=node.querySelector('.downloadStatus'), fill=node.querySelector('.progressFill'), progressText=node.querySelector('.progressText');
    const transferStats=node.querySelector('.transferStats'), networkStat=node.querySelector('.networkStat'), muxStat=node.querySelector('.muxStat');
    const entries=diagnosticEntries(item); const details=node.querySelector('.detailsToggle'), diagBox=node.querySelector('.diagnostics');
    const state=item.download?.state || (item.probeError?'warning':''); const dl=item.download||{};
    if(state){
      status.hidden=false; status.dataset.state=state;
      const visualProgress=state==='muxing'&&dl.muxProgress!==undefined?dl.muxProgress:(dl.downloadProgress!==undefined&&['downloading','ready','saving'].includes(state)?dl.downloadProgress:dl.progress);
      fill.style.width=`${Math.max(0,Math.min(100,Number(visualProgress||0)))}%`; progressText.textContent=dl.message||item.probeError||state; progressText.title=progressText.textContent;
      const networkBits=[]; if(dl.speedBps>0)networkBits.push(`Netzwerk ↓ ${fmtRate(dl.speedBps)}`); if(dl.segmentDone>0&&dl.segmentTotal>0)networkBits.push(`Download ${dl.segmentDone}/${dl.segmentTotal} Seg.`); if(dl.etaSeconds>0)networkBits.push(`ETA ${fmtEta(dl.etaSeconds)}`); else if(dl.etaPending&&state==='downloading')networkBits.push('ETA wird berechnet …'); if(dl.concurrency>0)networkBits.push(`Parallelität ${dl.concurrency}`); if(dl.activeRequests>0||dl.queuedRequests>0)networkBits.push(`${dl.activeRequests||0} aktiv${dl.queuedRequests>0?` · ${dl.queuedRequests} wartend`:''}`); if(dl.retries>0)networkBits.push(`${dl.retries} Retry${dl.retries===1?'':'s'}`); if(dl.exportBytes>0&&['ready','saving','export_error','complete'].includes(state))networkBits.push(`Fertige Datei ${fmtSize(dl.exportBytes)}`);
      const muxBits=[]; if(dl.phase==='streaming_mux'){muxBits.push(`Muxing ${Math.round(dl.muxProgress||0)}%${dl.muxSegmentTotal>0?` · ${dl.muxSegmentDone||0}/${dl.muxSegmentTotal} Seg.`:''}`);if(dl.bufferCapacity>0)muxBits.push(`Puffer ${dl.bufferPairs||0}/${dl.bufferCapacity}${dl.bufferedBytes>0?` · ${fmtSize(dl.bufferedBytes)}${dl.bufferMaxBytes>0?`/${fmtSize(dl.bufferMaxBytes)}`:''}`:''}`);} else if(state==='muxing'||dl.phase==='muxing')muxBits.push(`Muxing: ${Math.round(dl.muxProgress||0)}%`); if(dl.bottleneck)muxBits.push(`Engpass: ${dl.bottleneck}`);
      if(networkBits.length||muxBits.length){transferStats.hidden=false;networkStat.textContent=networkBits.join(' · ');networkStat.hidden=!networkBits.length;muxStat.textContent=muxBits.join(' · ');muxStat.hidden=!muxBits.length;}
    }
    if(entries.length){ details.hidden=false; fillDiagnostics(diagBox,entries); details.addEventListener('click',()=>{diagBox.hidden=!diagBox.hidden;details.textContent=diagBox.hidden?'Details anzeigen':'Details ausblenden';}); }
    const downloadButton=node.querySelector('.download');
    if(['queued','preparing','downloading','muxing','ready','saving'].includes(item.download?.state)){
      downloadButton.disabled=true;
      if(item.download?.state==='queued') downloadButton.textContent='In Warteschlange';
       else if(item.download?.state==='saving') downloadButton.textContent='Speichern …';
      else if(item.download?.state==='ready') downloadButton.textContent='Fertig …';
      else if(item.download?.state==='preparing') downloadButton.textContent='Bereitet vor …';
      else if(item.download?.state==='muxing') downloadButton.textContent=`Muxxt ${Math.round(item.download?.muxProgress??item.download?.progress??0)}%`;
      else downloadButton.textContent=`Lädt ${Math.round(item.download?.downloadProgress??item.download?.progress??0)}%`;
    }
    else if(item.download?.state==='export_error'&&item.download?.exportRetryAvailable) downloadButton.textContent='Speichern erneut versuchen';
    else if(item.download?.state==='complete') downloadButton.textContent='Erneut laden';
    downloadButton.addEventListener('click',async e=>{
      const b=e.currentTarget,old=b.textContent;
      if(item.download?.state==='export_error'&&item.download?.exportRetryAvailable&&item.download?.exportJobId){
        b.disabled=true;b.textContent='Speichern …';
        const r=await chrome.runtime.sendMessage({type:'sf_retry_export',jobId:item.download.exportJobId,tabId,candidateId:item.id});
        if(!r?.ok){alert(`Speichern konnte nicht erneut gestartet werden:\n${r?.error||'Unbekannter Fehler'}`);b.disabled=false;b.textContent=old;}
        else {b.textContent='Speichern …';setTimeout(load,250);}
        return;
      }
      const naming=readNaming(); const namingCheck=validateNaming(naming); if(!namingCheck.ok){alert(`Dateiname unvollständig:\n${namingCheck.error}`);return;} persistNaming(item.id,namingCheck.value);
      b.disabled=true;b.textContent=item.kind==='media'?'Speichern …':item.kind==='hls'?'HLS startet …':item.kind==='dash'?'DASH startet …':'Prüfe …';
      const candidateForDownload={...item,naming:namingCheck.value,selectedVariant:qualitySelections.get(item.id)||'',selectedAudio:audioSelections.get(item.id)||''};
      const r=await chrome.runtime.sendMessage({type:'sf_download',tabId,candidate:candidateForDownload});
      if(!r?.ok){ alert(`Download konnte nicht gestartet werden:\n${r?.error||'Unbekannter Fehler'}`); b.disabled=false;b.textContent=old; }
      else if(r.mode==='browser-hls'||r.mode==='browser-dash'){ b.textContent='Lädt 0%'; setTimeout(load,250); }
      else { b.textContent='Gestartet'; setTimeout(()=>{b.disabled=false;b.textContent=old},1600); }
    });
    node.querySelector('.open').addEventListener('click',async()=>{ const r=await chrome.runtime.sendMessage({type:'sf_open',candidate:item}); if(!r?.ok){await navigator.clipboard.writeText(item.url);alert('StreamForge konnte nicht geöffnet werden. Die URL wurde kopiert.');} });
    node.querySelector('.copy').addEventListener('click',async e=>{await navigator.clipboard.writeText(item.url);const b=e.currentTarget,old=b.textContent;b.textContent='Kopiert';setTimeout(()=>b.textContent=old,900)});
    node.querySelector('.remove').addEventListener('click',async()=>{await chrome.runtime.sendMessage({type:'sf_remove',tabId,id:item.id});await load()}); list.appendChild(node);
  }
}
async function enrichVisible({force=false}={}){
  if (enrichRunning) return;
  enrichRunning = true;
  let changed = false;
  try {
    const now = Date.now();
    const activeDownload = items.some(x => ['preparing','downloading','muxing','saving'].includes(x.download?.state));
    const pending = activeDownload ? [] : items.slice(0,12).filter(item => force ? !item.probe : shouldProbeNow(item, now));
    let cursor = 0;
    const workerCount = Math.min(3, pending.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        try {
          const r = await chrome.runtime.sendMessage({ type:'sf_probe', tabId, candidate:item, mode:'quick' });
          if (r?.ok && r.probe) { item.probe=r.probe; item.probeError=''; item.probeDiagnostic=null; item.probeRetryAfter=0; changed=true; }
          else if (r?.error) { item.probeError=r.error; item.probeDiagnostic=r.diagnostic||{code:'PROBE_FAILED',title:'Manifest-Analyse fehlgeschlagen',text:r.error}; item.probeRetryAfter=Date.now()+30_000; changed=true; }
        } catch (err) {
          item.probeError=String(err?.message||err); item.probeRetryAfter=Date.now()+30_000; changed=true;
        }
      }
    });
    await Promise.all(workers);
  } finally {
    enrichRunning = false;
    if (changed) requestRender();
  }
}

list.addEventListener('focusin',e=>{
  if(isNamingEditor(e.target)) renderGate.beginEdit();
});
list.addEventListener('focusout',e=>{
  if(isNamingEditor(e.target)) flushDeferredRender();
});
setInterval(()=>load().catch(()=>{}),1200);
document.querySelector('#clear').addEventListener('click',async()=>{if(!Number.isInteger(tabId))return;await chrome.runtime.sendMessage({type:'sf_clear',tabId});await load()});document.querySelector('#refresh').addEventListener('click',()=>load({forceProbe:true}));filter.addEventListener('change',render);load();
