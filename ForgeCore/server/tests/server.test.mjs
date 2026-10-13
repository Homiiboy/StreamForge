import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp,APP_VERSION} from '../src/server.mjs';
import {openDatabase} from '../src/db.mjs';
import {mediaRelative,mediaBaseName,safePart,ensureWithin,previewLibrary} from '../src/library.mjs';
import {JobQueue} from '../src/queue.mjs';

async function harness(fn){
 const root=await mkdtemp(join(tmpdir(),'forgecore-test-'));
 let app=createApp({dbPath:join(root,'db.sqlite'),mediaRoot:root,startWorker:false});
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
test('v0.0.9 setup, auth, CRUD, jobs, exports and secure API',async()=>harness(async({app,request,root})=>{
 assert.equal(APP_VERSION,'0.0.9');
 assert.equal((await request('/api/health')).data.version,'0.0.9');
 assert.equal((await request('/api/status')).data.capabilities.downloads,false);
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
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,3);db.close();
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
