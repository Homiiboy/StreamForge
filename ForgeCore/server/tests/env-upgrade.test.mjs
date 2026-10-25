import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,stat,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const upgrader=join(root,'upgrade.sh');
const available=spawnSync('bash',['-c','command -v zip && command -v unzip'],{stdio:'ignore'}).status===0;
const secret='FORGECORE_TMDB_TOKEN=test-secret-that-must-never-leak\nFORGECORE_MEDIA_HOST_PATH=/mnt/jellyfin\n';
async function fixture({withEnv=true,malicious=false,symlinkPayload=false}={}){
 const dir=await mkdtemp(join(tmpdir(),'forgecore-config-upgrade-'));
 const installed=join(dir,'installed'),payload=join(dir,'source'),archive=join(dir,'update.zip');
 await mkdir(join(installed,'server'),{recursive:true});
 await mkdir(join(payload,'ForgeCore','server'),{recursive:true});
 await writeFile(join(installed,'manage.sh'),'#!/usr/bin/env bash\nprintf old >> .management-log\n');
 if(withEnv)await writeFile(join(installed,'.env'),secret,{mode:0o600});
 await writeFile(join(installed,'server','old.js'),'old');
 await writeFile(join(payload,'ForgeCore','manage.sh'),'#!/usr/bin/env bash\n[ "$1" = update ] && printf updated > .management-log\n');
 await writeFile(join(payload,'ForgeCore','compose.yaml'),'name: forgecore\n');
 await writeFile(join(payload,'ForgeCore','.env.example'),'FORGECORE_TMDB_TOKEN=\n');
 await writeFile(join(payload,'ForgeCore','server','new.js'),'new');
 if(malicious)await writeFile(join(payload,'ForgeCore','.env'),'FORGECORE_TMDB_TOKEN=ATTACKER\n');
 if(symlinkPayload)await symlink('/etc/passwd',join(payload,'ForgeCore','server','link'));
 const args=symlinkPayload?['-qry']:['-qr'];
 const zipped=spawnSync('zip',[...args,archive,'ForgeCore'],{cwd:payload,encoding:'utf8'});
 assert.equal(zipped.status,0,zipped.stderr);
 return {dir,installed,payload,archive};
}
test('v1.6.1 archive updater retains .env and creates a private snapshot before update',{skip:!available},async()=>{
 const f=await fixture();
 try{
  const old=(await stat(join(f.installed,'.env'))).mode&0o777;
  const output=spawnSync('bash',[upgrader,f.archive],{cwd:f.installed,encoding:'utf8'});
  assert.equal(output.status,0,output.stderr+'\n'+output.stdout);
  assert.equal(await readFile(join(f.installed,'.env'),'utf8'),secret);
  assert.equal(await readFile(join(f.installed,'.management-log'),'utf8'),'updated');
  assert.equal(await readFile(join(f.installed,'server','new.js'),'utf8'),'new');
  assert.equal((await stat(join(f.installed,'.env'))).mode&0o777,0o600);
  const backups=await readdir(join(f.installed,'backups'));
  assert.ok(backups.some(name=>name.startsWith('env-before-upgrade-')));
  const name=backups.find(name=>name.startsWith('env-before-upgrade-'));
  assert.equal(await readFile(join(f.installed,'backups',name,'.env'),'utf8'),secret);
  assert.equal((await stat(join(f.installed,'backups',name))).mode&0o777,0o700);
  assert.equal((await stat(join(f.installed,'backups',name,'.env'))).mode&0o777,0o600);
 }finally{await rm(f.dir,{recursive:true,force:true})}
});
test('v1.6.1 refuses ZIP packages containing user .env, without leaking tokens',{skip:!available},async()=>{
 const f=await fixture({malicious:true});
 try{
  const output=spawnSync('bash',[upgrader,f.archive],{cwd:f.installed,encoding:'utf8'});
  assert.notEqual(output.status,0);
  assert.match(output.stderr,/protected configuration/i);
  assert.equal(await readFile(join(f.installed,'.env'),'utf8'),secret);
  assert.equal(await readFile(join(f.installed,'server','old.js'),'utf8'),'old');
  assert.ok(!output.stdout.includes('test-secret'));
 }finally{await rm(f.dir,{recursive:true,force:true})}
});
test('v1.6.1 refuses ZIP symlinks and does not change original configuration',{skip:!available},async()=>{
 const f=await fixture({symlinkPayload:true});
 try{
  const output=spawnSync('bash',[upgrader,f.archive],{cwd:f.installed,encoding:'utf8'});
  assert.notEqual(output.status,0);
  assert.match(output.stderr,/symlinks/i);
  assert.equal(await readFile(join(f.installed,'.env'),'utf8'),secret);
 }finally{await rm(f.dir,{recursive:true,force:true})}
});
test('v1.6.1 never fabricates a replacement .env after a missing config',{skip:!available},async()=>{
 const f=await fixture({withEnv:false});
 try{
  const output=spawnSync('bash',[upgrader,f.archive],{cwd:f.installed,encoding:'utf8'});
  assert.notEqual(output.status,0);
  assert.match(output.stderr,/Existing .env/);
  assert.equal((await readdir(f.installed)).includes('.env'),false);
 }finally{await rm(f.dir,{recursive:true,force:true})}
});
