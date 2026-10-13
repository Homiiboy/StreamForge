import assert from 'node:assert/strict';
import { TransferMetrics, muxEtaSeconds } from '../metrics.js';

let t=0; const m=new TransferMetrics(()=>t);
t=1000; m.addDownloaded(1024*1024);
t=2000; m.addDownloaded(1024*1024);
assert.equal(Math.round(m.speedBps()/1024/1024),1);
m.addTiming(2000,200); assert.equal(m.bottleneck(),'Netzwerk');

// ETA stays hidden during warm-up instead of extrapolating absurd values from
// one or two HLS segments.
let snap=m.snapshot({segmentDone:2,segmentTotal:100,downloadProgress:2,phaseStartedAt:0});
assert.equal(snap.etaSeconds,0);
assert.equal(snap.etaPending,true);

t=12000;
snap=m.snapshot({segmentDone:20,segmentTotal:100,downloadProgress:20,phaseStartedAt:0});
assert.equal(snap.etaSeconds,48);
assert.equal(snap.etaPending,false);

const m2=new TransferMetrics(()=>t); m2.addTiming(100,900); assert.equal(m2.bottleneck(),'Muxing');
assert.equal(muxEtaSeconds(5,10,0,5000),5);
assert.equal(muxEtaSeconds(5,10,1000,6000),5);
console.log('metrics tests ok');
