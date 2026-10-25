// ForgeCore v1.5.2: reuse saved, enabled website catalogue with exact episode mapping.
// The only accepted download sources are direct media links re-discovered on the server.
import {one,rows,newId,utc} from './db.mjs';
import {discoverDetail} from './discover.mjs';
import {validId,validKind,validSeason} from './discover-metadata.mjs';
import {discoverEpisodePlan} from './discover-state.mjs';
import {searchSites} from './site-search.mjs';
import {inspectGermanSource,NOT_GERMAN} from './german-language.mjs';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const direct=href=>{try{return /\.(?:mp4|m4v|m3u8|mpd)$/i.test(new URL(href).pathname)}catch{return false}};
function validateRequest(raw){
 const kind=validKind(raw.kind),id=validId(raw.id);
 let season=null,episode=null;
 if(kind==='tv'){
  season=validSeason(raw.season);
  episode=Number(raw.episode);
  if(!Number.isInteger(episode)||episode<1||episode>9999)fail('Ungültige Episodennummer');
 }
 return {kind,id,season,episode};
}
function matchResult(item,request){
 if(item.kind!=='media'||!direct(item.url))return false;
 // A series download is never mapped on a title-only URL or guessed from unrelated episodes.
 if(request.kind==='tv')return item.season===request.season&&item.episode===request.episode;
 return item.season==null&&item.episode==null;
}
const externalId=({kind,id})=>'tmdb:'+kind+':'+id;
function mediaFor(db,req){return one(db,'SELECT * FROM media WHERE external_id=?',externalId(req))}
async function discoverCandidates(db,request,{token,discoverFetch,sourceFetch,max=16}={}){
 const detail=await discoverDetail({kind:request.kind,id:request.id,token,...(discoverFetch?{fetcher:discoverFetch}:{})});
 const searches=await searchSites(db,detail.title,sourceFetch?{fetcher:sourceFetch}:{});
 const candidates=searches.results.filter(item=>matchResult(item,request)).slice(0,max);
 return {detail,searches,candidates};
}
export async function discoverDownloadSources(db,raw,{token,discoverFetch,sourceFetch,languageFetch}={}){
 const request=validateRequest(raw);
 const {detail,searches,candidates}=await discoverCandidates(db,request,{token,discoverFetch,sourceFetch});
 const results=[];
 for(const c of candidates){
  const inspection=await inspectGermanSource(c.url,languageFetch?{fetcher:languageFetch}:{});
  results.push({url:c.url,siteId:c.siteId,siteLabel:c.siteLabel,kind:c.kind,season:c.season,episode:c.episode,
   language:inspection.state,languageReason:inspection.reason||'Deutsch in der Playlist ausgewiesen',
   canAttempt:inspection.state==='german'||inspection.state==='unverified'});
 }
 const project=mediaFor(db,request);
 return {title:detail.title,kind:request.kind,season:request.season,episode:request.episode,mediaId:project?.id||null,
  checkedSites:searches.checked,results,errors:searches.errors.slice(0,10),warnings:searches.warnings.slice(0,10),
  germanOnly:true,notice:results.some(r=>r.language==='german')?'Deutsche Tonspur laut Playlist vorhanden. Endgültige Prüfung vor Jellyfin-Import.':
   NOT_GERMAN+' – keine bestätigte deutsche Quelle gefunden. Quellen ohne Sprachangabe können nur unter Vorbehalt geprüft werden.'};
}
export async function queueDiscoverDownload(db,transfers,raw,{token,discoverFetch,sourceFetch,languageFetch,jellyfinFetch}={}){
 const request=validateRequest(raw);
 if(raw.confirm!=='DOWNLOAD_GERMAN')fail('Download muss ausdrücklich bestätigt werden');
 if(typeof raw.url!=='string'||raw.url.length>2048||typeof raw.siteId!=='string')fail('Quelle ungültig');
 const project=mediaFor(db,request);
 if(!project)fail('Titel zunächst zur ForgeCore-Bibliothek hinzufügen',409);
 if(request.kind==='tv'){
  const plan=await discoverEpisodePlan(db,{id:request.id,season:request.season},{token,fetcher:discoverFetch,jellyfinFetch});
  const ep=plan.episodes.find(x=>x.episode===request.episode);
  if(!ep)fail('Episode nicht von TMDB bestätigt',404);
  if(ep.state==='in-jellyfin'||ep.state==='available'||ep.state==='ignored'||ep.state==='queued')fail('Episode ist bereits vorhanden, ignoriert oder eingeplant',409);
  const local=one(db,'SELECT id,status FROM episodes WHERE media_id=? AND season=? AND episode=?',project.id,request.season,request.episode);
  if(!local)fail('Episode zunächst über Discover vormerken',409);
  if(local.status!=='missing')fail('Nur fehlende Episoden dürfen heruntergeladen werden',409);
 }
 const {candidates}=await discoverCandidates(db,request,{token,discoverFetch,sourceFetch});
 const selected=candidates.find(x=>x.url===raw.url&&x.siteId===raw.siteId);
 if(!selected)fail('Quelle nicht im gespeicherten Website-Katalog nachgewiesen',409);
 const inspection=await inspectGermanSource(selected.url,languageFetch?{fetcher:languageFetch}:{});
 if(inspection.state==='not-german')fail(NOT_GERMAN,409);
 if(inspection.state==='unsupported')fail('Downloadquelle nicht unterstützt',409);
 // A language-undetermined MP4/HLS may be downloaded only as an explicitly
 // confirmed attempt. Production ffprobe verification blocks publication.
 if(inspection.state==='unverified'&&raw.confirmUnknownGerman!==true)
  fail(NOT_GERMAN+' – Sprache ist nicht bestätigt. Sprachprüfung des Downloads ausdrücklich erlauben.',409);
 const existing=one(db,'SELECT id FROM sources WHERE media_id=? AND url=? AND enabled=1',project.id,selected.url);
 let sourceId=existing?.id;
 if(!sourceId){
  sourceId=newId();
  try{db.prepare('INSERT INTO sources(id,media_id,url,label,enabled,created_at,updated_at) VALUES(?,?,?,?,1,?,?)')
   .run(sourceId,project.id,selected.url,selected.siteLabel+' · Discover (Deutsch prüfen)',utc(),utc())}
  catch(e){if(e.code!=='ERR_SQLITE_CONSTRAINT_UNIQUE')throw e;sourceId=one(db,'SELECT id FROM sources WHERE media_id=? AND url=?',project.id,selected.url)?.id}
 }
 const local=request.kind==='tv'?one(db,'SELECT id FROM episodes WHERE media_id=? AND season=? AND episode=?',project.id,request.season,request.episode):null;
 const job=transfers.enqueue({mediaId:project.id,episodeId:local?.id||null,sourceId});
 return {item:job,language:inspection.state,notice:inspection.state==='unverified'?'Sprachprüfung ausstehend: Import wird abgebrochen, falls keine deutsche Audiospur nachgewiesen wird.':'Deutsche Tonspur laut Playlist bestätigt; endgültige Medienprüfung vor Import.'};
}
