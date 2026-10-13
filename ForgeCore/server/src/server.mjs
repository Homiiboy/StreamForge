import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {openDatabase,newId,utc,rows,one,transaction} from './db.mjs';
import {isSetup,setupAdmin,verifyAdmin,createSession,readSession,deleteSession,checkCsrf,sessionCookie,clearCookie} from './auth.mjs';
import {checkMediaRoot,previewLibrary} from './library.mjs';
import {JobQueue} from './queue.mjs';
import {TransferQueue} from './transfer-queue.mjs';
import {parseWebUrl} from './source-security.mjs';
import {analyzeSource,SOURCE_ADAPTERS} from './source-adapters.mjs';

export const APP_NAME='ForgeCore';
export const APP_VERSION='0.1.9';
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
function publicStatus(db){return {service:APP_NAME,version:APP_VERSION,phase:'alpha-foundation',configured:isSetup(db),capabilities:{health:true,mediaProjects:true,episodes:true,sourceAdapters:true,downloads:true,jellyfinExport:true,libraryPreview:true,backgroundJobs:true,metadataManual:true}};}
export function createApp({dbPath=':memory:',mediaRoot='',startWorker=true,staticFiles=true,sourceFetch,download}={}){
 const db=openDatabase(dbPath);
 const queue=new JobQueue(db,{mediaRoot});
 const transfers=new TransferQueue(db,{mediaRoot,...(download?{download}:{})});
 if(startWorker){queue.start();transfers.start();}
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
     const analysis=await analyzeSource(source.url,sourceFetch?{fetcher:sourceFetch}:{});
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
     const enabled=b.enabled===undefined?source.enabled:(b.enabled?1:0);
     db.prepare('UPDATE sources SET label=?,enabled=?,updated_at=? WHERE id=?').run(label,enabled,utc(),id);
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
    return response(res,200,{items:rows(db,'SELECT key,value FROM config ORDER BY key'),mediaRoot:await checkMediaRoot(mediaRoot)});
   }
   if(path==='/api/config'&&method==='PUT'){
    const body=await readJson(req);const allowed=['jellyfin_url','library_label','preferred_language'];
    for(const key of Object.keys(body))if(!allowed.includes(key))fail('Unknown config key: '+key);
    if(body.jellyfin_url){try{const u=new URL(body.jellyfin_url);if(!['http:','https:'].includes(u.protocol))fail('Invalid jellyfin URL');}catch{fail('Invalid jellyfin URL');}}
    transaction(db,()=>{for(const [key,value] of Object.entries(body)){
     const v=limitText(value,300);
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
    if(backup.media.length>10000||backup.episodes.length>200000||backup.config.length>100||(backup.sources?.length||0)>20000||(backup.source_items?.length||0)>100000)fail('Backup exceeds safety limits');
    transaction(db,()=>{
     db.exec('DELETE FROM transfer_jobs; DELETE FROM source_items; DELETE FROM sources; DELETE FROM jobs; DELETE FROM episodes; DELETE FROM media; DELETE FROM config;');
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
      db.prepare('INSERT INTO sources(id,media_id,url,label,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(src.id,src.media_id,urlValue,limitText(src.label,140),src.enabled?1:0,utc(),utc());
     }
     for(const item of backup.source_items||[]){
      idCheck(item.id);idCheck(item.source_id);
      const urlValue=String(item.url||'');try{parseWebUrl(urlValue);}catch{fail('Invalid discovered source URL in backup');}
      const season=item.season===null?null:Number(item.season),ep=item.episode===null?null:Number(item.episode);
      if(season!==null&&(!Number.isInteger(season)||season<0||season>999))fail('Invalid discovered season');
      if(ep!==null&&(!Number.isInteger(ep)||ep<0||ep>9999))fail('Invalid discovered episode');
      db.prepare('INSERT INTO source_items(id,source_id,url,title,season,episode,created_at) VALUES(?,?,?,?,?,?,?)').run(item.id,item.source_id,urlValue,limitText(item.title,140),season,ep,utc());
     }
     for(const item of backup.config){
      if(!['jellyfin_url','library_label','preferred_language'].includes(item.key))continue;
      db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run(item.key,limitText(item.value,300));
     }
    });
    return response(res,200,{ok:true,media:backup.media.length,episodes:backup.episodes.length});
   }
   if(path==='/api/backup/export'&&method==='GET'){
    const data={format:'forgecore-export-v1',version:APP_VERSION,createdAt:utc(),media:rows(db,'SELECT * FROM media'),episodes:rows(db,'SELECT * FROM episodes'),config:rows(db,'SELECT * FROM config'),sources:rows(db,'SELECT * FROM sources'),source_items:rows(db,'SELECT * FROM source_items')};
    return response(res,200,data,{'content-disposition':'attachment; filename="forgecore-backup.json"'});
   }
   if(path.startsWith('/api/'))fail('Unknown endpoint',404);
   if(!staticFiles)fail('Not found',404);
   const names={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css'};
   const file=names[path];if(!file||method!=='GET')fail('Not found',404);
   const body=await readFile(join(staticDir,file));
   const mime=file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8';
   res.writeHead(200,{'content-type':mime,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','content-security-policy':"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"});res.end(body);
  }catch(err){response(res,Number(err?.status)||500,{error:Number(err?.status)?err.message:'Internal server error'});}
 };
 const server=http.createServer((req,res)=>{handler(req,res).catch(()=>{if(!res.headersSent)response(res,500,{error:'Internal server error'});else res.destroy();});});
 return {db,queue,transfers,server,close:async()=>{queue.stop();transfers.stop();await new Promise(resolve=>server.listening?server.close(resolve):resolve());db.close();}};
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
