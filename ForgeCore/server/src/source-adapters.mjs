import {safeFetch,parseWebUrl} from './source-security.mjs';

export const SOURCE_ADAPTERS=Object.freeze([{id:'hls',label:'HLS VOD'},{id:'dash',label:'DASH SegmentList'},{id:'html-links',label:'Webseite (Links zu Medien/Playlisten)'}]);
function attr(tag,key){return (tag.match(new RegExp('\\b'+key+'\\s*=\\s*["\']([^"\']*)["\']','i'))||[])[1]||''}
export function parseHls(text,base){
 if(!text.startsWith('#EXTM3U'))throw Error('Not an HLS playlist');
 if(/#EXT-X-KEY:|#EXT-X-SESSION-KEY:/i.test(text))throw Error('Encrypted HLS unsupported');
 const lines=text.replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean);
 const master=[];const segments=[];let expected='';let init='';let ended=false;
 if(/#EXT-X-MEDIA:TYPE=AUDIO.*URI=/i.test(text))throw Error('Separate HLS audio playlists require an explicit audio adapter (not supported yet)');
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(line.startsWith('#EXT-X-STREAM-INF:')){
   const next=lines.slice(i+1).find(s=>!s.startsWith('#'));if(next)master.push({url:new URL(next,base).href,bandwidth:Number((line.match(/BANDWIDTH=(\d+)/)||[])[1]||0),resolution:(line.match(/RESOLUTION=(\d+x\d+)/)||[])[1]||''});
  }else if(line.startsWith('#EXT-X-MAP:')){const uri=(line.match(/URI="([^"]+)"/)||[])[1];if(!uri)throw Error('HLS map without URI');init=new URL(uri,base).href;}
  else if(line.startsWith('#EXTINF:'))expected='media';
  else if(line==='#EXT-X-ENDLIST')ended=true;
  else if(!line.startsWith('#')&&expected==='media'){segments.push(new URL(line,base).href);expected='';}
 }
 if(master.length)return {kind:'master',variants:master.sort((a,b)=>b.bandwidth-a.bandwidth)};
 if(!ended)throw Error('Live HLS playlist not supported');
 if(/#EXT-X-BYTERANGE|#EXT-X-PART|#EXT-X-DISCONTINUITY|#EXT-X-I-FRAMES-ONLY/.test(text))throw Error('Unsupported HLS segment feature');
 if(!segments.length||segments.length>4000)throw Error('Invalid HLS segment count');
 return {kind:'hls',segments,init,container:init?'fmp4':'ts'};
}
export function parseDash(text,base){
 if(!/<MPD\b/i.test(text))throw Error('Not a DASH manifest');
 if(/<ContentProtection\b/i.test(text))throw Error('Protected DASH unsupported');
 if(/type\s*=\s*["']dynamic["']/i.test(text))throw Error('Live DASH unsupported');
 // Deliberately narrow support: explicit SegmentList VOD representations.
 const tracks=[];
 const sets=[...text.matchAll(/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi)];
 for(const set of sets){
  const mime=attr(set[1],'mimeType');const type=attr(set[1],'contentType')||(mime.startsWith('audio/')?'audio':'video');
  for(const rep of set[2].matchAll(/<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi)){
   const list=rep[2].match(/<SegmentList\b[^>]*>([\s\S]*?)<\/SegmentList>/i)?.[1];if(!list)continue;
   const initialization=list.match(/<Initialization\b[^>]*\bsourceURL=["']([^"']+)["']/i)?.[1];
   const segs=[...list.matchAll(/<SegmentURL\b[^>]*\bmedia=["']([^"']+)["'][^>]*\/?\s*>/gi)].map(x=>new URL(x[1],base).href);
   if(!initialization||!segs.length||segs.length>4000)continue;
   tracks.push({type,url:base,bandwidth:Number(attr(rep[1],'bandwidth')||0),init:new URL(initialization,base).href,segments:segs});
  }
 }
 if(!tracks.length)throw Error('No supported SegmentList tracks in DASH manifest');
 const video=tracks.filter(x=>x.type==='video').sort((a,b)=>b.bandwidth-a.bandwidth)[0];
 const audio=tracks.filter(x=>x.type==='audio').sort((a,b)=>b.bandwidth-a.bandwidth)[0];
 if(!video)throw Error('DASH video track missing');
 return {kind:'dash',video,audio};
}
export function parseHtmlLinks(html,base){
 const found=new Map();
 // No script execution. Explicit manifest links and episode labels from href attributes only.
 for(const m of html.matchAll(/<(?:a|video|source)\b([^>]*)>/gi)){
  const raw=attr(m[1],'href')||attr(m[1],'src');if(!raw)continue;
  let url;try{url=new URL(raw.replaceAll('&amp;','&'),base)}catch{continue}
  if(!['https:','http:'].includes(url.protocol)||!/[.]m3u8$|[.]mpd$|[.]mp4$/i.test(url.pathname))continue;
  const name=attr(m[1],'title')||attr(m[1],'data-title')||url.pathname.split('/').pop()||'Medienquelle';
  const episode=name.match(/(?:s(\d{1,3})[ ._-]*e(\d{1,4})|(?:staffel|season)[ ._-]*(\d{1,3})[ ._-]*(?:folge|episode)[ ._-]*(\d{1,4}))/i);
  found.set(url.href,{url:url.href,title:name.slice(0,140),season:episode?Number(episode[1]||episode[3]):null,episode:episode?Number(episode[2]||episode[4]):null});
 }
 return [...found.values()].slice(0,500);
}
export async function analyzeSource(url,{fetcher=safeFetch}={}){
 parseWebUrl(url);
 const response=await fetcher(url,{maxBytes:2*1024*1024});
 const body=response.body.toString('utf8');const finalUrl=response.url;
 const path=new URL(finalUrl).pathname.toLowerCase();
 if(path.endsWith('.m3u8')||body.startsWith('#EXTM3U')){
  const hls=parseHls(body,finalUrl);
  return {adapter:'hls',kind:hls.kind,variants:hls.variants||[],tracks:hls.kind==='hls'?{segments:hls.segments.length,container:hls.container}:null,items:[]};
 }
 if(path.endsWith('.mpd')||/<MPD\b/.test(body)){
  const dash=parseDash(body,finalUrl);
  return {adapter:'dash',kind:'dash',tracks:{video:dash.video.segments.length,audio:dash.audio?.segments.length||0},items:[]};
 }
 return {adapter:'html-links',kind:'html',items:parseHtmlLinks(body,finalUrl)};
}
