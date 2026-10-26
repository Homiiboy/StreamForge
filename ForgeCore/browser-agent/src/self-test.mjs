// Docker integration test: real Playwright/Chromium click inside a nested player frame,
// with Chromium's OS sandbox enabled. No third-party host/network required.
import {chromium} from 'playwright';
import {clickSafePlayerControl,sanitizePlayerMetrics} from './player-interaction.mjs';
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const browser=await chromium.launch({headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 await page.setContent('<!doctype html><title>ForgeCore Chromium OK</title>');
 assert(await page.title()==='ForgeCore Chromium OK','Chromium failed to render document');
 const fixture=String.raw`<!doctype html>
 <div class="video-js"><video muted></video>
 <button type="button" aria-label="Play" class="vjs-big-play-button"
 onclick="document.querySelector('#clicks').textContent=String(Number(document.querySelector('#clicks').textContent)+1)">Play</button></div>
 <output id="clicks">0</output>`;
 // srcdoc is intentionally used: nested player frame and no external connectivity.
 const encoded=fixture.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
 await page.setContent('<button id="ad" onclick="window.adClicked=true">Fake Play</button>'+
  '<iframe id="player" srcdoc="'+encoded+'"></iframe>');
 await page.frameLocator('#player').locator('.video-js .vjs-big-play-button').waitFor();
 const state=await clickSafePlayerControl(page);
 assert(state.clicks===1,'Safe player click was not invoked');
 assert((await page.frameLocator('#player').locator('#clicks').textContent())==='1','Nested frame did not receive actual click');
 assert((await page.evaluate(()=>!!window.adClicked))===false,'Unrelated page button clicked');
 await clickSafePlayerControl(page,{state,maxClicks:2});
 assert((await page.frameLocator('#player').locator('#clicks').textContent())==='1','Repeated the same player control');
 const metrics=sanitizePlayerMetrics(state);
 assert(!JSON.stringify(metrics).includes('http'),'Leaked embedded URLs in diagnostics');
 process.stdout.write('Sandboxed Chromium frame playback-button click, popup-safe interaction and no-repeat checks OK\\n');
}finally{await browser.close()}
