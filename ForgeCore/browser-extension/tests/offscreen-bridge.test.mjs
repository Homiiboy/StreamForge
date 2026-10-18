import assert from 'node:assert/strict';
import {waitForOffscreenReceiver} from '../offscreen-bridge.js';
let calls=0;
await waitForOffscreenReceiver(async msg=>{
  assert.equal(msg.target,'offscreen');
  assert.equal(msg.type,'sf_offscreen_ping');
  calls++;
  if(calls<3)throw new Error('Could not establish connection. Receiving end does not exist.');
  return {ok:true,ready:true};
},{attempts:5,delayMs:0,sleep:async()=>{}});
assert.equal(calls,3);
await assert.rejects(waitForOffscreenReceiver(async()=>({ok:false}),{attempts:2,delayMs:0,sleep:async()=>{}}),e=>e.code==='OFFSCREEN_NOT_READY'&&/Neu laden/.test(e.message));
console.log('Offscreen receiver readiness tests passed');
