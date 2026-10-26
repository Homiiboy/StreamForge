// Safe ad/popup cleanup and CAPTCHA *detection*, not CAPTCHA solving.
// No arbitrary clicks, external redirects, consent acceptance, or security bypass.
const FRAME_LIMIT=12;
const OVERLAY_LIMIT=3;
export const AD_OVERLAY_SELECTORS=Object.freeze([
 '.ad-overlay','.ads-overlay','.advert-overlay','.advertisement-overlay',
 '.ad-popup','.ads-popup','.advert-popup','.popup-ad','.ad-modal',
 '[data-ad-overlay]','[data-ad-popup]','[data-popup-type="advertisement"]'
]);
const CLOSE_SELECTOR=[
 'button[aria-label="Close"]','button[aria-label="Schließen"]',
 'button[title="Close"]','button[title="Schließen"]',
 'button.close','button.close-ad','button.popup-close',
 'button[data-dismiss="ad"]','button[data-action="close"]',
 '[role="button"][aria-label="Close"]','[role="button"][aria-label="Schließen"]'
].join(',');
const SECURITY_MARKERS=[
 '[data-sitekey]','.g-recaptcha','.h-captcha','.cf-turnstile',
 'iframe[src*="recaptcha"]','iframe[src*="hcaptcha"]','iframe[src*="challenges.cloudflare.com"]',
 'iframe[src*="captcha"]','[id*="captcha"]'
].join(',');
const CAPTCHA_FRAME=/^(?:[^.]+\.)*(?:recaptcha\.net|google\.com|hcaptcha\.com|challenges\.cloudflare\.com)$/i;
const EMPTY=()=>({framesScanned:0,adOverlaysFound:0,dismissalClicks:0,dismissalFailures:0,
 unsafeSkipped:0,popupsClosed:0,dialogsDismissed:0,captchaDetected:false,captchaType:null});
export function safeAdDismissPredicate(element){
 if(!element||typeof element.closest!=='function')return false;
 if(element.closest('a,form,[role="link"],[disabled],[aria-disabled="true"]'))return false;
 if(element.closest('[class*="captcha"],[id*="captcha"],[data-sitekey],[class*="challenge"],[class*="login"],[class*="paywall"],[class*="consent"],[class*="cookie"]'))return false;
 const root=element.closest(AD_OVERLAY_SELECTORS.join(','));
 if(!root||typeof root.querySelector!=='function')return false;
 if(root.querySelector(SECURITY_MARKERS))return false;
 return true;
}
export async function detectHumanChallenge(page){
 if(!page||typeof page.frames!=='function')return {detected:false,type:null};
 for(const frame of page.frames().slice(0,FRAME_LIMIT)){
  try{
   const url=typeof frame.url==='function'?new URL(frame.url()):null;
   if(url&&CAPTCHA_FRAME.test(url.hostname)&&typeof frame.frameElement==='function'){
    const element=await frame.frameElement();
    if(await element.isVisible())return {detected:true,type:'CAPTCHA'};
   }
  }catch{/* about:blank/detached frames */}
  if(typeof frame.locator!=='function')continue;
  for(const [type,selector] of [
   ['reCAPTCHA','.g-recaptcha, iframe[src*="recaptcha/api2/bframe"], iframe[src*="recaptcha/enterprise/bframe"]'],
   ['hCaptcha','.h-captcha, iframe[src*="hcaptcha.com"]'],
   ['Turnstile','.cf-turnstile, iframe[src*="challenges.cloudflare.com"]'],
   ['CAPTCHA','[data-captcha-challenge], [data-human-verification="required"]']
  ]){
   try{if(await frame.locator(selector).first().isVisible())return {detected:true,type}}catch{}
  }
 }
 return {detected:false,type:null};
}
export async function dismissAdOverlays(page,{state=EMPTY(),maxClicks=OVERLAY_LIMIT}={}){
 if(!page||typeof page.frames!=='function')return state;
 if(!state.used)state.used=new Set();
 const frames=page.frames().slice(0,FRAME_LIMIT);
 state.framesScanned=Math.max(state.framesScanned,frames.length);
 for(const frame of frames){
  if(state.dismissalClicks>=Math.min(OVERLAY_LIMIT,Math.max(0,maxClicks)))break;
  if(typeof frame.locator!=='function')continue;
  for(const root of AD_OVERLAY_SELECTORS){
   if(state.dismissalClicks>=Math.min(OVERLAY_LIMIT,Math.max(0,maxClicks)))break;
   const key=(typeof frame.url==='function'?frame.url():'unknown')+'|'+root;
   if(state.used.has(key))continue;
   try{
    const overlay=frame.locator(root).first();
    if(!await overlay.isVisible())continue;
    state.adOverlaysFound++;
    const closer=overlay.locator(CLOSE_SELECTOR).first();
    if(!await closer.isVisible())continue;
    if(!await closer.evaluate(safeAdDismissPredicate)){
     state.unsafeSkipped++;state.used.add(key);continue;
    }
    state.used.add(key);
    state.dismissalClicks++;
    try{await closer.click({timeout:1500})}
    catch{state.dismissalFailures++}
   }catch{/* detached/stale overlay; do not click random alternatives */ }
  }
 }
 return state;
}
export function publicOverlayMetrics(state){
 return {framesScanned:state.framesScanned||0,adOverlaysFound:state.adOverlaysFound||0,
  dismissalClicks:state.dismissalClicks||0,dismissalFailures:state.dismissalFailures||0,
  unsafeSkipped:state.unsafeSkipped||0,
  popupsClosed:state.popupsClosed||0,dialogsDismissed:state.dialogsDismissed||0,
  captchaDetected:!!state.captchaDetected,
  captchaType:state.captchaDetected?(state.captchaType||'CAPTCHA'):null};
}
export function makeOverlayState(){return EMPTY()}
