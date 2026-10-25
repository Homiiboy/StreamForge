import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mediaCandidate,publicAddress,validatePublicUrl,inspectPage} from '../src/agent.mjs';
const resolver=async()=>[{address:'93.184.215.14',family:4}];
test('public browser targets block localhost, private IP, insecure protocols, credentials and unsafe DNS',async()=>{
 for(const address of ['127.0.0.1','10.0.0.4','192.168.1.1','172.16.0.2','169.254.169.254','::1','fc00::1','2001:db8::1'])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress('1.1.1.1'),true);
 assert.equal(publicAddress('2606:4700:4700::1111'),true);
 for(const url of ['http://media.example/movie','https://127.0.0.1/','https://localhost/','https://someone:pass@example.com/',
   'file:///etc/passwd','https://192.168.0.3/','https://media.example:8787/']){
  await assert.rejects(validatePublicUrl(url,{resolver}));
 }
 await assert.rejects(validatePublicUrl('https://allowed.example/',{resolver:async()=>[{address:'169.254.169.254',family:4}]}));
 assert.match(await validatePublicUrl('https://licensed.example/episode',{resolver}),/^https:/);
});
test('browser media candidate is restricted to direct 2xx HTTPS playback file URLs',()=>{
 assert.equal(mediaCandidate({url:'https://media.example/ep.m3u8',status:200,contentType:'application/vnd.apple.mpegurl'}).format,'m3u8');
 assert.equal(mediaCandidate({url:'https://media.example/ep.mp4',status:206}).format,'mp4');
 assert.equal(mediaCandidate({url:'https://media.example/embed/ep',status:200,contentType:'text/html'}),null);
 assert.equal(mediaCandidate({url:'https://media.example/video.m3u8',status:403}),null);
 assert.equal(mediaCandidate({url:'http://media.example/video.m3u8',status:200}),null);
});
test('isolated chromium agent captures runtime video network responses without clicking popups',async()=>{
 const listeners={};let times=0;const frame={evaluate:async()=>++times===1?1:0};
 let closed=false,continued=0;
 const page={
  on:(event,cb)=>{listeners[event]=cb;},
  goto:async()=>{},
  frames:()=>[frame]
 };
 const ctx={newPage:async()=>page,route:async(pattern,cb)=>{
  await cb({request:()=>({url:()=> 'https://licensed.example/media.m3u8'}),continue:async()=>{continued++},abort:async()=>{throw Error('route unexpectedly aborted')}});
 },close:async()=>{closed=true}};
 const browser={newContext:async()=>ctx,close:async()=>{}};
 const data=await inspectPage({url:'https://licensed.example/one-piece/staffel-1/episode-49',waitMs:2000},{
  resolver,browserFactory:async()=>browser,sleep:async()=>{
   listeners.response({url:()=> 'https://cdn.example/episode-49.m3u8',
    status:()=>200,headers:()=>({'content-type':'application/vnd.apple.mpegurl'})});
   listeners.response({url:()=> 'https://cdn.example/episode-49.m3u8',
    status:()=>200,headers:()=>({'content-type':'application/vnd.apple.mpegurl'})});
  }});
 assert.equal(data.state,'media-observed');
 assert.equal(data.sources.length,1);
 assert.equal(data.playAttempts,1);
 assert.equal(continued,1);
 assert.equal(closed,true);
});
