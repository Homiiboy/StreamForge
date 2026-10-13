import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,copyFile} from 'node:fs/promises';
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

test('mock Docker lifecycle exercises update backup and manual rollback with no media deletion',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-mock-zimaos-')),bin=join(root,'bin'),media=join(root,'media');
 await mkdir(bin);await mkdir(media);
 const src=resolve(dirname(fileURLToPath(import.meta.url)),'../../manage.sh');
 await copyFile(src,join(root,'manage.sh'));
 await writeFile(join(root,'.env'),'FORGECORE_MEDIA_HOST_PATH='+media+'\n');
 const log=join(root,'docker.log');
 const mock=[
 '#!/bin/sh','echo "$*" >> "$MOCK_LOG"',
 'if [ "$1" = compose ]; then',
 ' case "$2" in version|config|build|stop|start|up) exit 0;; ps) echo testcontainer;exit 0;; esac',
 'fi',
 'if [ "$1" = inspect ]; then',
 ' case "$*" in',
 '  *".Image"*) printf "sha256:";printf "%064d\n" 0;;',
 '  *".Mounts"*) echo forgecore_forgecore-data;;',
 '  *".State.Health"*) echo healthy;;',
 ' esac;exit 0',
 'fi',
 'if [ "$1" = run ]; then',
 ' for arg in "$@";do',
 '  case "$arg" in *":/backup")',
 '   dir="$(printf "%s" "$arg" | cut -d: -f1)";mkdir -p "$dir";printf "snapshot" > "$dir/data.tar.gz";;',
 '  esac',
 ' done',
 'fi',
 'exit 0'
 ].join('\n')+'\n';
 await writeFile(join(bin,'docker'),mock,{mode:0o755});
 const env={...process.env,PATH:bin+':'+process.env.PATH,MOCK_LOG:log};
 const run=(...args)=>spawnSync('bash',[join(root,'manage.sh'),...args],{encoding:'utf8',env,timeout:15000});
 try{
  const doc=run('doctor');assert.equal(doc.status,0,doc.stderr);
  const update=run('update');assert.equal(update.status,0,update.stderr);
  const dir=join(root,'backups');
  const {readdir}=await import('node:fs/promises');
  const snapshots=await readdir(dir);
  assert.equal(snapshots.length,1);
  assert.ok((await readFile(join(dir,snapshots[0],'data.tar.gz'))).length>0);
  const rollback=run('rollback',join(dir,snapshots[0]));
  assert.equal(rollback.status,0,rollback.stderr);
  const commands=await readFile(log,'utf8');
  assert.match(commands,/compose build forgecore/);
  assert.match(commands,/compose stop forgecore/);
  assert.match(commands,/compose up -d --no-build/);
  assert.ok(!commands.includes('/media'));
 }finally{await rm(root,{force:true,recursive:true})}
});
