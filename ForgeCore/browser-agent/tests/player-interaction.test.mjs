import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PLAY_CONTROL_SELECTORS,clickSafePlayerControl,safeControlPredicate,sanitizePlayerMetrics} from '../src/player-interaction.mjs';

test('v1.8.0 only audits playback selectors, never generic page links/buttons',()=>{
 assert.ok(PLAY_CONTROL_SELECTORS.some(x=>x.type==='videojs'));
 assert.ok(PLAY_CONTROL_SELECTORS.some(x=>x.type==='jwplayer'));
 assert.ok(PLAY_CONTROL_SELECTORS.some(x=>x.type==='plyr'));
 assert.equal(PLAY_CONTROL_SELECTORS.some(x=>/button:has-text|a\[|iframe\[|body|captcha|pop-up/.test(x.selector)),false);
});
test('v1.8.0 rejects links, ads and login prompts even inside player containers',()=>{
 const root={querySelector:()=>({}),matches:()=>false};
 const el={closest:selector=>selector.startsWith('a,form')?null:
  selector.includes('advert')?null:root};
 assert.equal(safeControlPredicate(el),true);
 const link={closest:selector=>selector.startsWith('a,form')?{}:root};
 assert.equal(safeControlPredicate(link),false);
 const overlay={closest:selector=>selector.includes('advert')?{}:selector.startsWith('a,form')?null:root};
 assert.equal(safeControlPredicate(overlay),false);
 const noVideo={closest:selector=>selector.startsWith('a,form')||selector.includes('advert')?null:
  {querySelector:()=>null,matches:()=>false}};
 assert.equal(safeControlPredicate(noVideo),false);
});
function frameWithControls({targetSelector='.video-js .vjs-big-play-button',valid=true,visible=true,playing=false}={}){
 const counts={click:0,lookup:[],evaluate:0};
 const locator={isVisible:async()=>visible,evaluate:async fn=>{counts.evaluate++;return valid;},
  click:async()=>{counts.click++}};
 const frame={url:()=>'https://licensed.example/embed/player',evaluate:async()=>playing,
  locator:selector=>{counts.lookup.push(selector);return{first:()=>selector===targetSelector?locator:{isVisible:async()=>false}}}};
 return {frame,counts};
}
test('v1.8.0 clicks safe control inside child iframe and never repeats same control',async()=>{
 const nested=frameWithControls();
 const page={frames:()=>[{locator:()=>({first:()=>({isVisible:async()=>false})}),evaluate:async()=>false,url:()=> 'https://licensed.example/title'},nested.frame]};
 const state=await clickSafePlayerControl(page);
 assert.equal(state.clicks,1);
 assert.equal(state.framesScanned,2);
 assert.equal(state.types[0],'videojs');
 await clickSafePlayerControl(page,{state,maxClicks:2});
 assert.equal(nested.counts.click,1);
 assert.equal(state.clicks,1);
 const output=sanitizePlayerMetrics(state);
 assert.equal(JSON.stringify(output).includes('https://'),false,'no signed URLs leak through metrics');
});
test('v1.8.0 never clicks running players or unsafe buttons; safe click failures are counted',async()=>{
 const already=frameWithControls({playing:true});
 await clickSafePlayerControl({frames:()=>[already.frame]});
 assert.equal(already.counts.click,0);
 const invalid=frameWithControls({valid:false});
 const st=await clickSafePlayerControl({frames:()=>[invalid.frame]});
 assert.equal(invalid.counts.click,0);
 assert.equal(st.skippedUnsafe,1);
 const failing=frameWithControls();
 const original=failing.frame.locator;
 failing.frame.locator=selector=>{
  const r=original(selector),a=r.first();
  if(selector==='.video-js .vjs-big-play-button')a.click=async()=>{throw Error('secret token value')};
  return{first:()=>a};
 };
 const failed=await clickSafePlayerControl({frames:()=>[failing.frame]});
 assert.equal(failed.clickFailures,1);
 assert.equal(sanitizePlayerMetrics(failed).note,'Player-Steuerung war nicht anklickbar');
});
test('v1.8.0 bounded to two safe player interactions at most',async()=>{
 const frame=frameWithControls(),page={frames:()=>[frame.frame]};
 const state=await clickSafePlayerControl(page,{maxClicks:100});
 state.usedControls.clear(); // simulate another control replacing the earlier one
 await clickSafePlayerControl(page,{state,maxClicks:100});
 state.usedControls.clear();
 await clickSafePlayerControl(page,{state,maxClicks:100});
 assert.equal(state.clicks,2);
 assert.equal(frame.counts.click,2);
});
