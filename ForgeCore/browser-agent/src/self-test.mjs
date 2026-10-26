// Docker integration test: real Playwright/Chromium click inside a nested player frame,
// with Chromium's OS sandbox enabled. No third-party host/network required.
import {chromium} from 'playwright';
import {clickSafePlayerControl,sanitizePlayerMetrics} from './player-interaction.mjs';
import {detectHumanChallenge,dismissAdOverlays,makeOverlayState} from './overlay-guard.mjs';
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
 // Real Chromium ad dismissal: only the close button inside a tagged ad overlay.
 await page.setContent('<button id="unrelated" onclick="window.unrelatedClicked=true">Close</button>'+
  '<div class="ad-overlay" style="position:absolute;inset:10px;width:200px;height:120px;background:white">'+
  '<button class="close" onclick="this.closest(\'.ad-overlay\').remove();window.adDismissed=true">Schließen</button></div>');
 const overlays=makeOverlayState();
 await dismissAdOverlays(page,{state:overlays});
 assert(overlays.dismissalClicks===1,'Ad close was not invoked');
 assert((await page.evaluate(()=>!!window.adDismissed))===true,'Ad overlay not dismissed');
 assert((await page.evaluate(()=>!!window.unrelatedClicked))===false,'Unrelated control clicked');
 // Visibility-based challenge detection, no solving/clicking/third-party tokens.
 await page.setContent('<div class="cf-turnstile" style="height:55px;width:220px">Mensch bestätigen</div>');
 const captcha=await detectHumanChallenge(page);
 assert(captcha.detected&&captcha.type==='Turnstile','Visible CAPTCHA challenge not detected');
 const metrics=sanitizePlayerMetrics(state);
 assert(!JSON.stringify(metrics).includes('http'),'Leaked embedded URLs in diagnostics');
 process.stdout.write('Sandboxed Chromium frame playback-button click, popup-safe interaction and no-repeat checks OK\\n');
}finally{await browser.close()}
