import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {commandReady,downloadReadiness} from '../src/download-readiness.mjs';
import {createApp} from '../src/server.mjs';

test('v1.8.3 download preflight separates ready storage and FFmpeg from a missing media source',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'forgecore-readiness-'));
 try{
  const good=await downloadReadiness({mediaRoot:folder,probe:async()=>true});
  assert.equal(good.ready,true);
  assert.deepEqual(good.checks,{storage:true,ffmpeg:true,ffprobe:true});
  assert.match(good.notices.join(' '),/Medienquelle/);
  const bad=await downloadReadiness({mediaRoot:'/not/a/real/media/root',probe:async()=>false});
  assert.equal(bad.ready,false);
  assert.equal(bad.checks.storage,false);
  assert.equal(bad.checks.ffmpeg,false);
  assert.equal(bad.checks.ffprobe,false);
  assert.equal(JSON.stringify(bad).includes('/not/a/real/media/root'),false);
 }finally{await rm(folder,{recursive:true,force:true})}
});
test('v1.8.3 command probe fails closed on missing tool or abnormal exit',async()=>{
 const missing=await commandReady('fake',{spawnCommand:()=>{
  const emitter=new EventEmitter();
  process.nextTick(()=>emitter.emit('error',Error('No binary')));
  return emitter;
 }});
 assert.equal(missing,false);
});
test('v1.8.3 download readiness endpoint requires login and never reveals file paths or credentials',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'forgecore-readiness-api-'));
 const app=createApp({dbPath:join(folder,'state.db'),mediaRoot:folder,startWorker:false,staticFiles:false});
 await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
 const base='http://127.0.0.1:'+app.server.address().port;
 let cookie='',csrf='';
 const call=async(path,method='GET',body)=>{
  const result=await fetch(base+path,{method,headers:{'x-forgecore-request':'1',
   ...(cookie?{cookie}:{}),...(csrf?{'x-forgecore-csrf':csrf}:{}),
   ...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const header=result.headers.get('set-cookie');
  if(header)cookie=header.split(';')[0];
  const data=await result.json();
  if(data.csrf)csrf=data.csrf;
  return {status:result.status,data};
 };
 try{
  assert.equal((await call('/api/downloads/readiness')).status,401);
  assert.equal((await call('/api/setup','POST',{password:'test-pass-12345-readiness'})).status,201);
  assert.equal((await call('/api/auth/login','POST',{password:'test-pass-12345-readiness'})).status,200);
  const res=await call('/api/downloads/readiness');
  assert.equal(res.status,200);
  assert.equal(typeof res.data.checks.storage,'boolean');
  assert.equal(typeof res.data.checks.ffmpeg,'boolean');
  assert.equal(typeof res.data.checks.ffprobe,'boolean');
  assert.equal(JSON.stringify(res.data).includes(folder),false);
 }finally{await app.close();await rm(folder,{recursive:true,force:true})}
});
