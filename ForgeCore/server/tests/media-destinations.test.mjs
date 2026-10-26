import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {previewLibrary,validateDestination} from '../src/library.mjs';
import {createApp} from '../src/server.mjs';
import {openDatabase} from '../src/db.mjs';

test('v1.8.5 explicit destinations route anime, animation, cartoon and anime movies separately',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-dest-'));
 try{
  const episode={season:1,episode:49};
  for(const target of ['Animes','Animation','Cartoon']){
   await mkdir(join(root,target,'One Piece','Staffel 01'),{recursive:true});
   const preview=await previewLibrary(root,{kind:'series',title:'One Piece',destination:target},episode);
   assert.equal(preview.directory,target+'/One Piece/Staffel 01');
  }
  await mkdir(join(root,'Anime Movies','Akira (1988)'),{recursive:true});
  const animeMovie=await previewLibrary(root,{kind:'movie',title:'Akira',year:1988,destination:'Anime Movies'});
  assert.equal(animeMovie.directory,'Anime Movies/Akira (1988)');
  const movie=await previewLibrary(root,{kind:'movie',title:'Akira',year:1988,destination:'auto'});
  assert.equal(movie.directory,'Movies/Akira (1988)');
  assert.equal(validateDestination('series','Animes'),'Animes');
  for(const [kind,destination] of [['series','Anime Movies'],['movie','Cartoon'],['series','../../escape'],['movie','/media/other']]){
   assert.throws(()=>validateDestination(kind,destination),e=>e.status===400);
  }
 }finally{await rm(root,{recursive:true,force:true})}
});
test('v1.8.5 destination persists in SQLite, preview, backup/restore and rejects unsafe categories',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-dest-api-'));
 await mkdir(join(root,'Animes'),{recursive:true});
 const app=createApp({dbPath:join(root,'state.sqlite'),mediaRoot:root,startWorker:false,staticFiles:false});
 await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+app.server.address().port;
 let cookie='',csrf='';
 const call=async(path,method='GET',body)=>{
  const r=await fetch(base+path,{method,headers:{'x-forgecore-request':'1',
   ...(cookie?{cookie}:{}),...(csrf?{'x-forgecore-csrf':csrf}:{}),
   ...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
  const data=await r.json();
  if(data.csrf)csrf=data.csrf;
  return {status:r.status,data};
 };
 try{
  assert.equal((await call('/api/media/destinations')).status,401);
  assert.equal((await call('/api/setup','POST',{password:'passphrase-for-destination-tests'})).status,201);
  assert.equal((await call('/api/auth/login','POST',{password:'passphrase-for-destination-tests'})).status,200);
  const options=await call('/api/media/destinations');
  assert.deepEqual(options.data.series,['auto','TV shows','Animes','Animation','Cartoon']);
  assert.deepEqual(options.data.movie,['auto','Movies','Anime Movies']);
  const created=await call('/api/media','POST',{kind:'series',title:'One Piece',destination:'Animes'});
  assert.equal(created.status,201);
  const id=created.data.item.id;
  assert.equal(created.data.item.destination,'Animes');
  const ep=await call('/api/media/'+id+'/episodes','POST',{season:1,episode:49});
  assert.equal(ep.status,201);
  const preview=await call('/api/media/'+id+'/preview');
  assert.equal(preview.status,200,JSON.stringify(preview.data));
  assert.equal(preview.data.items[0].directory,'Animes/One Piece/Season 01');
  const patched=await call('/api/media/'+id,'PATCH',{destination:'Cartoon'});
  assert.equal(patched.status,200);
  assert.equal(patched.data.item.destination,'Cartoon');
  assert.equal((await call('/api/media/'+id,'PATCH',{destination:'../Cartoon'})).status,400);
  assert.equal((await call('/api/media','POST',{kind:'movie',title:'Akira',destination:'Animes'})).status,400);
  const film=await call('/api/media','POST',{kind:'movie',title:'Akira',year:1988,destination:'Anime Movies'});
  assert.equal(film.status,201);
  assert.equal((await call('/api/media/'+film.data.item.id+'/preview')).data.items[0].directory,'Anime Movies/Akira (1988)');
  const backup=(await call('/api/backup/export')).data;
  assert.equal(backup.media.find(x=>x.id===id).destination,'Cartoon');
  const restored=await call('/api/backup/import','POST',{...backup,confirm:'REPLACE'});
  assert.equal(restored.status,200,JSON.stringify(restored.data));
  assert.equal((await call('/api/media/'+id)).data.item.destination,'Cartoon');
  assert.equal((await call('/api/media/'+film.data.item.id)).data.item.destination,'Anime Movies');
 }finally{await app.close();await rm(root,{recursive:true,force:true})}
});
test('v1.8.5 existing database schema safely migrates default category to auto',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-dest-migrate-'));
 const file=join(root,'db.sqlite');
 try{
  const db=openDatabase(file);
  const version=db.prepare('PRAGMA user_version').get().user_version;
  assert.ok(version>1);
  db.prepare("INSERT INTO media(id,kind,title,notes,created_at,updated_at) VALUES('one','series','One Piece','','now','now')").run();
  db.close();
  const again=openDatabase(file);
  assert.equal(again.prepare("SELECT destination FROM media WHERE id='one'").get().destination,'auto');
  again.close();
 }finally{await rm(root,{recursive:true,force:true})}
});
