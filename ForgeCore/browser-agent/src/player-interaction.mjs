// Narrow, audited playback interactions for embedded, unprotected HTML5 players.
// No arbitrary clicking: every control must be inside a recognised player
// container; links, adverts, login overlays and CAPTCHA prompts are excluded.
// This helper neither discovers download URLs nor bypasses access restrictions.
export const PLAY_CONTROL_SELECTORS=Object.freeze([
 {type:'videojs',selector:'.video-js .vjs-big-play-button'},
 {type:'plyr',selector:'.plyr .plyr__control--overlaid'},
 {type:'jwplayer',selector:'.jwplayer .jw-display-icon-container'},
 {type:'clappr',selector:'.clappr-player .play-pause-button, .clappr-player .play-button'},
 {type:'artplayer',selector:'.art-video-player .art-state'},
 {type:'fluid',selector:'.fluid_video_wrapper .fluid_initial_play'},
 {type:'mediaelement',selector:'.mejs__container .mejs__overlay-button'},
 {type:'generic',selector:'.player button[aria-label="Play"], .player button[title="Play"], .player [data-action="play"], .player-container button[aria-label="Play"], [data-player] button[aria-label="Play"], [data-player] [data-action="play"]'}
]);
const ROOT_SELECTOR='.video-js,.plyr,.jwplayer,.clappr-player,.art-video-player,.fluid_video_wrapper,.mejs__container,.player,.player-container,[data-player]';
const FRAME_LIMIT=12;
const CONTROL_LIMIT=2;
const RESULT=()=>({framesScanned:0,controlsFound:0,clicks:0,clickFailures:0,skippedUnsafe:0,types:[],lastError:null});
const redactError=()=> 'Player-Steuerung war nicht anklickbar';

/** Evaluated *inside* the frame: fixed DOM predicates and no downloaded scripts. */
export function safeControlPredicate(el){
 if(!el||typeof el.closest!=='function'||el.closest('a,form,[role="link"],[aria-disabled="true"],[disabled]'))return false;
 const parent=el.closest('.video-js,.plyr,.jwplayer,.clappr-player,.art-video-player,.fluid_video_wrapper,.mejs__container,.player,.player-container,[data-player]');
 if(!parent)return false;
 // Avoid ad/login overlays and consent screens, even when nested in a player.
 if(el.closest('[class*="advert"],[class*="advertisement"],[class*="sponsor"],[class*="cookie"],[class*="captcha"],[class*="login"],[class*="popup"],[class*="modal"],[class*="interstitial"]'))return false;
 // Real media node, or a recognised and already mounted player framework.
 // An unrelated generic ".player" container alone is insufficient.
 return !!parent.querySelector('video')||
  parent.matches('.jwplayer,.video-js,.plyr,.clappr-player,.art-video-player,.fluid_video_wrapper,.mejs__container');
}
async function containsPlayingVideo(frame){
 if(typeof frame.evaluate!=='function')return false;
 try{return !!(await frame.evaluate(()=>[...document.querySelectorAll('video')].some(
  v=>!v.paused&&v.readyState>=2&&v.currentTime>0.05)))}
 catch{return false}
}
export async function clickSafePlayerControl(page,{state=RESULT(),maxClicks=CONTROL_LIMIT}={}){
 if(!page||typeof page.frames!=='function')return state;
 if(!state.usedControls)state.usedControls=new Set();
 const remaining=Math.max(0,Math.min(CONTROL_LIMIT,maxClicks)-state.clicks);
 if(!remaining)return state;
 // Collect each frame afresh: late-loaded cross-origin embed frames are included.
 const frames=page.frames().slice(0,FRAME_LIMIT);
 state.framesScanned=Math.max(state.framesScanned,frames.length);
 for(const frame of frames){
  if(typeof frame.locator!=='function')continue;
  if(await containsPlayingVideo(frame))continue;
  // Each selector identifies playback controls of a known player library,
  // not generic "Play" text or click-anywhere page overlays.
  for(const {type,selector} of PLAY_CONTROL_SELECTORS){
   const key=String(typeof frame.url==='function'?frame.url():'unknown')+'|'+type;
   if(state.usedControls.has(key))continue;
   try{
    const locator=frame.locator(selector).first();
    if(!await locator.isVisible())continue;
    state.controlsFound++;
    if(!await locator.evaluate(safeControlPredicate)){
     state.skippedUnsafe++;state.usedControls.add(key);continue;
    }
    state.usedControls.add(key);
    state.clicks++;
    try{
     await locator.click({timeout:1800});
     state.types.push(type);
    }catch{
     state.clickFailures++;
     state.lastError=redactError();
    }
    // One interaction per pass lets network events and video state settle.
    return state;
   }catch{
    // Detached frames and absent locators are routine for dynamic sites.
    continue;
   }
  }
 }
 return state;
}
export function sanitizePlayerMetrics(state){
 return {framesScanned:state.framesScanned||0,controlsFound:state.controlsFound||0,
  clicks:state.clicks||0,clickFailures:state.clickFailures||0,skippedUnsafe:state.skippedUnsafe||0,
  types:Array.isArray(state.types)?state.types.slice(0,CONTROL_LIMIT):[],
  ...(state.lastError?{note:state.lastError}:{})};
}
