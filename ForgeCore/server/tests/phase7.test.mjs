import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase,newId,utc} from '../src/db.mjs';
import {operationalStatus,diagnosticEvents} from '../src/operations.mjs';

test('operations: disk and SQLite status omit private Jellyfin credentials',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forgecore-ops-')),db=openDatabase(join(dir,'app.sqlite'));
 try{
  db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run('jellyfin_api_key','do-not-expose-this-secret');
  const id=newId(),now=utc();
  db.prepare('INSERT INTO media(id,kind,title,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,'series','Slugterra',now,now);
  const info=await operationalStatus(db,{mediaRoot:dir,stagingRoot:dir,version:'0.9.9'});
  assert.equal(info.database.integrity,'ok');assert.equal(info.totals.series,1);
  assert.equal(info.media.readable,true);assert.equal(info.data.writable,true);
  assert.ok(!JSON.stringify(info).includes('do-not-expose-this-secret'));
  assert.deepEqual(diagnosticEvents(db),{failedTransfers:[],sourceErrors:[]});
 }finally{db.close();await rm(dir,{recursive:true,force:true})}
});
test('operations: missing media path produces warnings',async()=>{
 const db=openDatabase();
 try{
  const info=await operationalStatus(db,{mediaRoot:'/forgecore-missing-volume-test',stagingRoot:'/forgecore-missing-volume-test'});
  assert.equal(info.media.readable,false);
  assert.ok(info.warnings.length>=2);
 }finally{db.close()}
});
test('operational soak: database survives 1200 media projects and reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forgecore-soak-')),path=join(dir,'soak.sqlite');
 try{
  const db=openDatabase(path),now=utc(),insert=db.prepare('INSERT INTO media(id,kind,title,created_at,updated_at) VALUES(?,?,?,?,?)');
  db.exec('BEGIN');
  for(let i=0;i<1200;i++)insert.run(newId(),'movie','Example '+i,now,now);
  db.exec('COMMIT');db.close();
  const restored=openDatabase(path);
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM media').get().n,1200);
  assert.equal(restored.prepare('PRAGMA quick_check').get().quick_check,'ok');
  restored.close();
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('ZimaOS lifecycle shell is syntax-valid and provides usage without Docker',()=>{
 const script=resolve(dirname(fileURLToPath(import.meta.url)),'../../manage.sh');
 const parse=spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(parse.status,0,parse.stderr);
 const help=spawnSync('bash',[script,'help'],{encoding:'utf8'});
 assert.equal(help.status,0,help.stderr);
 assert.match(help.stdout,/doctor|status/);
});
