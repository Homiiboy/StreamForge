// Isolated ForgeCore Chromium agent. No persistent cookies, extensions or shared browser profiles.
import http from 'node:http';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {chromium} from 'playwright';

const PORT=Number(process.env.FORGECORE_BROWSER_PORT||8790);
const DEFAULT_WAIT=9000;
const MAX_WAIT=18000;
const MAX_ITEMS=24;
const JSON_LIMIT=8*1024;
let running=false;
const write=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
const error=(message,status=400)=>Object.assign(Error(message),{status});
export function publicAddress(address){
 if(!address||typeof address!=='string')return false;
 const ip=address.toLowerCase();
 if(ip.includes('%'))return false;
 if(isIP(ip)===6){
  if(ip==='::1'||ip==='::'||/^f[cd]/.test(ip)||/^fe[89ab]/.test(ip)||/^2001:db8:/i.test(ip))return false;
  if(ip.startsWith('::ffff:'))return publicAddress(ip.slice(7));
  return true;
 }
 if(isIP(ip)!==4)return false;
 const p=ip.split('.').map(Number);
 if(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||
  p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||
  p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===192&&p[1]===0||
  p[0]===198&&p[1]>=18&&p[1]<=19||p[0]===198&&p[1]===51&&p[2]===100||
  p[0]===203&&p[1]===0&&p[2]===113||p[0]===192&&p[1]===0&&p[2]===2)return false;
 return true;
}
export async function validatePublicUrl(raw,{resolver=lookup}={}){
 if(typeof raw!=='string'||raw.length>2048)throw error('Ungültige öffentliche HTTPS-Adresse');
 let url;try{url=new URL(raw)}catch{throw error('Ungültige URL')}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||url.hash)throw error('Nur öffentliche HTTPS-Seiten unterstützt');
 if(/(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid)$/i.test(url.hostname))throw error('Lokale Browser-Ziele gesperrt');
 if(isIP(url.hostname)){if(!publicAddress(url.hostname))throw error('Private IP-Adresse gesperrt');}
 else{
  let records;try{records=await resolver(url.hostname,{all:true,verbatim:true})}catch{throw error('DNS für Browser-Ziel fehlgeschlagen')}
  if(!Array.isArray(records)||!records.length||records.some(x=>!publicAddress(x.address)))throw error('Unsichere DNS-Adresse gesperrt');
 }
 return url.href;
}
export function mediaCandidate({url,contentType,status}={}){
 if(!Number.isInteger(status)||status<200||status>299)return null;
 let parsed;try{parsed=new URL(url)}catch{return null}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password)return null;
 const ext=/\.(?:mp4|m4v|m3u8|mpd)$/i.test(parsed.pathname);
 const typed=/^(?:application\/(?:vnd\.apple\.mpegurl|x-mpegurl|dash\+xml)|video\/(?:mp4|x-m4v))(?:\s*;|$)/i.test(contentType||'');
 if(!ext)return null; // ForgeCore TransferQueue explicitly requires a direct-media file extension.
 if(!typed&&!ext)return null;
 return {url:parsed.href,format:parsed.pathname.split('.').at(-1).toLowerCase(),host:parsed.hostname,
  contentType:String(contentType||'').split(';')[0].slice(0,80)};
}
export async function inspectPage({url,waitMs=DEFAULT_WAIT,autoPlay=true}={},{
 resolver=lookup,browserFactory=()=>chromium.launch({headless:true,chromiumSandbox:true,
  args:['--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']}),
 sleep=ms=>new Promise(ok=>setTimeout(ok,ms))
}={}){
 const target=await validatePublicUrl(url,{resolver});
 if(typeof autoPlay!=='boolean')throw error('Ungültige Wiedergabeoption');
 if(!Number.isInteger(waitMs)||waitMs<2000||waitMs>MAX_WAIT)throw error('Unzulässige Browser-Wartezeit');
 const browser=await browserFactory();
 const sources=new Map(),warnings=[];let page,context,blocked=0,playAttempts=0;
 const diagnostics={requests:0,responses:0,requestFailures:0,mediaResponses:0,
  mediaWithoutExtension:0,videoElements:0,playingVideos:0,videoErrors:0,frames:0,webSocketsBlocked:0};
 try{
  context=await browser.newContext({acceptDownloads:false,ignoreHTTPSErrors:false,serviceWorkers:'block',javaScriptEnabled:true,
   permissions:[],viewport:{width:1280,height:720},locale:'de-DE'});
  // Network interception must cover WebSockets too; they do not pass through HTTP routing.
  if(typeof context.routeWebSocket==='function')await context.routeWebSocket('**/*',socket=>{
   diagnostics.webSocketsBlocked++;return socket.close();
  });
  await context.route('**/*',async route=>{
   const u=route.request().url();
   if(!/^https:\/\//i.test(u)){blocked++;return route.abort().catch(()=>{})}
   try{await validatePublicUrl(u,{resolver});await route.continue()}catch{blocked++;await route.abort().catch(()=>{})}
  });
  page=await context.newPage();
  page.on('request',()=>{diagnostics.requests++});
  page.on('requestfailed',()=>{diagnostics.requestFailures++});
  page.on('popup',popup=>{void popup.close().catch(()=>{})});
  page.on('dialog',dialog=>{void dialog.dismiss().catch(()=>{})});
  page.on('response',response=>{
   diagnostics.responses++;
   try{
    const type=String(response.headers()['content-type']||'').toLowerCase();
    const isVideoMime=/^(?:video\/[\w.+-]+|application\/(?:vnd\.apple\.mpegurl|x-mpegurl|dash\+xml))(?:\s*;|$)/i.test(type.trim());
    const kind=typeof response.request==='function'?response.request().resourceType():'';
    if(isVideoMime||kind==='media'){
     diagnostics.mediaResponses++;
     if(!/\.(?:mp4|m4v|m3u8|mpd)$/i.test(new URL(response.url()).pathname))
      diagnostics.mediaWithoutExtension++;
    }
    const c=mediaCandidate({url:response.url(),contentType:type,status:response.status()});
    if(c&&sources.size<MAX_ITEMS)sources.set(c.url,c);
   }catch{/* untrusted resource */ }
  });
  await page.goto(target,{waitUntil:'domcontentloaded',timeout:14000}).catch(e=>warnings.push('Seite nicht vollständig geladen: '+String(e.message).slice(0,90)));
  // Some player frames are injected after DOMContentLoaded. Re-check in short,
  // bounded intervals instead of assuming the initial DOM already contains video.
  for(let pass=0;pass<3;pass++){
   if(autoPlay){
    for(const frame of page.frames().slice(0,12)){
     try{
      const attempted=await frame.evaluate(async()=>{
       const videos=[...document.querySelectorAll('video')].slice(0,6);
       let count=0;
       for(const v of videos){
        if(!v.paused)continue;
        try{v.muted=true;v.autoplay=true;v.playsInline=true;const p=v.play();if(p?.catch)p.catch(()=>{});count++}catch{}
       }
       return count;
      });
      playAttempts+=attempted;
     }catch{/* inaccessible/destroyed frame */ }
    }
   }
   await sleep(Math.ceil(waitMs/3));
  }
  // A play() call is merely an attempt. Count playback only once a video's
  // currentTime advances and enough data is buffered; do not equate it with a click.
  const frames=page.frames().slice(0,12);
  diagnostics.frames=frames.length;
  for(const frame of frames){
   try{
    const videos=await frame.evaluate(()=>[...document.querySelectorAll('video')].slice(0,6).map(v=>({
     paused:v.paused,currentTime:Number(v.currentTime)||0,readyState:v.readyState,
     error:!!v.error
    })));
    if(!Array.isArray(videos))continue;
    diagnostics.videoElements+=videos.length;
    diagnostics.playingVideos+=videos.filter(v=>!v.paused&&v.currentTime>0.05&&v.readyState>=2).length;
    diagnostics.videoErrors+=videos.filter(v=>v.error).length;
   }catch{/* removed/inaccessible frame */ }
  }
  let note;
  if(sources.size)note='Unterstützte Medienanfragen beobachtet; Deutsch und Server-Erreichbarkeit müssen separat bestätigt werden.';
  else if(diagnostics.playingVideos===0)note='Keine bestätigte Wiedergabe. Automatischer Play-Versuch allein bedeutet nicht, dass der Player gestartet ist.';
  else if(diagnostics.mediaWithoutExtension)note='Medienantworten ohne unterstützte Dateiendung beobachtet. Sie werden aus Sicherheitsgründen nicht als Downloadquelle übernommen.';
  else note='Wiedergabe erkannt, aber kein unterstützter direkter HLS-/DASH-/MP4-Link beobachtet.';
  return {state:sources.size?'media-observed':'no-media',sources:[...sources.values()],observed:sources.size,
    playAttempts,blockedRequests:blocked,diagnostics,warning:warnings.slice(0,2),note};
 }finally{await context?.close().catch(()=>{});await browser.close().catch(()=>{})}
}
const app=http.createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health')return write(res,200,{ok:true,service:'ForgeCore Browser-Agent',busy:running});
 if(req.url!=='/inspect'||req.method!=='POST')return write(res,404,{error:'Nicht gefunden'});
 if(running)return write(res,429,{error:'Browser-Agent ist bereits beschäftigt'});
 let size=0,bytes=[];
 try{
  for await(const b of req){size+=b.length;if(size>JSON_LIMIT)throw error('Anfrage zu groß',413);bytes.push(b)}
  let body;try{body=JSON.parse(Buffer.concat(bytes).toString('utf8'))}catch{throw error('Ungültige JSON-Anfrage')}
  if(!body||Array.isArray(body)||typeof body!=='object')throw error('Ungültige Browser-Anfrage');
  running=true;
  try{write(res,200,await inspectPage(body))}
  finally{running=false}
 }catch(e){running=false;write(res,e.status||502,{error:String(e.message||e).slice(0,220)})}
});
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)
 app.listen(PORT,'0.0.0.0',()=>process.stdout.write('ForgeCore Browser-Agent listening on internal '+PORT+'\n'));
export {app};
