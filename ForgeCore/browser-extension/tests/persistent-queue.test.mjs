import assert from 'node:assert/strict';
import { PersistentDownloadQueue } from '../persistent-queue.js';

const db = new Map();
const storage = {
  async get(key) { return { [key]: structuredClone(db.get(key)) }; },
  async set(entries) { for (const [k,v] of Object.entries(entries)) db.set(k, structuredClone(v)); }
};
const job = (id, url='https://example.test/stream.m3u8') => ({
  id, type:'sf_hls_start', job: {jobId:'job-'+id,tabId:1,candidateId:id,url}
});
const waitUntil = async pred => {
  for(let i=0;i<300;i++) { if(pred()) return; await new Promise(r=>setTimeout(r,2)); }
  throw Error('timeout waiting for queue');
};
let unlock;
const gate=new Promise(r=>unlock=r);
const done=[];
const queue=new PersistentDownloadQueue({
  storage, execute: async record => { done.push('start:'+record.id); if(record.id==='one')await gate; done.push('end:'+record.id); }
});
await queue.ready;
assert.equal((await queue.enqueue(job('one'))).ok,true);
await waitUntil(()=>queue.active?.id==='one');
await queue.enqueue(job('two'));
await queue.enqueue(job('three'));
assert.equal(queue.waiting,2);
assert.equal((await queue.enqueue(job('two'))).ok,false);
assert.equal(await queue.cancel('three'),true);
assert.equal(await queue.cancel('one'),false);
assert.deepEqual(db.get('sf_queue_v170').pending.map(x=>x.id),['two']);
unlock();
await waitUntil(()=>done.includes('end:two'));
await waitUntil(()=>queue.active===null && queue.waiting===0);
assert.deepEqual(done,['start:one','end:one','start:two','end:two']);

const recoveredDb=new Map([['sf_queue_v170',{version:1,active:job('previous'),pending:[job('recover'),{bad:true}]}]]);
const recoveredStorage={
 async get(k){return {[k]:structuredClone(recoveredDb.get(k))};},
 async set(obj){for(const [k,v] of Object.entries(obj))recoveredDb.set(k,structuredClone(v));}
};
const interrupted=[],replayed=[];
const recovery=new PersistentDownloadQueue({
 storage:recoveredStorage,
 execute:async record=>{replayed.push(record.id);},
 onInterrupted:async record=>{interrupted.push(record.id);}
});
await recovery.ready;
await waitUntil(()=>replayed.includes('recover'));
assert.deepEqual(interrupted,['previous']);
assert.deepEqual(replayed,['recover']);
await waitUntil(()=>recovery.active===null);
assert.equal(recoveredDb.get('sf_queue_v170').active,null);
// Paused pending jobs remain persisted and only start after resume.
const pausedDb=new Map([['sf_queue_v170',{version:1,paused:true,active:null,pending:[job('paused-job')]}]]);
const pausedStorage={
  async get(k){return {[k]:structuredClone(pausedDb.get(k))};},
  async set(obj){for(const [k,v] of Object.entries(obj))pausedDb.set(k,structuredClone(v));}
};
const pausedStarted=[];
const pausedQueue=new PersistentDownloadQueue({storage:pausedStorage,execute:async record=>pausedStarted.push(record.id)});
await pausedQueue.ready;
await new Promise(r=>setTimeout(r,10));
assert.equal(pausedQueue.paused,true);
assert.deepEqual(pausedStarted,[]);
await pausedQueue.setPaused(false);
await waitUntil(()=>pausedStarted.length===1);
assert.deepEqual(pausedStarted,['paused-job']);
assert.equal(pausedDb.get('sf_queue_v170').paused,false);
// A stale storage snapshot may contain duplicate rows or malformed jobs.
const malformedDb=new Map([['sf_queue_v170',{version:1,paused:true,active:null,pending:[
  job('once'), job('once'), {bad:true}, job('twice')
]}]]);
const malformedStorage={
  async get(k){return {[k]:structuredClone(malformedDb.get(k))};},
  async set(obj){for(const [k,v] of Object.entries(obj))malformedDb.set(k,structuredClone(v));}
};
const sanitized=new PersistentDownloadQueue({storage:malformedStorage,execute:async()=>{}});
await sanitized.ready;
assert.deepEqual(sanitized.pending.map(x=>x.id),['once','twice']);
assert.deepEqual(malformedDb.get('sf_queue_v170').pending.map(x=>x.id),['once','twice']);
assert.equal(await sanitized.movePending('twice','up'),true);
assert.deepEqual(sanitized.pending.map(x=>x.id),['twice','once']);
assert.equal(malformedDb.get('sf_queue_v170').pending[0].id,'twice');
assert.equal(await sanitized.movePending('twice','up'),false);
assert.equal(await sanitized.movePending('twice','down'),true);
await assert.rejects(sanitized.movePending('twice','sideways'),/Richtung/);
// Concurrent enqueue operations must not create stale snapshots that replay finished work.
const raceSnapshots=[];
let unlockWrite;
const slowWrite=new Promise(resolve=>unlockWrite=resolve);
let writeCount=0;
const raceStorage={
  async get(){return {};},
  async set(value) {
    if(++writeCount===1) await slowWrite;
    raceSnapshots.push(structuredClone(value.sf_queue_v170));
  }
};
const raced=[];
const raceQueue=new PersistentDownloadQueue({storage:raceStorage,execute:async entry=>raced.push(entry.id)});
await raceQueue.ready;
const raceOne=raceQueue.enqueue(job('race-1'));
const raceTwo=raceQueue.enqueue(job('race-2'));
unlockWrite();
assert.equal((await raceOne).ok,true);
assert.equal((await raceTwo).ok,true);
await waitUntil(()=>raced.length===2 && raceQueue.active===null);
await raceQueue.lock;
assert.deepEqual(raced,['race-1','race-2']);
assert.equal(raceSnapshots.at(-1).active,null);
assert.deepEqual(raceSnapshots.at(-1).pending,[]);
console.log('Persistent queue restore and cancellation tests passed');
