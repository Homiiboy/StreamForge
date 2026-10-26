import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {withDatabaseSnapshot} from './database-backup.mjs';
import {cleanOldStaging} from './transfer-recovery.mjs';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {openDatabase,newId,utc,rows,one,transaction} from './db.mjs';
import {isSetup,setupAdmin,verifyAdmin,createSession,readSession,deleteSession,checkCsrf,sessionCookie,clearCookie} from './auth.mjs';
import {checkMediaRoot,previewLibrary} from './library.mjs';
import {JobQueue} from './queue.mjs';
import {TransferQueue} from './transfer-queue.mjs';
import {SourceAutomation} from './source-automation.mjs';
import {validateSearchSite,searchSites} from './site-search.mjs';
import {inspectPlayerPage} from './player-bridge.mjs';
import {discoverCatalog,discoverDetail,hasDiscoverToken} from './discover.mjs';
import {discoverMetadata,discoverSeason,validKind,validId,validSeason} from './discover-metadata.mjs';
import {discoverWatchlist,watchlistSave,watchlistRemove,watchlistMonitor,discoverJellyfinPreview,discoverEpisodePlan,applyDiscoverEpisodePlan,checkDiscoverRadar} from './discover-state.mjs';
import {discoverDownloadSources,queueDiscoverDownload,checkGermanAvailabilityRadar} from './discover-download.mjs';
import {BrowserScanSession,browserAgentStatus} from './browser-scanner.mjs';
import {inspectCatalog,catalogJellyfinPreview} from './catalog-inspect.mjs';
import {seriesOverview,importJellyfinSeries} from './series-overview.mjs';
import {parseWebUrl} from './source-security.mjs';
import {analyzeSource,SOURCE_ADAPTERS,selectSourceAdapter} from './source-adapters.mjs';
import {saveJellyfin,getJellyfinStatus,jellyfinTest,jellyfinRefresh} from './jellyfin.mjs';
import {jellyfinInventory,reconcilePreview,applyReconciliation,recentJellyfinSync} from './jellyfin-sync.mjs';
import {loadSchedule,setSchedule,sourceRanking,missingEpisodePlan,addNotification,listNotifications,markNotificationRead,diagnostics} from './phase3.mjs';
import {downloadSubtitle,normalizeLanguage} from './subtitles.mjs';
import {operationalStatus,diagnosticEvents} from './operations.mjs';

export const APP_NAME='ForgeCore';
export const APP_VERSION='1.7.3';
const staticDir=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
const MAX_BODY=64*1024;
const limitText=(v,max=150)=>typeof v==='string'?v.trim().slice(0,max):'';
function fail(message,status=400){throw Object.assign(Error(message),{status});}
function idCheck(value){if(!/^[0-9a-f-]{36}$/.test(value||''))fail('Invalid ID');return value;}
function mediaInput(body){
 const kind=body.kind;
 if(!['movie','series'].includes(kind))fail('Kind must be movie or series');
 const title=limitText(body.title,140);
 if(!title)fail('Title required');
 const year=body.year==null||body.year===''?null:Number(body.year);
 if(year!==null&&(!Number.isInteger(year)||year<1888||year>2200))fail('Invalid year');
 return {kind,title,year,external_id:limitText(body.external_id,120)||null,notes:limitText(body.notes,2000)};
}
function episodeInput(body){
 const season=Number(body.season),episode=Number(body.episode);
 if(!Number.isInteger(season)||season<0||season>999||!Number.isInteger(episode)||episode<0||episode>9999)fail('Invalid season or episode number');
 return {season,episode,title:limitText(body.title,140)};
}
async function readJson(req,maxSize=MAX_BODY){
 if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))fail('Content-Type must be application/json',415);
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>maxSize)fail('Request body too large',413);chunks.push(chunk);}
 try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||Array.isArray(body)||typeof body!=='object')throw Error();return body;}catch{fail('Malformed JSON');}
}
function response(res,status,data,headers={}){
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY',...headers});
 res.end(JSON.stringify(data));
}
function publicStatus(db){return {service:APP_NAME,version:APP_VERSION,phase:'v1-release-pending-hardware-validation',configured:isSetup(db),capabilities:{health:true,mediaProjects:true,episodes:true,sourceAdapters:true,downloads:true,jellyfinExport:true,planner:true,scheduling:true,notifications:true,externalWebvtt:true,sourceAutomation:true,jellyfinApi:true,sourceAdapterSelection:true,operations:true,discover:true,discoverDownloads:true,browserAgent:true,germanOnly:true,discoverDetails:true,discoverJellyfin:true,discoverWatchlist:true,discoverEpisodePlan:true,lifecycleBackup:true,libraryPreview:true,backgroundJobs:true,metadataManual:true}};}
export function createApp({dbPath=':memory:',mediaRoot='',startWorker=true,staticFiles=true,sourceFetch,languageFetch,browserAgentFetch,download,subtitleFetch,jellyfinFetch,discoverFetch,tvmazeFetch,tmdbToken=process.env.FORGECORE_TMDB_TOKEN,automationInterval=60000}={}){
 const db=openDatabase(dbPath);
 const browserScans=new BrowserScanSession();
 const queue=new JobQueue(db,{mediaRoot});
 const transfers=new TransferQueue(db,{mediaRoot,...(download?{download}:{})});
 const automation=new SourceAutomation(db,{transfers,fetcher:sourceFetch,interval:automationInterval});
 if(startWorker){
  void cleanOldStaging(process.env.FORGECORE_STAGING_ROOT||'/data',db).catch(error=>process.stderr.write('Recovery cleanup warning: '+error.message+'\n'));
  queue.start();transfers.start();automation.start();
 }
 const radarParams={token:tmdbToken,...(discoverFetch?{fetcher:discoverFetch}:{}),...(tvmazeFetch?{tvmazeFetch}:{})};
 let radarTask=null;
 const runRadar=()=>radarTask||(radarTask=(async()=>{
  const releases=await checkDiscoverRadar(db,radarParams);
  const german=await checkGermanAvailabilityRadar(db,transfers,{...radarParams,discoverFetch,sourceFetch,languageFetch,jellyfinFetch});
  return {...releases,german};
 })().finally(()=>{radarTask=null;}));
 const radarTimer=startWorker&&hasDiscoverToken(tmdbToken)?setInterval(()=>{void runRadar().catch(e=>process.stderr.write('Discover radar: '+e.message+'\n'));},6*60*60*1000):null;
 radarTimer?.unref();
 const authAttempts=new Map();
 const gate=(req)=>{
  const origin=req.headers.origin;
  if(origin){let parsed;try{parsed=new URL(origin);}catch{fail('Forbidden origin',403);}
   if(parsed.host!==req.headers.host||!['http:','https:'].includes(parsed.protocol))fail('Forbidden origin',403);
  }
 };
 const handler=async(req,res)=>{
  try{
   const url=new URL(req.url||'/', 'http://localhost');const path=url.pathname;
   const method=req.method||'GET';const write=method!=='GET'&&method!=='HEAD';
   if(write)gate(req);
   if(method==='GET'&&path==='/api/health')return response(res,200,{ok:true,service:APP_NAME,version:APP_VERSION});
   if(method==='GET'&&path==='/api/status')return response(res,200,publicStatus(db));
   if(method==='GET'&&path==='/api/setup/status')return response(res,200,{configured:isSetup(db)});
   if(path==='/api/setup'&&method==='POST'){
    if(req.headers['x-forgecore-request']!=='1')fail('Missing request header',403);
    if(isSetup(db))fail('Already configured',409);
    const b=await readJson(req);setupAdmin(db,b.password);
    return response(res,201,{ok:true});
   }
   if(path==='/api/auth/login'&&method==='POST'){
    if(req.headers['x-forgecore-request']!=='1')fail('Missing request header',403);
    const address=req.socket.remoteAddress||'unknown';const now=Date.now();
    const attempt=authAttempts.get(address)||{count:0,until:now+15*60*1000};
    if(now>attempt.until){attempt.count=0;attempt.until=now+15*60*1000;}
    if(attempt.count>=8)fail('Too many login attempts',429);
    const b=await readJson(req);
    if(!verifyAdmin(db,b.password)){attempt.count++;authAttempts.set(address,attempt);fail('Invalid credentials',401);}
    authAttempts.delete(address);
    const session=createSession(db);
    return response(res,200,{ok:true,csrf:session.csrf},{'set-cookie':sessionCookie(session.token,process.env.FORGECORE_SECURE_COOKIE==='1')});
   }
   const session=readSession(db,req);
   if(path==='/api/me'&&method==='GET')return response(res,200,{authenticated:!!session,configured:isSetup(db),csrf:session?.csrf||null});
   if(path.startsWith('/api/')&&!session)fail('Login required',401);
   if(path.startsWith('/api/')&&write)checkCsrf(req,session);
   if(path==='/api/auth/logout'&&method==='POST'){
    deleteSession(db,session);
    return response(res,200,{ok:true},{'set-cookie':clearCookie(process.env.FORGECORE_SECURE_COOKIE==='1')});
   }
   // Discover is read-only until the user explicitly adds a title to the library.
   // The TMDB token stays on the server; these routes inherit session/CSRF checks.
   if(path==='/api/discover/status'&&method==='GET')
    return response(res,200,{configured:hasDiscoverToken(tmdbToken),source:'TMDB',region:'AT',language:'de-DE'});
   if(path==='/api/discover'&&method==='GET')
    return response(res,200,await discoverCatalog({token:tmdbToken,query:url.searchParams.get('q')||'',kind:url.searchParams.get('kind')||'all',...(discoverFetch?{fetcher:discoverFetch}:{})}));
   // v1.4.1 – extended metadata and explicit per-season listing.
   const discoverOpts={token:tmdbToken,...(discoverFetch?{fetcher:discoverFetch}:{}),...(tvmazeFetch?{tvmazeFetch}:{})};
   if(path==='/api/discover/detail'&&method==='GET')
    return response(res,200,await discoverMetadata({...discoverOpts,kind:url.searchParams.get('kind'),id:url.searchParams.get('id')}));
   if(path==='/api/discover/season'&&method==='GET')
    return response(res,200,await discoverSeason({...discoverOpts,id:url.searchParams.get('id'),season:url.searchParams.get('season')}));
   // v1.4.2 – independent, read-only Jellyfin preview; no inventory mutation.
   if(path==='/api/discover/jellyfin'&&method==='GET')
    return response(res,200,await discoverJellyfinPreview(db,{kind:url.searchParams.get('kind'),id:url.searchParams.get('id')},{...discoverOpts,jellyfinFetch}));
   // v1.4.3 – SQLite watchlist and an opt-in, deduplicated radar.
   if(path==='/api/discover/watchlist'&&method==='GET')
    return response(res,200,{items:discoverWatchlist(db)});
   if(path==='/api/discover/watchlist'&&method==='POST')
    return response(res,201,await watchlistSave(db,await readJson(req),discoverOpts));
   if(path==='/api/discover/watchlist'&&method==='DELETE')
    return response(res,200,watchlistRemove(db,await readJson(req)));
   if(path==='/api/discover/watchlist/monitor'&&method==='PATCH')
    return response(res,200,watchlistMonitor(db,await readJson(req)));
   if(path==='/api/discover/radar/check'&&method==='POST')
    return response(res,200,await runRadar());
   // v1.4.4 – episode status planning only, never enqueue unauthorized streams.
   // v1.5.2–v1.6.0: language-filtered discoveries from saved websites.
   const downloadOpts={token:tmdbToken,discoverFetch,sourceFetch,languageFetch,jellyfinFetch};
   if(path==='/api/discover/download-sources'&&method==='GET')
    return response(res,200,await discoverDownloadSources(db,Object.fromEntries(url.searchParams),downloadOpts));
   if(path==='/api/discover/download'&&method==='POST')
    return response(res,201,await queueDiscoverDownload(db,transfers,await readJson(req),downloadOpts));
   // v1.7.0: optional isolated Chromium agent. The agent cannot publish media.
   // Login and CSRF are required, even for browser scanning.
   if(path==='/api/browser-agent/status'&&method==='GET')
    return response(res,200,await browserAgentStatus(browserAgentFetch?{fetcher:browserAgentFetch}:{}));
   if(path==='/api/discover/browser-scan'&&method==='POST')
    return response(res,200,await browserScans.scan(db,await readJson(req),
     {...downloadOpts,...(browserAgentFetch?{agentFetch:browserAgentFetch}:{})}));
   if(path==='/api/discover/browser-download'&&method==='POST')
    return response(res,201,await browserScans.enqueue(db,transfers,await readJson(req),downloadOpts));
   if(path==='/api/discover/plan'&&method==='GET')
    return response(res,200,await discoverEpisodePlan(db,{id:url.searchParams.get('id'),season:url.searchParams.get('season')},{...discoverOpts,jellyfinFetch}));
   if(path==='/api/discover/plan/apply'&&method==='POST')
    return response(res,200,await applyDiscoverEpisodePlan(db,await readJson(req),{...discoverOpts,jellyfinFetch}));
   if(path==='/api/discover/add'&&method==='POST'){
    const body=await readJson(req);
    const detail=await discoverDetail({token:tmdbToken,id:body.id,kind:body.kind,...(discoverFetch?{fetcher:discoverFetch}:{})});
    const existing=one(db,'SELECT * FROM media WHERE external_id=?',detail.externalId);
    if(existing)return response(res,200,{item:existing,alreadyAdded:true});
    const id=newId(),now=utc(),kind=detail.kind==='tv'?'series':'movie';
    db.prepare('INSERT INTO media(id,kind,title,year,external_id,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
     .run(id,kind,detail.title,detail.year,detail.externalId,'',now,now);
    return response(res,201,{item:one(db,'SELECT * FROM media WHERE id=?',id),alreadyAdded:false});
   }
   if(path==='/api/media'){
    if(method==='GET')return response(res,200,{items:rows(db,'SELECT * FROM media ORDER BY title COLLATE NOCASE,created_at')});
    if(method==='POST'){
     const b=mediaInput(await readJson(req));const id=newId(),now=utc();
     db.prepare('INSERT INTO media(id,kind,title,year,external_id,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,b.kind,b.title,b.year,b.external_id,b.notes,now,now);
     return response(res,201,{item:one(db,'SELECT * FROM media WHERE id=?',id)});
    }
   }
   const mediaMatch=path.match(/^\/api\/media\/([0-9a-f-]{36})(?:\/(episodes|preview))?$/);
   if(mediaMatch){
    const id=idCheck(mediaMatch[1]),sub=mediaMatch[2];const item=one(db,'SELECT * FROM media WHERE id=?',id);
    if(!item)fail('Media not found',404);
    if(sub==='episodes'){
     if(item.kind!=='series')fail('Episodes only supported for series');
     if(method==='GET')return response(res,200,{items:rows(db,'SELECT * FROM episodes WHERE media_id=? ORDER BY season,episode',id)});
     if(method==='POST'){
      const b=episodeInput(await readJson(req));const eid=newId(),now=utc();
      try{db.prepare('INSERT INTO episodes(id,media_id,season,episode,title,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(eid,id,b.season,b.episode,b.title,now,now);}catch(e){if(e.code==='ERR_SQLITE_ERROR')fail('Episode already exists',409);throw e;}
      return response(res,201,{item:one(db,'SELECT * FROM episodes WHERE id=?',eid)});
     }
    }else if(sub==='preview'&&method==='GET'){
     if(!mediaRoot)fail('Media root is not configured',409);
     if(item.kind==='movie')return response(res,200,{items:[await previewLibrary(mediaRoot,item)]});
     const episodes=rows(db,'SELECT * FROM episodes WHERE media_id=? ORDER BY season,episode',id);const previews=[];
     for(const ep of episodes)previews.push({episodeId:ep.id,...await previewLibrary(mediaRoot,item,ep)});
     return response(res,200,{items:previews});
    }else if(!sub){
     if(method==='GET')return response(res,200,{item});
     if(method==='PATCH'){
      const b=mediaInput({...item,...await readJson(req)});db.prepare('UPDATE media SET kind=?,title=?,year=?,external_id=?,notes=?,updated_at=? WHERE id=?').run(b.kind,b.title,b.year,b.external_id,b.notes,utc(),id);
      return response(res,200,{item:one(db,'SELECT * FROM media WHERE id=?',id)});
     }
     if(method==='DELETE'){
      db.prepare('DELETE FROM media WHERE id=?').run(id);
      return response(res,200,{ok:true});
     }
    }
   }
   const epMatch=path.match(/^\/api\/episodes\/([0-9a-f-]{36})$/);
   if(epMatch){const id=idCheck(epMatch[1]);const item=one(db,'SELECT * FROM episodes WHERE id=?',id);if(!item)fail('Episode not found',404);
    if(method==='PATCH'){
     const body=await readJson(req);const b=episodeInput({...item,...body});const status=body.status===undefined?item.status:body.status;
     if(!['missing','available','ignored'].includes(status))fail('Invalid episode status');
     try{db.prepare('UPDATE episodes SET season=?,episode=?,title=?,status=?,updated_at=? WHERE id=?').run(b.season,b.episode,b.title,status,utc(),id);}catch(e){if(e.code==='ERR_SQLITE_ERROR')fail('Episode already exists',409);throw e;}
     return response(res,200,{item:one(db,'SELECT * FROM episodes WHERE id=?',id)});
    }
    if(method==='DELETE'){db.prepare('DELETE FROM episodes WHERE id=?').run(id);return response(res,200,{ok:true});}
   }

   // ForgeCore Phase 2: authenticated source catalog, read-only discovery,
   // persistent transfer scheduling and controlled Jellyfin media delivery.

   // Phase 3: media wizard planner, independent scheduling and notifications.
   const sourceRank=path.match(/^\/api\/media\/([0-9a-f-]{36})\/source-ranking$/);
   if(sourceRank&&method==='GET'){
    const mediaId=idCheck(sourceRank[1]);if(!one(db,'SELECT id FROM media WHERE id=?',mediaId))fail('Media not found',404);
    return response(res,200,{items:sourceRanking(db,mediaId)});
   }
   const planMatch=path.match(/^\/api\/media\/([0-9a-f-]{36})\/download-plan$/);
   if(planMatch&&method==='GET'){
    const mediaId=idCheck(planMatch[1]),sourceId=idCheck(url.searchParams.get('sourceId'));
    return response(res,200,missingEpisodePlan(db,mediaId,sourceId));
   }
   if(path==='/api/automation/schedule'){
    if(method==='GET')return response(res,200,{schedule:loadSchedule(db),timezone:process.env.TZ||'UTC'});
    if(method==='PUT')return response(res,200,{schedule:setSchedule(db,await readJson(req))});
   }
   if(path==='/api/notifications'&&method==='GET')
    return response(res,200,{items:listNotifications(db)});
   const noticeRead=path.match(/^\/api\/notifications\/([0-9a-f-]{36})\/read$/);
   if(noticeRead&&method==='POST')
    return response(res,200,{ok:markNotificationRead(db,idCheck(noticeRead[1]))});
   if(path==='/api/operations'&&method==='GET')
    return response(res,200,await operationalStatus(db,{mediaRoot,stagingRoot:process.env.FORGECORE_STAGING_ROOT||'/data',version:APP_VERSION}));
   if(path==='/api/operations/errors'&&method==='GET')
    return response(res,200,diagnosticEvents(db));
   if(path==='/api/diagnostics'&&method==='GET')
    return response(res,200,{...diagnostics(db),schedule:loadSchedule(db),serviceVersion:APP_VERSION});
   if(path==='/api/subtitles'){
    if(method==='GET')return response(res,200,{items:rows(db,'SELECT * FROM subtitle_jobs ORDER BY created_at DESC LIMIT 100')});
    if(method==='POST'){
     const b=await readJson(req);
     const mediaId=idCheck(b.mediaId),episodeId=b.episodeId?idCheck(b.episodeId):null;
     const media=one(db,'SELECT * FROM media WHERE id=?',mediaId);
     if(!media)fail('Media not found',404);
     const episode=episodeId?one(db,'SELECT * FROM episodes WHERE id=? AND media_id=?',episodeId,mediaId):null;
     if(media.kind==='series'&&!episode)fail('Series episode required');
     if(media.kind==='movie'&&episodeId)fail('Movie cannot have episode');
     const targetUrl=String(b.url||'').trim();parseWebUrl(targetUrl);
     if(!targetUrl.toLowerCase().split('?')[0].endsWith('.vtt'))fail('Only WebVTT subtitle URLs are supported');
     const language=normalizeLanguage(b.language||'de'),id=newId(),created=utc();
     if(!/^de(?:[-_][A-Za-z0-9]+)?$/i.test(language))fail('Nur Deutsch wird unterstützt');
     db.prepare("INSERT INTO subtitle_jobs(id,media_id,episode_id,url,language,state,created_at,updated_at) VALUES(?,?,?,?,?,'running',?,?)").run(id,mediaId,episodeId,targetUrl,language,created,created);
     try{
      const result=await downloadSubtitle({url:targetUrl,root:mediaRoot,media,episode,language,...(subtitleFetch?{fetcher:subtitleFetch}:{})});
      db.prepare("UPDATE subtitle_jobs SET state='complete',result=?,updated_at=? WHERE id=?").run(JSON.stringify(result),utc(),id);
      addNotification(db,{category:'subtitle',message:'Untertitel gespeichert: '+result.path,refId:id});
      return response(res,201,{id,result});
     }catch(error){
      db.prepare("UPDATE subtitle_jobs SET state='failed',error=?,updated_at=? WHERE id=?").run(String(error?.message||error).slice(0,500),utc(),id);
      fail('Subtitle export failed: '+String(error?.message||error).slice(0,160),400);
     }
    }
   }

   // Phase 5: source monitors require admin sessions and CSRF on all mutations.
   if(path==='/api/automation/sources'&&method==='GET')
    return response(res,200,{items:automation.list()});
   const monitorMatch=path.match(/^\/api\/sources\/([0-9a-f-]{36})\/automation(?:\/(check|history))?$/);
   if(monitorMatch){
    const id=idCheck(monitorMatch[1]),op=monitorMatch[2];
    if(!op&&method==='GET')return response(res,200,{policy:automation.get(id)});
    if(!op&&method==='PUT')return response(res,200,{policy:automation.configure(id,await readJson(req))});
    if(op==='history'&&method==='GET')return response(res,200,{items:automation.history(id)});
    if(op==='check'&&method==='POST')return response(res,200,await automation.check(id,{manual:true}));
   }


   // Phase 6: local Jellyfin integration – all endpoints require admin login.
   if(path==='/api/jellyfin'){
    if(method==='GET')return response(res,200,getJellyfinStatus(db));
    if(method==='PUT')return response(res,200,saveJellyfin(db,await readJson(req)));
   }
   if(path==='/api/jellyfin/test'&&method==='POST')
    return response(res,200,await jellyfinTest(db,jellyfinFetch?{fetcher:jellyfinFetch}:{}));
   if(path==='/api/jellyfin/refresh'&&method==='POST')
    return response(res,200,await jellyfinRefresh(db,jellyfinFetch?{fetcher:jellyfinFetch}:{}));
   if(path==='/api/jellyfin/sync/history'&&method==='GET')
    return response(res,200,{items:recentJellyfinSync(db)});
   if(path==='/api/jellyfin/sync/preview'&&method==='POST'){
    const items=await jellyfinInventory(db,jellyfinFetch?{fetcher:jellyfinFetch}:{});
    const preview=reconcilePreview(db,items);
    return response(res,200,{matched:preview.matched,unmatched:preview.unmatched,availableToMark:preview.availableToMark,matches:preview.matches.slice(0,100)});
   }
   if(path==='/api/jellyfin/sync/apply'&&method==='POST'){
    const body=await readJson(req);
    if(body.confirm!=='MARK_AVAILABLE')fail('Explicit confirmation required');
    const items=await jellyfinInventory(db,jellyfinFetch?{fetcher:jellyfinFetch}:{});
    return response(res,200,applyReconciliation(db,reconcilePreview(db,items)));
   }

   // Phase 9: global website catalog and read-only cross-site search.
   if(path==='/api/search-sites'){
    if(method==='GET')return response(res,200,{items:rows(db,'SELECT * FROM search_sites ORDER BY label COLLATE NOCASE')});
    if(method==='POST'){
     const v=validateSearchSite(await readJson(req)),id=newId(),now=utc();
     try{db.prepare('INSERT INTO search_sites(id,url,label,adapter_id,enabled,search_template,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,v.url,v.label,v.adapterId,v.enabled?1:0,v.searchTemplate,now,now);}
     catch(e){if(e.code==='ERR_SQLITE_ERROR')fail('Website bereits gespeichert',409);throw e;}
     return response(res,201,{item:one(db,'SELECT * FROM search_sites WHERE id=?',id)});
    }
   }
   const siteMatch=path.match(/^\/api\/search-sites\/([0-9a-f-]{36})$/);
   if(siteMatch){
    const id=idCheck(siteMatch[1]),site=one(db,'SELECT * FROM search_sites WHERE id=?',id);
    if(!site)fail('Website nicht gefunden',404);
    if(method==='DELETE'){db.prepare('DELETE FROM search_sites WHERE id=?').run(id);return response(res,200,{ok:true});}
    if(method==='PATCH'){
     const b=await readJson(req),v=validateSearchSite({url:b.url??site.url,label:b.label??site.label,adapterId:b.adapterId??site.adapter_id,searchTemplate:b.searchTemplate??site.search_template,enabled:b.enabled===undefined?!!site.enabled:b.enabled});
     try{db.prepare('UPDATE search_sites SET url=?,label=?,adapter_id=?,enabled=?,search_template=?,updated_at=? WHERE id=?').run(v.url,v.label,v.adapterId,v.enabled?1:0,v.searchTemplate,utc(),id);}
     catch(e){if(e.code==='ERR_SQLITE_ERROR')fail('Website bereits gespeichert',409);throw e;}
     return response(res,200,{item:one(db,'SELECT * FROM search_sites WHERE id=?',id)});
    }
   }
   if(path==='/api/site-search'&&method==='POST'){
    const b=await readJson(req);
    return response(res,200,await searchSites(db,b.query,{...(sourceFetch?{fetcher:sourceFetch}:{})}));
   }
   if(path==='/api/playerbridge/inspect'&&method==='POST'){
    const data=await readJson(req);
    return response(res,200,await inspectPlayerPage(db,data,{...(sourceFetch?{fetcher:sourceFetch}:{})}));
   }
   if(path==='/api/catalog/inspect'&&method==='POST'){
    const body=await readJson(req);
    return response(res,200,await inspectCatalog(db,body,{...(sourceFetch?{fetcher:sourceFetch}:{})}));
   }
   if(path==='/api/catalog/jellyfin-preview'&&method==='POST'){
    const body=await readJson(req,512*1024);
    return response(res,200,await catalogJellyfinPreview(db,body,{...(jellyfinFetch?{fetcher:jellyfinFetch}:{})}));
   }
   if(path==='/api/catalog/series-overview'&&method==='POST'){
    const body=await readJson(req,512*1024);
    return response(res,200,await seriesOverview(db,body,{...(jellyfinFetch?{fetcher:jellyfinFetch}:{})}));
   }
   if(path==='/api/catalog/import-jellyfin'&&method==='POST'){
    const body=await readJson(req);
    return response(res,200,await importJellyfinSeries(db,body,{...(jellyfinFetch?{fetcher:jellyfinFetch}:{})}));
   }
   if(path==='/api/source-adapters'&&method==='GET')
    return response(res,200,{items:SOURCE_ADAPTERS});

   const mediaSourcesMatch=path.match(/^\/api\/media\/([0-9a-f-]{36})\/sources$/);
   if(mediaSourcesMatch){
    const mediaId=idCheck(mediaSourcesMatch[1]);
    if(!one(db,'SELECT id FROM media WHERE id=?',mediaId))fail('Media project not found',404);
    if(method==='GET')return response(res,200,{items:rows(db,'SELECT * FROM sources WHERE media_id=? ORDER BY created_at',mediaId)});
    if(method==='POST'){
     const b=await readJson(req);
     const urlValue=String(b.url||'').trim();
     try{parseWebUrl(urlValue);}catch(error){fail(error.message);}
     const label=limitText(b.label,140)||'Quelle';
     const id=newId(),now=utc();
     try{db.prepare('INSERT INTO sources(id,media_id,url,label,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,mediaId,urlValue,label,now,now);}
     catch(e){if(e.code==='ERR_SQLITE_ERROR')fail('Source URL already exists for this media project',409);throw e;}
     return response(res,201,{item:one(db,'SELECT * FROM sources WHERE id=?',id)});
    }
   }
   const sourceMatch=path.match(/^\/api\/sources\/([0-9a-f-]{36})(?:\/(analyze|items|import-episodes))?$/);
   if(sourceMatch){
    const id=idCheck(sourceMatch[1]),op=sourceMatch[2];
    const source=one(db,'SELECT * FROM sources WHERE id=?',id);
    if(!source)fail('Source not found',404);
    if(op==='items'&&method==='GET')
     return response(res,200,{items:rows(db,'SELECT * FROM source_items WHERE source_id=? ORDER BY season,episode,title LIMIT 500',id)});
    if(op==='analyze'&&method==='POST'){
     const analysis=await analyzeSource(source.url,{...(sourceFetch?{fetcher:sourceFetch}:{}),adapter:source.adapter_id||'auto'});
     if(analysis.items?.length){
      transaction(db,()=>{
       db.prepare('DELETE FROM source_items WHERE source_id=?').run(id);
       const insert=db.prepare('INSERT INTO source_items(id,source_id,url,title,season,episode,created_at) VALUES(?,?,?,?,?,?,?)');
       for(const item of analysis.items)insert.run(newId(),id,item.url,item.title,item.season,item.episode,utc());
      });
     }
     return response(res,200,{...analysis,items:rows(db,'SELECT * FROM source_items WHERE source_id=? ORDER BY season,episode,title',id)});
    }
    if(op==='import-episodes'&&method==='POST'){
     const media=one(db,'SELECT * FROM media WHERE id=?',source.media_id);
     if(media?.kind!=='series')fail('Only series can import episodes');
     const known=rows(db,'SELECT * FROM source_items WHERE source_id=? AND season IS NOT NULL AND episode IS NOT NULL LIMIT 500',id);
     let count=0;
     transaction(db,()=>{
      const insert=db.prepare('INSERT OR IGNORE INTO episodes(id,media_id,season,episode,title,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
      for(const ep of known){
       if(ep.season<0||ep.season>999||ep.episode<0||ep.episode>9999)continue;
       count+=insert.run(newId(),source.media_id,ep.season,ep.episode,ep.title||'',utc(),utc()).changes;
      }
     });
     return response(res,200,{ok:true,added:count});
    }
    if(!op&&method==='DELETE'){
     db.prepare('DELETE FROM sources WHERE id=?').run(id);return response(res,200,{ok:true});
    }
    if(!op&&method==='PATCH'){
     const b=await readJson(req);
     const label=limitText(b.label===undefined?source.label:b.label,140);
     const adapter=selectSourceAdapter(b.adapterId===undefined?source.adapter_id:b.adapterId);
     const enabled=b.enabled===undefined?source.enabled:(b.enabled?1:0);
     db.prepare('UPDATE sources SET label=?,enabled=?,adapter_id=?,updated_at=? WHERE id=?').run(label,enabled,adapter,utc(),id);
     return response(res,200,{item:one(db,'SELECT * FROM sources WHERE id=?',id)});
    }
   }
   if(path==='/api/transfers/batch'&&method==='POST'){
    const b=await readJson(req);
    const mediaId=idCheck(b.mediaId),sourceId=idCheck(b.sourceId);
    const media=one(db,'SELECT * FROM media WHERE id=?',mediaId);
    const source=one(db,'SELECT * FROM sources WHERE id=? AND media_id=? AND enabled=1',sourceId,mediaId);
    if(!media||media.kind!=='series')fail('A series is required for batch transfers');
    if(!source)fail('Active source not found',404);
    const items=rows(db,'SELECT * FROM source_items WHERE source_id=? AND season IS NOT NULL AND episode IS NOT NULL ORDER BY season,episode LIMIT 200',sourceId);
    let queued=0;const skipped=[];
    for(const item of items){
     const episode=one(db,'SELECT * FROM episodes WHERE media_id=? AND season=? AND episode=?',mediaId,item.season,item.episode);
     if(!episode){skipped.push({itemId:item.id,reason:'episode_not_registered'});continue;}
     if(episode.status==='available'||episode.status==='ignored'){skipped.push({itemId:item.id,reason:'not_missing'});continue;}
     try{transfers.enqueue({mediaId,episodeId:episode.id,sourceId,itemId:item.id});queued++;}
     catch(error){skipped.push({itemId:item.id,reason:String(error.message||error).slice(0,120)});}
    }
    return response(res,200,{queued,skipped,scanned:items.length});
   }
   if(path==='/api/transfers'){
    if(method==='GET')return response(res,200,{items:transfers.list()});
    if(method==='POST'){
     const b=await readJson(req);
     const item=transfers.enqueue({mediaId:idCheck(b.mediaId),episodeId:b.episodeId?idCheck(b.episodeId):null,sourceId:idCheck(b.sourceId),itemId:b.itemId?idCheck(b.itemId):null});
     return response(res,201,{item});
    }
   }
   const transferMatch=path.match(/^\/api\/transfers\/([0-9a-f-]{36})\/(cancel|retry)$/);
   if(transferMatch&&method==='POST'){
    const id=idCheck(transferMatch[1]);
    const ok=transferMatch[2]==='cancel'?transfers.cancel(id):transfers.retry(id);
    if(!ok)fail('Transfer state cannot be changed',409);
    return response(res,200,{ok:true});
   }

   if(path==='/api/config'&&method==='GET'){
    return response(res,200,{items:rows(db,"SELECT key,value FROM config WHERE key!='jellyfin_api_key' ORDER BY key"),mediaRoot:await checkMediaRoot(mediaRoot)});
   }
   if(path==='/api/config'&&method==='PUT'){
    const body=await readJson(req);const allowed=['jellyfin_url','library_label','preferred_language'];
    for(const key of Object.keys(body))if(!allowed.includes(key))fail('Unknown config key: '+key);
    if(body.jellyfin_url){try{const u=new URL(body.jellyfin_url);if(!['http:','https:'].includes(u.protocol))fail('Invalid jellyfin URL');}catch{fail('Invalid jellyfin URL');}}
    transaction(db,()=>{for(const [key,value] of Object.entries(body)){
     const v=limitText(value,300);
     if(key==='preferred_language'&&v!=='de')fail('Nur Deutsch wird unterstützt');
     db.prepare('INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,v);
    }});
    return response(res,200,{ok:true});
   }
   if(path==='/api/jobs'){
    if(method==='GET')return response(res,200,{items:rows(db,'SELECT * FROM jobs ORDER BY created_at DESC,id DESC LIMIT 200')});
    if(method==='POST'){
     const b=await readJson(req);if(!['library_scan','metadata_check'].includes(b.type))fail('Invalid job type');
     if(b.type==='metadata_check'&&!one(db,'SELECT id FROM media WHERE id=?',b.mediaId||''))fail('Media not found',404);
     return response(res,201,{item:queue.enqueue(b.type,b.type==='metadata_check'?{mediaId:b.mediaId}:{})});
    }
   }
   const jobMatch=path.match(/^\/api\/jobs\/([0-9a-f-]{36})\/(cancel|retry)$/);
   if(jobMatch&&method==='POST'){
    const id=idCheck(jobMatch[1]);const ok=jobMatch[2]==='cancel'?queue.cancel(id):queue.retry(id);
    if(!ok)fail('Job state cannot be changed',409);
    return response(res,200,{ok:true});
   }
   if(path==='/api/backup/import'&&method==='POST'){
    const backup=await readJson(req,8*1024*1024);
    if(backup.format!=='forgecore-export-v1'||backup.confirm!=='REPLACE')fail('Backup format or confirmation invalid');
    if(!Array.isArray(backup.media)||!Array.isArray(backup.episodes)||!Array.isArray(backup.config))fail('Incomplete backup');
    if(backup.sources!==undefined&&!Array.isArray(backup.sources))fail('Invalid source backup');
    if(backup.source_items!==undefined&&!Array.isArray(backup.source_items))fail('Invalid discovered-item backup');
    if(backup.source_automation!==undefined&&!Array.isArray(backup.source_automation))fail('Invalid automation backup');
    if(backup.search_sites!==undefined&&!Array.isArray(backup.search_sites))fail('Invalid website catalog backup');
    if(backup.discover_watchlist!==undefined&&!Array.isArray(backup.discover_watchlist))fail('Invalid Discover watchlist backup');
    if(backup.media.length>10000||backup.episodes.length>200000||backup.config.length>100||(backup.sources?.length||0)>20000||(backup.source_items?.length||0)>100000||(backup.source_automation?.length||0)>20000||(backup.search_sites?.length||0)>1000||(backup.discover_watchlist?.length||0)>1000)fail('Backup exceeds safety limits');
    transaction(db,()=>{
     db.exec('DELETE FROM discover_watchlist; DELETE FROM search_sites; DELETE FROM source_check_events; DELETE FROM source_automation; DELETE FROM transfer_jobs; DELETE FROM source_items; DELETE FROM sources; DELETE FROM jobs; DELETE FROM episodes; DELETE FROM media; DELETE FROM config;');
     for(const media of backup.media){
      const m=mediaInput(media);idCheck(media.id);
      db.prepare('INSERT INTO media(id,kind,title,year,external_id,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(media.id,m.kind,m.title,m.year,m.external_id,m.notes,utc(),utc());
     }
     for(const ep of backup.episodes){
      const e=episodeInput(ep);idCheck(ep.id);idCheck(ep.media_id);
      const status=['missing','available','ignored'].includes(ep.status)?ep.status:'missing';
      db.prepare('INSERT INTO episodes(id,media_id,season,episode,title,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(ep.id,ep.media_id,e.season,e.episode,e.title,status,utc(),utc());
     }
     for(const src of backup.sources||[]){
      idCheck(src.id);idCheck(src.media_id);
      const urlValue=String(src.url||'');try{parseWebUrl(urlValue);}catch{fail('Invalid source URL in backup');}
      db.prepare('INSERT INTO sources(id,media_id,url,label,enabled,adapter_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(src.id,src.media_id,urlValue,limitText(src.label,140),src.enabled?1:0,selectSourceAdapter(src.adapter_id||'auto'),utc(),utc());
     }
     for(const item of backup.source_items||[]){
      idCheck(item.id);idCheck(item.source_id);
      const urlValue=String(item.url||'');try{parseWebUrl(urlValue);}catch{fail('Invalid discovered source URL in backup');}
      const season=item.season===null?null:Number(item.season),ep=item.episode===null?null:Number(item.episode);
      if(season!==null&&(!Number.isInteger(season)||season<0||season>999))fail('Invalid discovered season');
      if(ep!==null&&(!Number.isInteger(ep)||ep<0||ep>9999))fail('Invalid discovered episode');
      db.prepare('INSERT INTO source_items(id,source_id,url,title,season,episode,created_at) VALUES(?,?,?,?,?,?,?)').run(item.id,item.source_id,urlValue,limitText(item.title,140),season,ep,utc());
     }
     for(const policy of backup.source_automation||[]){
      idCheck(policy.source_id);
      const p=automation.configure(policy.source_id,{enabled:false,autoQueue:!!policy.auto_queue,autoAddEpisodes:!!policy.auto_add_episodes,intervalMinutes:policy.interval_minutes,maxPerCheck:policy.max_per_check});
      // Backups never silently reactivate unattended downloads after restore.
     }
     for(const site of backup.search_sites||[]){
      idCheck(site.id);
      const v=validateSearchSite({url:site.url,label:site.label,adapterId:site.adapter_id,searchTemplate:site.search_template||'',enabled:false});
      db.prepare('INSERT INTO search_sites(id,url,label,adapter_id,enabled,search_template,created_at,updated_at) VALUES(?,?,?,?,0,?,?,?)').run(site.id,v.url,v.label,v.adapterId,v.searchTemplate,utc(),utc());
     }
     for(const entry of backup.discover_watchlist||[]){
      const kind=validKind(entry.kind),id=validId(entry.tmdb_id);
      const title=limitText(entry.title,140);
      if(!title)fail('Invalid Discover watchlist title');
      const year=entry.year===null||entry.year===undefined?null:Number(entry.year);
      if(year!==null&&(!Number.isInteger(year)||year<1888||year>2200))fail('Invalid Discover watchlist year');
      // Explicit re-enable required after restore. Never restore monitoring automatically.
      db.prepare('INSERT INTO discover_watchlist(tmdb_id,kind,title,year,monitored,added_at,updated_at) VALUES(?,?,?,?,0,?,?)')
       .run(id,kind,title,year,utc(),utc());
     }
     for(const item of backup.config){
      if(!['jellyfin_url','library_label','preferred_language','transfer_schedule'].includes(item.key))continue;
      if(item.key==='transfer_schedule'){try{setSchedule(db,JSON.parse(String(item.value)));}catch{fail('Invalid transfer schedule in backup');}continue;}
      db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run(item.key,limitText(item.value,300));
     }
    });
    return response(res,200,{ok:true,media:backup.media.length,episodes:backup.episodes.length});
   }
   if(path==='/api/backup/database'&&method==='GET'){
    return await withDatabaseSnapshot(db,async(file,size)=>{
     res.writeHead(200,{'content-type':'application/vnd.sqlite3','cache-control':'no-store','x-content-type-options':'nosniff',
      'content-disposition':'attachment; filename="forgecore-full-backup.sqlite"','content-length':size});
     await pipeline(createReadStream(file),res);
    });
   }
   const transferEventsMatch=path.match(/^\/api\/transfers\/([0-9a-f-]{36})\/events$/);
   if(transferEventsMatch&&method==='GET'){
    const job=idCheck(transferEventsMatch[1]);
    if(!one(db,'SELECT id FROM transfer_jobs WHERE id=?',job))fail('Transfer not found',404);
    return response(res,200,{items:rows(db,'SELECT id,category,description,created_at FROM transfer_events WHERE transfer_id=? ORDER BY id DESC LIMIT 150',job)});
   }
   if(path==='/api/backup/export'&&method==='GET'){
    const data={format:'forgecore-export-v1',version:APP_VERSION,createdAt:utc(),media:rows(db,'SELECT * FROM media'),episodes:rows(db,'SELECT * FROM episodes'),config:rows(db,"SELECT * FROM config WHERE key!='jellyfin_api_key'"),sources:rows(db,'SELECT * FROM sources'),source_items:rows(db,'SELECT * FROM source_items'),source_automation:rows(db,'SELECT * FROM source_automation'),search_sites:rows(db,'SELECT * FROM search_sites'),discover_watchlist:rows(db,'SELECT * FROM discover_watchlist')};
    return response(res,200,data,{'content-disposition':'attachment; filename="forgecore-backup.json"'});
   }
   if(path.startsWith('/api/'))fail('Unknown endpoint',404);
   if(!staticFiles)fail('Not found',404);
   const names={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.png':'favicon.png'};
   const file=names[path];if(!file||method!=='GET')fail('Not found',404);
   const body=await readFile(join(staticDir,file));
   const mime=file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8';
   res.writeHead(200,{'content-type':mime,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','content-security-policy':"default-src 'self'; img-src 'self' https://image.tmdb.org; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"});res.end(body);
  }catch(err){response(res,Number(err?.status)||500,{error:Number(err?.status)?err.message:'Internal server error'});}
 };
 const server=http.createServer((req,res)=>{handler(req,res).catch(()=>{if(!res.headersSent)response(res,500,{error:'Internal server error'});else res.destroy();});});
 return {db,queue,transfers,automation,server,close:async()=>{if(radarTimer)clearInterval(radarTimer);if(radarTask)await radarTask.catch(()=>{});queue.stop();await automation.stop();await transfers.stop();await new Promise(resolve=>server.listening?server.close(resolve):resolve());db.close();}};
}
export function createServer(){return createApp().server;}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.FORGECORE_PORT||8787);
 const host=process.env.FORGECORE_HOST||'127.0.0.1';
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid FORGECORE_PORT');
 const app=createApp({dbPath:process.env.FORGECORE_DB_PATH||'/data/forgecore.sqlite',mediaRoot:process.env.FORGECORE_MEDIA_ROOT||''});
 app.server.listen(port,host,()=>process.stdout.write(`ForgeCore ${APP_VERSION} listening on ${host}:${port}\n`));
 const shutdown=()=>{app.close().then(()=>process.exit(0)).catch(()=>process.exit(1));};
 process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
