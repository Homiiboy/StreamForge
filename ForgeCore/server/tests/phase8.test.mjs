import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp,APP_VERSION} from '../src/server.mjs';
import {openDatabase,newId,utc} from '../src/db.mjs';
import {operationalStatus} from '../src/operations.mjs';

test('v1.8.3 release metadata keeps the frozen extension distinct',async()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../');
 const manifest=JSON.parse(await readFile(join(root,'browser-extension/manifest.json'),'utf8'));
 const pkg=JSON.parse(await readFile(join(root,'server/package.json'),'utf8'));
 assert.equal(APP_VERSION,'1.8.3');
 assert.equal(pkg.version,APP_VERSION);
 assert.equal(manifest.version,'1.8.11');
});
test('release operations and diagnostics stay authenticated and redact credentials',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-release-'));
 const app=createApp({dbPath:join(root,'forgecore.sqlite'),mediaRoot:root,startWorker:false,staticFiles:false});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 let cookie='',csrf='';
 const request=async(path,method='GET',body)=>{
  const headers={'x-forgecore-request':'1',...(cookie?{cookie}:{}),...(csrf?{'x-forgecore-csrf':csrf}:{}),...(body?{'content-type':'application/json'}:{})};
  const res=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});
  const data=res.headers.get('content-type')?.includes('application/json')?await res.json():null;
  const newCookie=res.headers.get('set-cookie');if(newCookie)cookie=newCookie.split(';')[0];
  if(data?.csrf)csrf=data.csrf;return {status:res.status,data};
 };
 try{
  assert.equal((await request('/api/health')).data.version,'1.8.3');
  assert.equal((await request('/api/operations')).status,401);
  assert.equal((await request('/api/operations/errors')).status,401);
  assert.equal((await request('/api/backup/export')).status,401);
  assert.equal((await request('/api/setup','POST',{password:'release test password at least 12 chars'})).status,201);
  assert.equal((await request('/api/auth/login','POST',{password:'release test password at least 12 chars'})).status,200);
  const media=await request('/api/media','POST',{kind:'series',title:'Slugterra'});
  assert.equal(media.status,201);
  const ops=await request('/api/operations');
  assert.equal(ops.status,200);assert.equal(ops.data.database.integrity,'ok');
  assert.equal(ops.data.totals.series,1);
  assert.equal((await request('/api/operations/errors')).status,200);
  const backup=await request('/api/backup/export');
  assert.equal(backup.status,200);
  assert.equal(backup.data.media.length,1);
  assert.equal((await request('/api/media','POST',{kind:'movie',title:'Blocked'})).status,201);
  const restored=await request('/api/backup/import','POST',{...backup.data,confirm:'REPLACE'});
  assert.equal(restored.status,200,JSON.stringify(restored.data));
  assert.equal((await request('/api/media')).data.items.length,1);
  assert.equal((await request('/api/auth/logout','POST')).status,200);
  assert.equal((await request('/api/operations')).status,401);
 }finally{await app.close();await rm(root,{recursive:true,force:true})}
});
test('v1.0.0 SQLite integrity and existing configuration stay intact across restart',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-migration-v1-')),file=join(root,'old.sqlite');
 try{
  const db=openDatabase(file),id=newId(),now=utc();
  db.prepare('INSERT INTO media(id,kind,title,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,'movie','The Lion King',now,now);
  db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run('preferred_language','de');
  const before=db.prepare('PRAGMA user_version').get().user_version;db.close();
  const reopened=openDatabase(file);
  assert.equal(reopened.prepare('PRAGMA user_version').get().user_version,before);
  assert.equal(reopened.prepare('SELECT title FROM media WHERE id=?').get(id).title,'The Lion King');
  assert.equal(reopened.prepare("SELECT value FROM config WHERE key='preferred_language'").get().value,'de');
  assert.equal(reopened.prepare('PRAGMA quick_check').get().quick_check,'ok');
  reopened.close();
 }finally{await rm(root,{recursive:true,force:true})}
});
