// ForgeCore v1.7: internal, opt-in browser media observation.
// Scans must refer to catalog pages of saved, enabled websites.
import {randomUUID} from 'node:crypto';
import {one} from './db.mjs';
import {parseWebUrl} from './source-security.mjs';
import {discoverDownloadSources,queueDiscoverDownload} from './discover-download.mjs';
import {inspectGermanSource} from './german-language.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const TIMEOUT=65000,HEALTH_TIMEOUT=4500,SCAN_TTL=8*60*1000,MAX_SCANS=20;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// A single ForgeCore process schedules Browser-Agent analyses serially. A
// bounded queue prevents competing POST /inspect calls and false offline UI.
// Rejected jobs never block subsequent tasks.
export class BrowserScanCoordinator{
 constructor({capacity=6}={}){this.capacity=capacity;this.pending=0;this.active=false;this.tail=Promise.resolve()}
 status(){return {busy:this.active,queued:Math.max(0,this.pending-(this.active?1:0)),capacity:this.capacity}}
 run(fn){
  if(this.pending>=this.capacity)fail('Browser-Warteschlange voll. Bitte später erneut versuchen.',429);
  this.pending++;
  const task=async()=>{
   this.active=true;
   try{return await fn()}
   finally{this.pending--;this.active=false}
  };
  const job=this.tail.then(task,task);
  this.tail=job.then(()=>{},()=>{});
  return job;
 }
}
function requestFrom(body){
 if(!body||!['tv','movie'].includes(body.kind)||!Number.isSafeInteger(Number(body.id))||Number(body.id)<=0)fail('Ungültiger Film/Serien-Identifikator');
 if(body.kind==='tv'&&(!Number.isInteger(body.season)||body.season<0||body.season>999||!Number.isInteger(body.episode)||body.episode<1||body.episode>9999))fail('Ungültige Staffel oder Folge');
 return {kind:body.kind,id:Number(body.id),...(body.kind==='tv'?{season:body.season,episode:body.episode}:{})};
}
const agentUrl=()=>String(process.env.FORGECORE_BROWSER_AGENT_URL||'http://forgecore-browser:8790').replace(/\/$/,'');
async function agent(path,opts={},{fetcher=fetch,sleep=pause}={}){
 const health=path==='/health',maxAttempts=health?1:3;
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),health?HEALTH_TIMEOUT:TIMEOUT);
  try{
   const response=await fetcher(agentUrl()+path,{...opts,signal:controller.signal,headers:{...(opts.headers||{}),'accept':'application/json'}});
   const data=await response.json();
   if(response.ok)return data;
   if(response.status===429&&!health&&attempt<maxAttempts){await sleep(attempt*700);continue}
   const message=response.status===429?'Browser-Agent ist beschäftigt. Bitte erneut versuchen.':
    response.status>=500?'Browser-Agent meldet einen Verarbeitungsfehler. Container-Logs prüfen.':
    String(data.error||'Browseranalyse nicht möglich').slice(0,180);
   fail(message,response.status===429?429:response.status>=500?502:response.status);
  }catch(e){
   if(e.status)throw e;
   if(controller.signal.aborted)fail('Browser-Agent hat das Zeitlimit überschritten. Container-Logs prüfen.',504);
   fail('Keine Verbindung zum Browser-Agent. ZimaOS-Container und internes Netzwerk prüfen.',503);
  }finally{clearTimeout(timeout)}
 }
 fail('Browser-Agent bleibt beschäftigt. Bitte erneut versuchen.',429);
}
export async function browserAgentStatus({coordinator=null,...opts}={}){
 const local=coordinator?.status()||{busy:false,queued:0,capacity:6};
 try{
  const r=await agent('/health',{},opts);
  return {configured:true,online:!!r.ok,busy:!!r.busy||local.busy,queued:local.queued,capacity:local.capacity,state:local.busy||r.busy?'busy':'ready'};
 }catch(e){
  return {configured:true,online:false,busy:local.busy,queued:local.queued,capacity:local.capacity,state:'offline',errorCode:e.status||503};
 }
}
export class BrowserScanSession{
 constructor(){this.scans=new Map();this.coordinator=new BrowserScanCoordinator()}
 prune(){
  for(const [id,scan] of this.scans)if(scan.expires<=Date.now())this.scans.delete(id);
  while(this.scans.size>=MAX_SCANS)this.scans.delete(this.scans.keys().next().value);
 }
 async scan(db,body,{token,discoverFetch,sourceFetch,languageFetch,agentFetch}={}){
  if(body.confirm!=='SCAN_MEDIA')fail('Browseranalyse ausdrücklich bestätigen');
  const request=requestFrom(body),siteId=String(body.siteId||''),url=String(body.url||'');
  const site=one(db,'SELECT id,url,enabled FROM search_sites WHERE id=? AND enabled=1',siteId);
  if(!site)fail('Gespeicherte Website nicht gefunden',404);
  let requested,root;try{requested=parseWebUrl(url);root=parseWebUrl(site.url)}catch{fail('Unsichere Episodenadresse')}
  if(requested.origin!==root.origin||requested.protocol!=='https:')fail('Browseranalyse nur für eigene konfigurierte HTTPS-Websites');
  const catalog=await discoverDownloadSources(db,request,{token,discoverFetch,sourceFetch,languageFetch});
  const matched=catalog.catalogHits.find(x=>x.url===requested.href&&x.siteId===siteId&&
   (request.kind==='tv'?x.exactEpisode:x.exactMovie));
  if(!matched)fail('Episode/Film ist keiner eindeutigen Katalogseite zugeordnet',409);
  // Never allow two simultaneous Chromium analyses in the same ForgeCore
  // instance. A busy agent is queued rather than incorrectly called offline.
  const analysis=await this.coordinator.run(()=>agent('/inspect',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({url:requested.href,autoPlay:true,waitMs:10000})
  },agentFetch?{fetcher:agentFetch}:{}));
  this.prune();
  const scanId=randomUUID(),sources=[];
  for(const source of (analysis.sources||[]).slice(0,12)){
   let candidate;
   try{candidate=parseWebUrl(source.url);if(candidate.protocol!=='https:'||!/\.(?:mp4|m4v|m3u8|mpd)$/i.test(candidate.pathname))continue}catch{continue}
   const inspected=await inspectGermanSource(candidate.href,languageFetch?{fetcher:languageFetch}:{});
   sources.push({id:randomUUID(),url:candidate.href,host:candidate.hostname,format:source.format||'media',
    language:inspected.state,reason:inspected.reason||'Deutsch in Playlist-Metadaten ausgewiesen',
    canQueue:['german','unverified'].includes(inspected.state)});
  }
  this.scans.set(scanId,{expires:Date.now()+SCAN_TTL,request,siteId,url:requested.href,sources});
  return {scanId,expiresInSeconds:SCAN_TTL/1000,agentState:analysis.state,playAttempts:analysis.playAttempts,
   blockedRequests:analysis.blockedRequests,diagnostics:analysis.diagnostics||null,
   warning:analysis.warning||[],
   sources:sources.map(x=>({id:x.id,host:x.host,format:x.format,language:x.language,reason:x.reason,canQueue:x.canQueue})),
   notice:analysis.note||'Browseranalyse abgeschlossen; Sprachnachweis und Download getrennt prüfen.'};
 }
 async enqueue(db,transfers,body,opts={}){
  if(body.confirm!=='DOWNLOAD_GERMAN')fail('Download muss ausdrücklich bestätigt werden');
  this.prune();
  const scan=this.scans.get(body.scanId),c=scan?.sources.find(x=>x.id===body.candidateId);
  if(!scan||!c)fail('Browserprüfung abgelaufen. Bitte neu scannen.',409);
  if(!c.canQueue)fail('Quelle nicht für einen Download geeignet',409);
  const result=await queueDiscoverDownload(db,transfers,{
   ...scan.request,siteId:scan.siteId,url:c.url,confirm:'DOWNLOAD_GERMAN',
   confirmUnknownGerman:body.confirmUnknownGerman===true
  },{...opts,trustedCandidate:{url:c.url,siteId:scan.siteId,kind:'media',
    season:scan.request.season??null,episode:scan.request.episode??null}});
  this.scans.delete(body.scanId);return result;
 }
}
