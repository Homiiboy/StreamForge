import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeAdDismissPredicate,detectHumanChallenge,dismissAdOverlays,makeOverlayState,publicOverlayMetrics} from '../src/overlay-guard.mjs';

test('popup-close filter accepts only ad overlays, never arbitrary buttons or captcha/login forms',()=>{
 const root={querySelector:()=>null};
 const valid={closest:selector=>selector.startsWith('a,form')?null:selector.includes('[class*="captcha"]')?null:root};
 assert.equal(safeAdDismissPredicate(valid),true);
 const link={closest:selector=>selector.startsWith('a,form')?{}:root};
 assert.equal(safeAdDismissPredicate(link),false);
 const challenge={closest:selector=>selector.includes('[class*="captcha"]')?{}:selector.startsWith('a,form')?null:root};
 assert.equal(safeAdDismissPredicate(challenge),false);
 const nestedCaptcha={querySelector:selector=>selector.includes('sitekey')?{}:null};
 const unsafe={closest:selector=>selector.startsWith('a,form')||selector.includes('[class*="captcha"]')?null:nestedCaptcha};
 assert.equal(safeAdDismissPredicate(unsafe),false);
 const outside={closest:selector=>selector.startsWith('a,form')||selector.includes('[class*="captcha"]')?null:null};
 assert.equal(safeAdDismissPredicate(outside),false);
});
test('only visible recognized ad close buttons may be clicked, max three per scan',async()=>{
 let clicks=0;
 const closer={isVisible:async()=>true,evaluate:async fn=>{
  if(fn===safeAdDismissPredicate)return true;
  clicks++;return true;
 }};
 const overlay={isVisible:async()=>true,locator:()=>({first:()=>closer})};
 const frame={url:()=> 'https://licensed.example/episode',locator:s=>({first:()=>s==='.ad-overlay'?overlay:{isVisible:async()=>false}})};
 const state=makeOverlayState(),page={frames:()=>[frame]};
 await dismissAdOverlays(page,{state});
 assert.equal(clicks,1);
 await dismissAdOverlays(page,{state});
 assert.equal(clicks,1,'must not reclick same ad overlay');
 const report=publicOverlayMetrics(state);
 assert.equal(report.dismissalClicks,1);
 assert.equal(JSON.stringify(report).includes('https:'),false,'no URLs or tokens in report');
});
test('CAPTCHA detector flags only visible challenges and ignores hidden widgets',async()=>{
 const frame={url:()=> 'https://licensed.example/video',
  locator:selector=>({first:()=>({isVisible:async()=>selector.startsWith('.h-captcha')})})};
 assert.deepEqual(await detectHumanChallenge({frames:()=>[frame]}),{detected:true,type:'hCaptcha'});
 const hidden={url:()=> 'https://licensed.example/video',
  locator:()=>({first:()=>({isVisible:async()=>false})})};
 assert.equal((await detectHumanChallenge({frames:()=>[hidden]})).detected,false);
 const visibleCaptchaFrame={url:()=> 'https://www.google.com/recaptcha/api2/bframe',
  frameElement:async()=>({isVisible:async()=>true})};
 assert.equal((await detectHumanChallenge({frames:()=>[visibleCaptchaFrame]})).detected,true);
});
