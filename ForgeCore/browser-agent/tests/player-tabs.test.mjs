import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyPlaybackTab,isPlayerHostname,reviewPopupTab,MAX_PLAYER_TABS} from '../src/player-tabs.mjs';

test('v1.8.2 known playback tabs are retained but ad domains and private addresses are rejected',()=>{
 assert.equal(classifyPlaybackTab('https://voe.sx/e/video'),'known-player');
 assert.equal(classifyPlaybackTab('https://play.filemoon.sx/e/video'),'known-player');
 assert.equal(classifyPlaybackTab('https://filemoon.to/e/video'),'known-player');
 for(const url of ['https://ads.example/watch','https://fakevoe.sx/watch','https://voe.sx.evil.example/',
  'https://filemoon.sx.bad.invalid','http://voe.sx/e/video','https://192.168.0.2/player',
  'javascript:alert(1)','about:blank']){
  assert.notEqual(classifyPlaybackTab(url),'known-player',url);
 }
 assert.equal(isPlayerHostname('VOE.SX'),true);
 assert.equal(MAX_PLAYER_TABS,2);
});
test('v1.8.2 reviews final popup destination with public DNS validator, including pending about:blank',async()=>{
 const calls=[];
 const popup={url:()=>calls.length?'https://filemoon.sx/e/item':'about:blank',
  waitForURL:async()=>{calls.push('navigation')}};
 const data=await reviewPopupTab(popup,{validatePublicUrl:async url=>{calls.push(url);return url}});
 assert.equal(data.keep,true);
 assert.equal(data.reason,'known-player');
 assert.deepEqual(calls,['navigation','https://filemoon.sx/e/item']);
 assert.equal((await reviewPopupTab(popup,{remaining:0,validatePublicUrl:async()=>{}})).keep,false);
 const unsafe={url:()=> 'https://voe.sx/e/item'};
 const fail=await reviewPopupTab(unsafe,{validatePublicUrl:async()=>{throw Error('private DNS')}});
 assert.equal(fail.keep,false);
 assert.equal(fail.reason,'unsafe-or-unavailable');
});
test('v1.8.2 refuses unrelated hosters even if their webpage looks like a video',async()=>{
 let checked=false;
 const popup={url:()=> 'https://advertisement.example/watch'};
 const data=await reviewPopupTab(popup,{validatePublicUrl:async()=>{checked=true}});
 assert.equal(data.keep,false);
 assert.equal(data.reason,'unrelated');
 assert.equal(checked,false);
});
