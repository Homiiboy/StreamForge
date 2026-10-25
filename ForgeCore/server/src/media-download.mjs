import {safeFetch,safeStream,parseWebUrl} from './source-security.mjs';
import {prepareStaging,cacheSegments,cleanupTransferStaging} from './transfer-recovery.mjs';
import {parseHls,parseDash} from './source-adapters.mjs';
import {mkdir,mkdtemp,open,rm,stat,lstat,link,unlink} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,relative,sep,extname} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {mediaRelative,mediaBaseName,ensureWithin} from './library.mjs';
import {germanAudioDecision,NOT_GERMAN} from './german-language.mjs';
const MAX_SEGMENT=48*1024*1024;
const MAX_MEDIA=12*1024*1024*1024;
const MAX_SEGMENTS=4000;
function ensureNotAborted(signal){if(signal?.aborted)throw Object.assign(Error('Download aborted'),{code:'ABORT_ERR'});}
export async function fetchManifest(url,fetcher=safeFetch,depth=0,language='de'){
 if(depth>2)throw Error('Too many nested HLS playlists');
 const response=await fetcher(url,{maxBytes:4*1024*1024});
 const finalUrl=response.url||url;
 const text=response.body.toString('utf8');
 if(finalUrl.toLowerCase().split('?')[0].endsWith('.mpd')||/<MPD\b/.test(text))return {url:finalUrl,...parseDash(text,finalUrl)};
 const hls=parseHls(text,finalUrl);
 if(hls.kind==='master'){
  if(!hls.variants.length)throw Error('Empty HLS master playlist');
  const variant=hls.variants[0];
  const video=await fetchManifest(variant.url,fetcher,depth+1,language);
  const available=(hls.audioGroups||[]).filter(x=>x.group===variant.audioGroup);
  if(!available.length){if((hls.audioGroups||[]).length)throw Error(NOT_GERMAN+' (Audio-Gruppe nicht zuordenbar)');return video;}
  const matching=available.find(x=>x.language.toLowerCase()===language.toLowerCase())
    ||available.find(x=>x.language.toLowerCase().split('-')[0]===language.toLowerCase().split('-')[0])
    ; // No fallback to English/default audio.
  if(!matching)throw Error(NOT_GERMAN+' (HLS-Master enthält keine deutsche Audiospur)');
  const track=await fetchManifest(matching.url,fetcher,depth+1,language);
  if(track.kind!=='hls'||video.kind!=='hls')throw Error('Invalid separate HLS audio track');
  return {...video,audioSegments:[...(track.init?[track.init]:[]),...track.segments],audioLanguage:matching.language};
 }
 return {url:finalUrl,...hls};
}
async function writeParts(destination,parts,{fetcher=safeFetch,signal,onProgress=()=>{},budget=MAX_MEDIA,rateLimitBytesPerSecond=0}={}){
 if(!parts.length||parts.length>MAX_SEGMENTS+1)throw Error('Invalid segment count');
 let bytes=0;const startedAt=Date.now();
 const fd=await open(destination,'wx',0o600);
 try{
  for(let i=0;i<parts.length;i++){
   ensureNotAborted(signal);
   const maxBytes=parts.length===1?budget:MAX_SEGMENT;
   const write=async body=>{bytes+=body.length;if(bytes>budget)throw Error('Media exceeds configured size limit');
     let cursor=0;while(cursor<body.length){const {bytesWritten}=await fd.write(body,cursor,body.length-cursor,null);if(bytesWritten<=0)throw Error('Incomplete segment write');cursor+=bytesWritten;}if(rateLimitBytesPerSecond>0){
       // Pace network reads without buffering media in RAM. Clamp each sleep and recheck.
       while(true){ensureNotAborted(signal);
        const delayMs=Math.ceil(bytes/rateLimitBytesPerSecond*1000-(Date.now()-startedAt));
        if(delayMs<=0)break;
        await sleep(Math.min(delayMs,30000),undefined,{signal});
       }
     }};
   let segmentBytes=0;
   if(fetcher===safeFetch){
     await safeStream(parts[i],{maxBytes,signal,onChunk:async body=>{segmentBytes+=body.length;await write(body)}});
   }else{
     const {body}=await fetcher(parts[i],{maxBytes,signal});
     if(body?.length){segmentBytes=body.length;await write(body)}
   }
   if(!segmentBytes)throw Error('Empty media segment '+(i+1));
   await onProgress({segments:i+1,total:parts.length,bytes});
  }
 }finally{await fd.close()}
 return bytes;
}
async function ffmpegRemux(inputs,output,{signal,ffmpeg='ffmpeg',timeoutMs=45*60*1000}={}){
 ensureNotAborted(signal);
 const args=['-hide_banner','-loglevel','error','-nostdin','-y'];
 for(const input of inputs)args.push('-i',input);
 if(inputs.length>1)args.push('-map','0:v:0','-map','1:a:0');
 args.push('-c','copy','-movflags','+faststart',output);
 await new Promise((resolve,reject)=>{
  const child=spawn(ffmpeg,args,{stdio:['ignore','ignore','pipe']});let stderr='';
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
  const abort=()=>child.kill('SIGKILL');signal?.addEventListener('abort',abort,{once:true});
  child.stderr.on('data',x=>{stderr=(stderr+x.toString()).slice(-4096)});
  child.once('error',e=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(e)});
  child.once('close',(code)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);code===0?resolve():reject(Error('Media mux failed: '+(stderr.slice(-500)||'ffmpeg exited '+code)))});
 });
 ensureNotAborted(signal);
 const s=await stat(output);if(s.size<1024)throw Error('Muxed media file is unexpectedly small');
}
export async function verifyMediaTracks(filename,{signal,ffprobe='ffprobe',timeoutMs=60000}={}){
 ensureNotAborted(signal);
 const output=await new Promise((resolve,reject)=>{
  const child=spawn(ffprobe,['-v','error','-show_entries','stream=codec_type,codec_name:stream_tags=language:format=duration','-of','json',filename],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value)};
  const abort=()=>child.kill('SIGKILL');signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
  child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(stdout.length>65536)child.kill('SIGKILL')});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-2000)});
  child.once('error',error=>finish(error));
  child.once('close',code=>code===0?finish(null,stdout):finish(Error('ffprobe failed: '+stderr.slice(-250))));
 });
 ensureNotAborted(signal);
 let data;try{data=JSON.parse(output)}catch{throw Error('Invalid ffprobe result')}
 const video=data.streams?.filter(x=>x.codec_type==='video'&&x.codec_name&&x.codec_name!=='unknown')||[];
 if(video.length===0)throw Error('Output has no valid video stream');
 const duration=Number(data.format?.duration||0);
 if(!Number.isFinite(duration)||duration<0.1)throw Error('Invalid or missing media duration');
 return {videoStreams:video.length,audioStreams:(data.streams||[]).filter(x=>x.codec_type==='audio').length,duration,streams:data.streams||[]};
}

export async function safePublish(from,root,media,episode,{signal}={}){
 const {previewLibrary}=await import('./library.mjs');
 const preview=await previewLibrary(root,media,episode);
 if(preview.exists)throw Error('Jellyfin file already exists: '+preview.files.join(', '));
 const sub=preview.directory||mediaRelative(media,episode);
 const targetDir=ensureWithin(root,join(root,sub));
 // The media root and each child directory must be real directories, not symlinks.
 await verifyDirectoryChain(root,targetDir);
 const basename=mediaBaseName(media,episode);
 const target=ensureWithin(root,join(targetDir,basename+'.mp4'));
 // Never silently replace a title with a different extension.
 const temp=join(targetDir,'.forgecore-'+randomUUID()+'.part');
 let copied=0;
 try{
  const out=await open(temp,'wx',0o600);
  try{
   const input=await open(from,'r');
   try{
    const buffer=Buffer.allocUnsafe(4*1024*1024);
    while(true){ensureNotAborted(signal);const {bytesRead}=await input.read(buffer,0,buffer.length,null);if(!bytesRead)break;await out.writeFile(buffer.subarray(0,bytesRead));copied+=bytesRead;if(copied>MAX_MEDIA)throw Error('File exceeds media limit');}
   }finally{await input.close()}
   await out.sync();
  }finally{await out.close()}
  if(copied<1024)throw Error('Media file too small');
  await link(temp,target); // exclusive atomic commit; EEXIST rejects
  return {path:relative(resolve(root),target).split(sep).join('/'),bytes:copied};
 }finally{await unlink(temp).catch(()=>{})}
}
async function verifyDirectoryChain(root,destination){
 const base=resolve(root),rel=relative(base,resolve(destination));
 if(rel==='..'||rel.startsWith('..'+sep))throw Error('Folder outside library');
 let dir=base;const rootStat=await lstat(base);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw Error('Media root is not a real directory');
 for(const part of rel.split(sep).filter(Boolean)){
  dir=join(dir,part);
  try{const s=await lstat(dir);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Unsafe library directory: '+part)}
  catch(e){if(e.code!=='ENOENT')throw e;await mkdir(dir,{mode:0o755})}
 }
}
async function assertMp4Signature(filename){
 const file=await open(filename,'r');
 try{
  const head=Buffer.alloc(12);
  const {bytesRead}=await file.read(head,0,12,0);
  if(bytesRead<12||head.toString('ascii',4,8)!=='ftyp')throw Error('Invalid MP4 media signature; refusing HTML or unrelated content');
 }finally{await file.close()}
}
export async function downloadMedia({sourceUrl,media,episode=null,root,fetcher=safeFetch,signal,onProgress,ffmpeg='ffmpeg',rateLimitBytesPerSecond=0,jobId=null,verifyCodecs=true,language='de'}={}){
 if(!root)throw Error('Jellyfin media root is not configured');
 if(!Number.isFinite(rateLimitBytesPerSecond)||rateLimitBytesPerSecond<0||rateLimitBytesPerSecond>52428800)throw Error('Invalid transfer bandwidth');
 const uri=parseWebUrl(sourceUrl);
 const staging=jobId?await prepareStaging(process.env.FORGECORE_STAGING_ROOT||tmpdir(),jobId):await mkdtemp(join(process.env.FORGECORE_STAGING_ROOT||tmpdir(),'forgecore-transfer-'));
 let completed=false;
 try{
  const kind=uri.pathname.toLowerCase();
  let video=join(staging,'video.data'),audio='',output=join(staging,'output.mp4'),manifestLanguage='';
  if(kind.endsWith('.m3u8')||kind.endsWith('.mpd')){
   const manifest=await fetchManifest(sourceUrl,fetcher,0,'de');
   manifestLanguage=manifest.audioLanguage||'';
   if(manifest.kind==='hls'){
    await cacheSegments({staging,track:'video',urls:[...(manifest.init?[manifest.init]:[]),...manifest.segments],fetcher,signal,onProgress,rateLimitBytesPerSecond});
    if(manifest.audioSegments?.length){audio=join(staging,'audio.data');await cacheSegments({staging,track:'audio',urls:manifest.audioSegments,fetcher,signal,onProgress,rateLimitBytesPerSecond});}
   }else if(manifest.kind==='dash'){
    await cacheSegments({staging,track:'video',urls:[manifest.video.init,...manifest.video.segments],fetcher,signal,onProgress,rateLimitBytesPerSecond});
    if(manifest.audio){audio=join(staging,'audio.data');await cacheSegments({staging,track:'audio',urls:[manifest.audio.init,...manifest.audio.segments],fetcher,signal,onProgress,rateLimitBytesPerSecond});}
   }else throw Error('Unsupported media format');
   await ffmpegRemux(audio?[video,audio]:[video],output,{signal,ffmpeg});
  }else if(/\.(?:mp4|m4v)$/i.test(kind)){
   await cacheSegments({staging,track:'video',urls:[sourceUrl],fetcher,signal,onProgress,rateLimitBytesPerSecond});
   // Native MP4 is copied without re-encoding.
   output=video;
  }else throw Error('Only supported HLS, DASH, or direct MP4 URLs are accepted');
  const final=await stat(output);if(final.size<1024)throw Error('Output media invalid: too small');
  await assertMp4Signature(output);
  if(fetcher===safeFetch||verifyCodecs){
   // Mandatory in production; verify before any file reaches Jellyfin.
   const checked=await verifyMediaTracks(output,{signal,ffprobe:process.env.FORGECORE_FFPROBE||'ffprobe'});
   const german=germanAudioDecision({streams:checked.streams,manifestLanguage});
   if(!german.german)throw Error(german.reason);
  }
  const result=await safePublish(output,root,media,episode,{signal});
  completed=true;return result;
 }finally{if(completed||!jobId)await rm(staging,{recursive:true,force:true})}
}
