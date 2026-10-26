// Constrained playback-tab policy. A popup is NOT automatically an advertisement:
// hosters sometimes launch a real player in a new tab. Only known HTTPS player
// origins are eligible and must pass the same DNS/SSRF checks as main navigation.
const PLAYER_HOSTS=Object.freeze(['voe.sx','filemoon.sx','filemoon.to']);
export const MAX_PLAYER_TABS=2;
const NAV_TIMEOUT=4500;
export function isPlayerHostname(host,hosts=PLAYER_HOSTS){
 const normalized=String(host||'').toLowerCase().replace(/\.$/,'');
 return hosts.some(base=>normalized===base||normalized.endsWith('.'+base));
}
export function classifyPlaybackTab(raw,{hosts=PLAYER_HOSTS}={}){
 let url;try{url=new URL(raw)}catch{return 'unsupported'}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')return 'unsupported';
 return isPlayerHostname(url.hostname,hosts)?'known-player':'unrelated';
}
export async function reviewPopupTab(popup,{
 validatePublicUrl,
 remaining=MAX_PLAYER_TABS,
 hosts=PLAYER_HOSTS
}={}){
 if(!popup)return {keep:false,reason:'missing'};
 if(remaining<=0)return {keep:false,reason:'tab-limit'};
 try{
  // The new page may still be about:blank when Playwright announces a popup.
  if(/^about:blank$/.test(popup.url?.()||'')){
   await popup.waitForURL(url=>url.protocol==='https:'||url.protocol==='http:',{timeout:NAV_TIMEOUT});
  }
  const current=popup.url?.()||'';
  if(classifyPlaybackTab(current,{hosts})!=='known-player')
   return {keep:false,reason:'unrelated'};
  if(typeof validatePublicUrl!=='function')return {keep:false,reason:'no-validator'};
  await validatePublicUrl(current);
  return {keep:true,reason:'known-player'};
 }catch{return {keep:false,reason:'unsafe-or-unavailable'}}
}
