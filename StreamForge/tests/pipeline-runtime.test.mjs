import assert from 'node:assert/strict';
import { createDynamicLimiter, recommendedBufferPairs, recommendedBufferLimits, effectiveBufferPairs, pipelineBottleneck } from '../pipeline-runtime.js';

assert.equal(recommendedBufferPairs(1),12);
assert.equal(recommendedBufferPairs(4),12);
assert.equal(recommendedBufferPairs(8),24);
assert.deepEqual(recommendedBufferLimits(8),{maxPairs:24,maxBytes:160*1024*1024});
assert.equal(effectiveBufferPairs(8,5*1024*1024),24);
assert.equal(effectiveBufferPairs(8,20*1024*1024),8);
assert.equal(effectiveBufferPairs(4,5*1024*1024),12);

let limit=3,active=0,maxActive=0;
const limiter=createDynamicLimiter(()=>limit);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tasks=Array.from({length:9},(_,i)=>limiter.run(async()=>{
  active++; maxActive=Math.max(maxActive,active);
  await sleep(8+(i%2));
  active--;
  return i;
}));
const values=await Promise.all(tasks);
assert.deepEqual(values,[0,1,2,3,4,5,6,7,8]);
assert.ok(maxActive<=3);
assert.equal(limiter.active(),0);
assert.equal(limiter.queued(),0);

let release; const gate=new Promise(r=>release=r); const limiterCancel=createDynamicLimiter(()=>1);
const first=limiterCancel.run(async()=>{await gate;return 1;});
const second=limiterCancel.run(async()=>2);
limiterCancel.cancelPending(new Error('stop'));
await assert.rejects(second,/stop/); release(); assert.equal(await first,1);

// Dynamic reduction: requests already running finish, but the queue does not
// launch replacements above the new limit.
limit=4; active=0; maxActive=0;
const limiter2=createDynamicLimiter(()=>limit);
let finished=0;
const tasks2=Array.from({length:8},(_,i)=>limiter2.run(async()=>{
  active++; maxActive=Math.max(maxActive,active);
  if(i===0){await sleep(5);limit=1;limiter2.refresh();}
  await sleep(12);
  active--;finished++;
}));
await Promise.all(tasks2);
assert.equal(finished,8);
assert.ok(maxActive<=4);

assert.equal(pipelineBottleneck({downloadDone:2,muxDone:2,total:100,bufferPairs:0,bufferCapacity:8,activeRequests:4}),'Netzwerk');
assert.equal(pipelineBottleneck({downloadDone:20,muxDone:5,total:100,bufferPairs:7,bufferCapacity:8,activeRequests:4,headReady:true}),'Muxing');
assert.equal(pipelineBottleneck({downloadDone:20,muxDone:5,total:100,bufferPairs:7,bufferCapacity:8,activeRequests:1,headReady:false}),'Netzwerk');
assert.equal(pipelineBottleneck({downloadDone:20,muxDone:12,total:100,bufferPairs:3,bufferCapacity:8,activeRequests:4}),'Gemischt');
assert.equal(pipelineBottleneck({downloadDone:100,muxDone:90,total:100,bufferPairs:0,bufferCapacity:8,activeRequests:0}),'Muxing');
console.log('pipeline runtime tests ok');
