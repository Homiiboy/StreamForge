import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp,APP_VERSION} from '../src/server.mjs';
import {openDatabase} from '../src/db.mjs';
import {mediaRelative,mediaBaseName,safePart,ensureWithin,previewLibrary} from '../src/library.mjs';
import {JobQueue} from '../src/queue.mjs';

async function harness(fn,options={}){
 const root=await mkdtemp(join(tmpdir(),'forgecore-test-'));
 let app=createApp({dbPath:join(root,'db.sqlite'),mediaRoot:root,startWorker:false,...options});
 await new Promise((ok,fail)=>{app.server.once('error',fail);app.server.listen(0,'127.0.0.1',ok);});
 const base='http://127.0.0.1:'+app.server.address().port;
 let cookie='',csrf='';
 async function request(path,method='GET',body,extra={}){
  const headers={...extra,'x-forgecore-request':'1'};
  if(body!==undefined)headers['content-type']='application/json';
  if(cookie)headers.cookie=cookie;
  if(csrf && !headers['x-forgecore-csrf'])headers['x-forgecore-csrf']=csrf;
  const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await res.json();
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
  if(data.csrf)csrf=data.csrf;
  return {status:res.status,data};
 }
 try{await fn({app,root,request,close:()=>app.close()});}finally{await app.close();await rm(root,{recursive:true,force:true});}
}
test('v1.5.0 setup, auth, CRUD, jobs, exports and secure API',async()=>harness(async({app,request,root})=>{
 assert.equal(APP_VERSION,'1.5.0');
 assert.equal((await request('/api/health')).data.version,'1.5.0');
 assert.equal((await request('/api/status')).data.capabilities.downloads,true);
 assert.equal((await request('/api/media')).status,401);
 assert.equal((await request('/api/setup','POST',{password:'short'})).status,400);
 assert.equal((await request('/api/setup','POST',{password:'correct horse battery staple 2026'})).status,201);
 assert.equal((await request('/api/setup','POST',{password:'correct horse battery staple 2026'})).status,409);
 assert.equal((await request('/api/auth/login','POST',{password:'wrong'})).status,401);
 assert.equal((await request('/api/auth/login','POST',{password:'correct horse battery staple 2026'})).status,200);
 assert.equal((await request('/api/me')).data.authenticated,true);
 assert.equal((await request('/api/media','POST',{kind:'series',title:'Slugterra'})).status,201);
 const media=(await request('/api/media')).data.items[0];
 assert.equal(media.title,'Slugterra');
 assert.equal((await request(`/api/media/${media.id}/episodes`,'POST',{season:2,episode:8,title:'Episode 8'})).status,201);
 assert.equal((await request(`/api/media/${media.id}/episodes`,'POST',{season:2,episode:8,title:'duplicate'})).status,409);
 const episode=(await request(`/api/media/${media.id}/episodes`)).data.items[0];
 assert.equal((await request(`/api/media/${media.id}/preview`)).data.items[0].basename,'Slugterra S02E08');
 await mkdir(join(root,'Shows','Slugterra','Season 02'),{recursive:true});
 await writeFile(join(root,'Shows','Slugterra','Season 02','Slugterra S02E08.mkv'),'media');
 assert.equal((await request(`/api/media/${media.id}/preview`)).data.items[0].exists,true);
 assert.equal((await request('/api/jobs','POST',{type:'library_scan'})).status,201);
 await app.queue.tick();
 assert.equal((await request('/api/jobs')).data.items[0].state,'complete');
 assert.equal((await request(`/api/media/${media.id}/episodes`)).data.items[0].status,'available');
 assert.equal((await request(`/api/episodes/${episode.id}`,'PATCH',{status:'ignored'})).status,200);
 assert.equal((await request('/api/jobs','POST',{type:'metadata_check',mediaId:media.id})).status,201);
 await app.queue.tick();
 assert.equal((await request('/api/jobs')).data.items[0].state,'complete');
 assert.equal((await request('/api/config','PUT',{jellyfin_url:'http://jellyfin:8096',library_label:'Movies'})).status,200);
 assert.equal((await request('/api/config')).data.items.find(x=>x.key==='library_label').value,'Movies');
 const archive=(await request('/api/backup/export')).data;
 assert.equal(archive.episodes.length,1);
 assert.equal((await request('/api/backup/import','POST',{...archive,confirm:'NO'})).status,400);
 const tampered={...archive,confirm:'REPLACE',episodes:[{...archive.episodes[0],media_id:'bad-id'}]};
 assert.equal((await request('/api/backup/import','POST',tampered)).status,400);
 assert.equal((await request('/api/media')).data.items.length,1);
 assert.equal((await request('/api/media','POST',{kind:'movie',title:'Bad origin'},{origin:'https://malicious.example'})).status,403);
 assert.equal((await request('/api/media','POST',{kind:'movie',title:'Wrong CSRF'},{'x-forgecore-csrf':'invalid'})).status,403);
 assert.equal((await request('/api/backup/import','POST',{...archive,confirm:'REPLACE'})).status,200);
 assert.equal((await request('/api/media')).data.items.length,1);
 assert.equal((await request(`/api/media/${media.id}`,'PATCH',{title:'Slugterra HD'})).status,200);
 assert.equal((await request(`/api/media/${media.id}`,'DELETE')).status,200);
 assert.equal((await request(`/api/media/${media.id}/episodes`)).status,404);
 assert.equal((await request('/api/auth/logout','POST')).status,200);
 assert.equal((await request('/api/media')).status,401);
}));

test('persisted media and queued jobs survive restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forgecore-persist-'));const dbPath=join(dir,'db.sqlite');
 try{
  let db=openDatabase(dbPath);const q=new JobQueue(db,{mediaRoot:dir});
  const item=q.enqueue('library_scan');assert.equal(item.state,'queued');db.close();
  db=openDatabase(dbPath);assert.equal(db.prepare('SELECT state FROM jobs WHERE id=?').get(item.id).state,'queued');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,10);db.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Jellyfin path safeguards against escaping root',async()=>{
 assert.equal(mediaRelative({kind:'movie',title:'Interstellar',year:2014}),'Movies/Interstellar (2014)');
 assert.equal(mediaBaseName({kind:'series',title:'Slugterra'},{season:2,episode:8}),'Slugterra S02E08');
 assert.throws(()=>safePart('..'));
 assert.throws(()=>ensureWithin('/tmp/library','/tmp/other'));
});

test('worker records failed library scan rather than silently dropping it',async()=>{
 const db=openDatabase();const q=new JobQueue(db,{mediaRoot:''});
 const item=q.enqueue('library_scan');await q.tick();
 assert.equal(db.prepare('SELECT state FROM jobs WHERE id=?').get(item.id).state,'failed');
 assert.equal(q.retry(item.id),true);assert.equal(q.cancel(item.id),true);db.close();
});


test('Library recognizes existing Staffel directories',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-staffel-'));
 try{
  const target=join(root,'Shows','Slugterra','Staffel 2');
  await mkdir(target,{recursive:true});
  await writeFile(join(target,'Slugterra S02E08.mkv'),'ok');
  const preview=await previewLibrary(root,{kind:'series',title:'Slugterra'},{season:2,episode:8});
  assert.equal(preview.exists,true);assert.equal(preview.directory,'Shows/Slugterra/Staffel 2');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Phase 2 sources, episode discovery and persistent transfer processing',async()=>{
 const calls=[];
 const sourceFetch=async(url)=>({url,body:Buffer.from('<a href="/Slugterra-S02E08.m3u8" title="Slugterra S02E08">Episode</a>')});
 const download=async(args)=>{calls.push(args);return {path:'Shows/Slugterra/Season 02/Slugterra S02E08.mp4',bytes:2048};};
 await harness(async({app,request})=>{
  assert.equal((await request('/api/sources/not-an-id')).status,401);
  await request('/api/setup','POST',{password:'long passphrase for alpha testing'});
  await request('/api/auth/login','POST',{password:'long passphrase for alpha testing'});
  const media=(await request('/api/media','POST',{kind:'series',title:'Slugterra'})).data.item;
  assert.equal((await request('/api/media/'+media.id+'/sources','POST',{url:'ftp://unsafe.invalid/video'})).status,400);
  const src=(await request('/api/media/'+media.id+'/sources','POST',{url:'https://example.org/slugterra.html',label:'Testquelle'}));
  assert.equal(src.status,201);
  const source=src.data.item;
  assert.equal((await request('/api/media/'+media.id+'/sources','POST',{url:source.url})).status,409);
  assert.equal((await request('/api/sources/'+source.id+'/analyze','POST',{})).data.items.length,1);
  const items=(await request('/api/sources/'+source.id+'/items')).data.items;
  assert.equal(items[0].season,2);assert.equal(items[0].episode,8);
  const imported=await request('/api/sources/'+source.id+'/import-episodes','POST',{});
  assert.equal(imported.data.added,1);
  const saved=(await request('/api/backup/export')).data;
  assert.equal(saved.sources.length,1);
  assert.equal(saved.source_items.length,1);
  assert.equal((await request('/api/sources/'+source.id+'/import-episodes','POST',{})).data.added,0);
  const episode=(await request('/api/media/'+media.id+'/episodes')).data.items[0];
  assert.equal((await request('/api/transfers','POST',{mediaId:media.id,sourceId:source.id,itemId:items[0].id})).status,400);
  const transfer=await request('/api/transfers','POST',{mediaId:media.id,sourceId:source.id,itemId:items[0].id,episodeId:episode.id});
  assert.equal(transfer.status,201);
  assert.equal((await request('/api/transfers','POST',{mediaId:media.id,sourceId:source.id,itemId:items[0].id,episodeId:episode.id})).status,409);
  await app.transfers.tick();
  assert.equal(calls.length,1);
  assert.equal(calls[0].sourceUrl,items[0].url);
  assert.equal((await request('/api/transfers')).data.items[0].state,'complete');
  assert.equal((await request('/api/media/'+media.id+'/episodes')).data.items[0].status,'available');
  assert.equal((await request('/api/backup/import','POST',{...saved,confirm:'REPLACE'})).status,200);
  assert.equal((await request('/api/media/'+media.id+'/sources')).data.items.length,1);
  assert.equal((await request('/api/media/'+media.id+'/episodes')).data.items[0].status,'missing');
  const another=await request('/api/transfers','POST',{mediaId:media.id,sourceId:source.id,itemId:items[0].id,episodeId:episode.id});
  assert.equal(another.status,201);
  assert.equal((await request('/api/transfers/'+another.data.item.id+'/cancel','POST',{})).status,200);
  assert.equal((await request('/api/transfers/'+another.data.item.id+'/retry','POST',{})).status,200);
 },{sourceFetch,download});
});

test('0.0.9 database migrates in-place to 0.1.9 without losing existing media',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-migration-')),file=join(root,'old.sqlite');
 try{
  let db=openDatabase(file);
  const now=new Date().toISOString(),id='123e4567-e89b-12d3-a456-426614174000';
  db.prepare('INSERT INTO media(id,kind,title,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,'movie','Interstellar',now,now);
  db.exec('DROP TABLE transfer_jobs; DROP TABLE source_items; DROP TABLE sources; DROP TABLE search_sites; PRAGMA user_version=3');
  db.close();
  db=openDatabase(file);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,10);
  assert.equal(db.prepare('SELECT title FROM media WHERE id=?').get(id).title,'Interstellar');
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='transfer_jobs'").get().name,'transfer_jobs');
  db.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Phase 3 API: schedule, ranking, planner, notifications and VTT subtitle',async()=>{
 const subtitleFetch=async url=>({url,body:Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHallo\n')});
 const sourceFetch=async url=>({url,body:Buffer.from('<a href="/Slugterra-S02E08.m3u8" title="Slugterra S02E08">Folge</a>')});
 await harness(async({request,root,app})=>{
  assert.equal((await request('/api/notifications')).status,401);
  await request('/api/setup','POST',{password:'phase three test passphrase'});
  await request('/api/auth/login','POST',{password:'phase three test passphrase'});
  const result=await request('/api/automation/schedule','PUT',{enabled:true,startHour:8,endHour:19,days:[1,2,3,4,5],bandwidthKbps:512});
  assert.equal(result.status,200);
  assert.equal((await request('/api/automation/schedule')).data.schedule.bandwidthKbps,512);
  assert.equal((await request('/api/automation/schedule','PUT',{enabled:true,startHour:22,endHour:4})).status,400);
  const series=(await request('/api/media','POST',{kind:'series',title:'Slugterra'})).data.item;
  const source=(await request('/api/media/'+series.id+'/sources','POST',{url:'https://example.org/slugterra.html'})).data.item;
  await request('/api/sources/'+source.id+'/analyze','POST',{});
  await request('/api/sources/'+source.id+'/import-episodes','POST',{});
  const ranking=await request('/api/media/'+series.id+'/source-ranking');
  assert.equal(ranking.status,200);assert.equal(ranking.data.items.length,1);
  const plan=await request('/api/media/'+series.id+'/download-plan?sourceId='+source.id);
  assert.equal(plan.data.missing,1);
  const queued=await request('/api/transfers/batch','POST',{mediaId:series.id,sourceId:source.id});
  assert.equal(queued.data.queued,1);
  assert.equal((await request('/api/diagnostics')).data.transferCounts.queued,1);
  const backup=(await request('/api/backup/export')).data;
  assert.ok(backup.config.find(x=>x.key==='transfer_schedule'));
  assert.equal((await request('/api/backup/import','POST',{...backup,confirm:'REPLACE'})).status,200);
  assert.equal((await request('/api/automation/schedule')).data.schedule.bandwidthKbps,512);
  const movie=(await request('/api/media','POST',{kind:'movie',title:'Interstellar',year:2014})).data.item;
  const fileDir=join(root,'Movies','Interstellar (2014)');await mkdir(fileDir,{recursive:true});
  await writeFile(join(fileDir,'Interstellar (2014).mp4'),Buffer.alloc(2048,9));
  const subtitle=await request('/api/subtitles','POST',{mediaId:movie.id,url:'https://example.org/de.vtt',language:'de'});
  assert.equal(subtitle.status,201);
  assert.match(subtitle.data.result.path,/Interstellar.*de\.srt/);
  assert.equal((await request('/api/subtitles','POST',{mediaId:movie.id,url:'https://example.org/de.vtt',language:'de'})).status,400);
  const notices=await request('/api/notifications');
  assert.equal(notices.status,200);assert.equal(notices.data.items.length,1);
  const noticeId=notices.data.items[0].id;
  assert.equal((await request('/api/notifications/'+noticeId+'/read','POST',{})).data.ok,true);
  assert.equal((await request('/api/diagnostics')).data.unreadNotifications,0);
 },{subtitleFetch,sourceFetch});
});

test('Phase 5 authenticated automation API and safe JSON backup restore',async()=>{
 const sourceFetch=async url=>({url,body:Buffer.from('<a title="Slugterra S01E01" href="/Slugterra-S01E01.m3u8">1</a>')});
 await harness(async({app,request})=>{
  assert.equal((await request('/api/automation/sources')).status,401);
  assert.equal((await request('/api/setup','POST',{password:'automation security test passphrase'})).status,201);
  assert.equal((await request('/api/auth/login','POST',{password:'automation security test passphrase'})).status,200);
  const media=(await request('/api/media','POST',{kind:'series',title:'Slugterra'})).data.item;
  const source=(await request('/api/media/'+media.id+'/sources','POST',{url:'https://example.org/slugterra'})).data.item;
  const base='/api/sources/'+source.id+'/automation';
  assert.equal((await request(base)).data.policy.enabled,false);
  assert.equal((await request(base,'PUT',{enabled:true,autoQueue:false,intervalMinutes:10})).status,400);
  const policy=await request(base,'PUT',{enabled:true,autoQueue:false,intervalMinutes:30,maxPerCheck:5});
  assert.equal(policy.status,200);
  assert.equal(policy.data.policy.enabled,true);
  assert.equal((await request('/api/automation/sources')).data.items.length,1);
  const check=await request(base+'/check','POST',{});
  assert.equal(check.status,200);assert.equal(check.data.newEpisodes,1);assert.equal(check.data.queued,0);
  assert.equal((await request(base+'/history')).data.items[0].status,'success');
  const backup=(await request('/api/backup/export')).data;
  assert.equal(backup.source_automation.length,1);
  const restored=await request('/api/backup/import','POST',{...backup,confirm:'REPLACE'});
  assert.equal(restored.status,200);
  const after=(await request(base)).data.policy;
  assert.equal(after.enabled,false);
  assert.equal(after.autoQueue,false);
  assert.equal(after.intervalMinutes,30);
  const manual=await request(base+'/check','POST',{});
  assert.equal(manual.status,200);assert.equal(manual.data.newEpisodes,0);
  assert.equal((await request('/api/transfers')).data.items.length,0);
 },{sourceFetch});
});
