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
 const listeners={};let times=0;const frame={evaluate:async()=>++times===1?1:times<=3?0:[{paused:true,currentTime:0,readyState:0,error:false}]};
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
 assert.equal(data.diagnostics.videoElements,1);
 assert.equal(data.diagnostics.playingVideos,0,'play() attempts must never count as confirmed playback');
 assert.equal(data.diagnostics.mediaResponses,6);
 assert.equal(data.diagnostics.mediaWithoutExtension,0);
 assert.equal(continued,1);
 assert.equal(closed,true);
});


test('browser agent shows MIME-typed media without file extension as diagnostic, never as download source',async()=>{
 const listeners={},frame={evaluate:async()=>{
  if(!frame.calls++)return 1;
  if(frame.calls<=3)return 0;
  return [{paused:false,currentTime:2.3,readyState:3,error:false}];
 },calls:0};
 const page={on:(event,fn)=>{listeners[event]=fn},goto:async()=>{},frames:()=>[frame]};
 const ctx={route:async()=>{},newPage:async()=>page,close:async()=>{}};
 const browser={newContext:async()=>ctx,close:async()=>{}};
 const r=await inspectPage({url:'https://licensed.example/play',waitMs:2000},
  {resolver,browserFactory:async()=>browser,sleep:async()=>{
   listeners.response({url:()=> 'https://cdn.example/api/media?ref=opaque',
    status:()=>200,headers:()=>({'content-type':'video/mp4'})});
  }});
 assert.equal(r.state,'no-media');
 assert.equal(r.sources.length,0,'unverified extensionless media cannot enter existing downloader');
 assert.equal(r.diagnostics.mediaWithoutExtension,3);
 assert.equal(r.diagnostics.playingVideos,1);
 assert.match(r.note,/ohne unterstützte Dateiendung/);
});


test('v1.7.3 sends at most one actual video click and distinguishes it from a play() attempt',async()=>{
 let gestureClicks=0,evaluations=0;
 const video={isVisible:async()=>true,evaluate:async()=>({paused:true,currentTime:0,readyState:0,hasSource:true}),click:async()=>{gestureClicks++}};
 const frame={locator:selector=>{assert.equal(selector,'video:visible');return{first:()=>video}},
  evaluate:async fn=>{
   // The player-control scan now uses a separate "any playing" frame predicate.
   if(String(fn).includes('.some('))return false;
   evaluations++;return evaluations<=3?0:[{paused:false,currentTime:1.2,readyState:3,error:false}];
  }};
 const page={on:()=>{},goto:async()=>{},frames:()=>[frame]};
 const ctx={route:async()=>{},newPage:async()=>page,close:async()=>{}};
 const factory=async()=>({newContext:async()=>ctx,close:async()=>{}});
 const result=await inspectPage({url:'https://licensed.example/show',waitMs:2000},
  {resolver,browserFactory:factory,sleep:async()=>{}});
 assert.equal(gestureClicks,1);
 assert.equal(result.playAttempts,0);
 assert.equal(result.diagnostics.videoGestureClicks,1);
 assert.equal(result.diagnostics.videoGestureClickFailures,0);
 assert.equal(result.diagnostics.playingVideos,1);
});
test('v1.7.3 does not click hidden videos or any buttons on external players',async()=>{
 let clicked=0;
 const frame={
  locator:selector=>{assert.equal(selector,'video:visible');return{first:()=>({
   isVisible:async()=>false,click:async()=>{clicked++}
  })}},
  evaluate:async function(){this.calls=(this.calls||0)+1;return this.calls<=3?0:[]}
 };
 const page={on:()=>{},goto:async()=>{},frames:()=>[frame]};
 const ctx={route:async()=>{},newPage:async()=>page,close:async()=>{}};
 const data=await inspectPage({url:'https://licensed.example/show',waitMs:2000},
  {resolver,browserFactory:async()=>({newContext:async()=>ctx,close:async()=>{}}),sleep:async()=>{}});
 assert.equal(clicked,0);
 assert.equal(data.diagnostics.videoGestureClicks,0);
});


test('v1.7.4 stalled video with paused=false and HAVE_NOTHING receives one real click',async()=>{
 let clicks=0,attempts=0;
 const video={isVisible:async()=>true,evaluate:async()=>({paused:false,currentTime:0,readyState:0,hasSource:true}),
  click:async()=>{clicks++}};
 const frame={locator:selector=>{assert.equal(selector,'video:visible');return{first:()=>video}},
  evaluate:async()=>{attempts++;return attempts<4?0:[{paused:false,currentTime:0,readyState:0,error:false}]}};
 const page={on:()=>{},goto:async()=>{},frames:()=>[frame]};
 const ctx={route:async()=>{},newPage:async()=>page,close:async()=>{}};
 const result=await inspectPage({url:'https://licensed.example/demo',waitMs:2000},{
  resolver,browserFactory:async()=>({newContext:async()=>ctx,close:async()=>{}}),sleep:async()=>{}});
 assert.equal(clicks,1);
 assert.equal(result.diagnostics.videoGestureStalled,1);
 assert.equal(result.diagnostics.videoGestureClicks,1);
 assert.equal(result.diagnostics.playingVideos,0);
});
test('v1.7.4 does not click a video that has truly begun playing',async()=>{
 let clicks=0;
 const video={isVisible:async()=>true,evaluate:async()=>({paused:false,currentTime:5,readyState:3,hasSource:true}),
  click:async()=>{clicks++}};
 const frame={locator:selector=>({first:()=>selector==='video:visible'?video:{isVisible:async()=>false}}),evaluate:async()=>[]};
 const page={on:()=>{},goto:async()=>{},frames:()=>[frame]};
 const ctx={route:async()=>{},newPage:async()=>page,close:async()=>{}};
 const result=await inspectPage({url:'https://licensed.example/demo',waitMs:2000},{
  resolver,browserFactory:async()=>({newContext:async()=>ctx,close:async()=>{}}),sleep:async()=>{}});
 assert.equal(clicks,0);
 assert.equal(result.diagnostics.videoGestureAlreadyPlaying,1);
 assert.equal(result.diagnostics.videoGestureClicks,0);
});


test('v1.8.1 visible human challenge immediately stops player interaction and media handoff',async()=>{
 let playerCalls=0,autoplayCalls=0;
 const frame={
  url:()=> 'https://licensed.example/video',
  locator:selector=>({first:()=>({isVisible:async()=>selector.startsWith('.cf-turnstile')})}),
  evaluate:async()=>{autoplayCalls++;return 1}
 };
 const page={on:()=>{},goto:async()=>{},frames:()=>[frame]};
 const ctx={route:async()=>{},newPage:async()=>page,close:async()=>{}};
 const browser={newContext:async()=>ctx,close:async()=>{}};
 const result=await inspectPage({url:'https://licensed.example/episode',waitMs:2000},
  {resolver,browserFactory:async()=>browser,sleep:async()=>{playerCalls++}});
 assert.equal(result.state,'human-verification-required');
 assert.equal(result.playAttempts,0);
 assert.equal(autoplayCalls,0,'CAPTCHA must stop automated clicks/JS playback');
 assert.equal(playerCalls,0,'scan must not wait/retry through a challenge');
 assert.equal(result.sources.length,0);
 assert.equal(result.diagnostics.overlayGuard.captchaDetected,true);
 assert.equal(result.diagnostics.overlayGuard.captchaType,'Turnstile');
 assert.match(result.note,/Manuelle Sicherheitsprüfung/);
});


test('v1.8.2 media from an ad popup is rejected, while a verified playback tab is scanned',async()=>{
 const pageHandlers={},contextHandlers={};let sleeps=0,adClosed=0;
 const playerTab={url:()=> 'https://filemoon.sx/e/play',on:()=>{},frames:()=>[],close:async()=>{}};
 const adTab={url:()=> 'https://advertisements.example/ad',on:()=>{},frames:()=>[],close:async()=>{adClosed++}};
 const parent={on:(e,fn)=>{pageHandlers[e]=fn},goto:async()=>{},frames:()=>[],url:()=> 'https://licensed.example/episode'};
 const context={on:(e,fn)=>{contextHandlers[e]=fn},route:async()=>{},newPage:async()=>parent,close:async()=>{}};
 const makeResponse=(url,owner)=>({
  url:()=>url,status:()=>200,
  headers:()=>({'content-type':'application/vnd.apple.mpegurl'}),
  request:()=>({resourceType:()=> 'media'}),
  frame:()=>({page:()=>owner})
 });
 const r=await inspectPage({url:'https://licensed.example/episode',waitMs:2000},{
  resolver,
  browserFactory:async()=>({newContext:async()=>context,close:async()=>{}}),
  sleep:async()=>{
   if(++sleeps!==1)return;
   pageHandlers.popup(adTab);
   pageHandlers.popup(playerTab);
   contextHandlers.response(makeResponse('https://advertisements.example/ad.m3u8',adTab));
   contextHandlers.response(makeResponse('https://cdn.licensed.example/good.m3u8',playerTab));
   await new Promise(resolve=>setImmediate(resolve));
  }
 });
 assert.equal(r.sources.length,1,JSON.stringify(r));
 assert.equal(r.sources[0].url,'https://cdn.licensed.example/good.m3u8');
 assert.equal(r.diagnostics.playerTabsKept,1);
 assert.equal(r.diagnostics.playerTabsRejected,1);
 assert.equal(r.diagnostics.popupsClosed,1);
 assert.equal(adClosed,1);
 assert.equal(r.diagnostics.responses,2);
});
