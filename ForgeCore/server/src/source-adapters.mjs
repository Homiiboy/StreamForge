import {safeFetch,parseWebUrl} from './source-security.mjs';

export const SOURCE_ADAPTERS=Object.freeze([{id:'hls',label:'HLS VOD'},{id:'dash',label:'DASH VOD (SegmentList / SegmentTemplate)'},{id:'html-links',label:'Webseite (Links zu Medien/Playlisten)'},{id:'html-episode-data',label:'HTML mit data-season/data-episode'}]);
function attr(tag,key){return (tag.match(new RegExp('\\b'+key+'\\s*=\\s*["\']([^"\']*)["\']','i'))||[])[1]||''}
export function parseHls(text,base){
 if(!text.startsWith('#EXTM3U'))throw Error('Not an HLS playlist');
 if(/#EXT-X-KEY:|#EXT-X-SESSION-KEY:/i.test(text))throw Error('Encrypted HLS unsupported');
 const lines=text.replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean);
 const master=[];const audioGroups=[];const segments=[];let expected='';let init='';let ended=false;
 for(const line of lines){if(!line.startsWith('#EXT-X-MEDIA:')||!/TYPE=AUDIO(?:,|$)/.test(line))continue;
  const match=line.match(/URI="([^"]+)"/i);if(!match)continue;
  audioGroups.push({url:new URL(match[1],base).href,group:(line.match(/GROUP-ID="([^"]+)"/)||[])[1]||'',language:(line.match(/LANGUAGE="([^"]+)"/)||[])[1]||'',default:/DEFAULT=YES/.test(line)});
 }
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(line.startsWith('#EXT-X-STREAM-INF:')){
   const next=lines.slice(i+1).find(s=>!s.startsWith('#'));if(next)master.push({url:new URL(next,base).href,bandwidth:Number((line.match(/BANDWIDTH=(\d+)/)||[])[1]||0),resolution:(line.match(/RESOLUTION=(\d+x\d+)/)||[])[1]||'',audioGroup:(line.match(/AUDIO="([^"]+)"/)||[])[1]||''});
  }else if(line.startsWith('#EXT-X-MAP:')){const uri=(line.match(/URI="([^"]+)"/)||[])[1];if(!uri)throw Error('HLS map without URI');init=new URL(uri,base).href;}
  else if(line.startsWith('#EXTINF:'))expected='media';
  else if(line==='#EXT-X-ENDLIST')ended=true;
  else if(!line.startsWith('#')&&expected==='media'){segments.push(new URL(line,base).href);expected='';}
 }
 if(master.length)return {kind:'master',variants:master.sort((a,b)=>b.bandwidth-a.bandwidth),audioGroups};
 if(!ended)throw Error('Live HLS playlist not supported');
 if(/#EXT-X-BYTERANGE|#EXT-X-PART|#EXT-X-DISCONTINUITY|#EXT-X-I-FRAMES-ONLY/.test(text))throw Error('Unsupported HLS segment feature');
 if(!segments.length||segments.length>4000)throw Error('Invalid HLS segment count');
 return {kind:'hls',segments,init,container:init?'fmp4':'ts'};
}
function expandDashUrl(format,{id,bandwidth,number,time}){
 return format.replace(/\$\$/g,'__DOLLAR__').replace(/\$(RepresentationID|Bandwidth|Number|Time)(?:%0(\d+)d)?\$/g,(_whole,key,pad)=>{
  const value={RepresentationID:id,Bandwidth:bandwidth,Number:number,Time:time}[key];
  if(value===undefined)throw Error('Unsupported DASH segment template placeholder');
  return pad?String(value).padStart(Math.min(12,Number(pad)),'0'):String(value);
 }).replace(/__DOLLAR__/g,'$');
}
function dashSeconds(text){
 const m=String(text||'').match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
 if(!m)return null;return Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0);
}
function dashTemplate(templateAttrs,inner,{id,bandwidth,base,duration}){
 const init=attr(templateAttrs,'initialization'),media=attr(templateAttrs,'media');
 if(!init||!media)return null;
 const timescale=Math.max(1,Number(attr(templateAttrs,'timescale')||1));
 const start=Number(attr(templateAttrs,'startNumber')||1);
 const end=Number(attr(templateAttrs,'endNumber')||0);
 if(!Number.isSafeInteger(start)||start<0)return null;
 const moments=[];
 const timeline=inner.match(/<SegmentTimeline\b[^>]*>([\s\S]*?)<\/SegmentTimeline>/i)?.[1];
 if(timeline){
  let moment=0;
  for(const tag of timeline.matchAll(/<S\b([^>]*)\/?\s*>/gi)){
   const d=Number(attr(tag[1],'d')),repeat=Number(attr(tag[1],'r')||0);
   const t=attr(tag[1],'t');if(t!=='')moment=Number(t);
   if(!Number.isSafeInteger(d)||d<=0||!Number.isSafeInteger(moment)||moment<0||!Number.isInteger(repeat)||repeat<0||repeat>4000)throw Error('Unsupported DASH timeline');
   for(let i=0;i<=repeat;i++){moments.push(moment);moment+=d;if(moments.length>4000)throw Error('Too many DASH segments')}
  }
 }else{
  const segmentDuration=Number(attr(templateAttrs,'duration'));
  const count=end>=start?end-start+1:(duration!=null&&segmentDuration>0?Math.ceil(duration*timescale/segmentDuration):0);
  if(!Number.isInteger(count)||count<=0||count>4000)return null;
  for(let i=0;i<count;i++)moments.push(i*segmentDuration);
 }
 if(!moments.length)return null;
 const vars={id,bandwidth,number:start,time:0};
 const initUrl=new URL(expandDashUrl(init,vars),base).href;
 const segments=moments.map((time,i)=>new URL(expandDashUrl(media,{...vars,number:start+i,time}),base).href);
 return {init:initUrl,segments};
}
export function parseDash(text,base){
 if(!/<MPD\b/i.test(text))throw Error('Not a DASH manifest');
 if(/<ContentProtection\b/i.test(text))throw Error('Protected DASH unsupported');
 if(/type\s*=\s*["']dynamic["']/i.test(text))throw Error('Live DASH unsupported');
 const duration=dashSeconds(attr((text.match(/<MPD\b([^>]*)>/i)||[])[1]||'','mediaPresentationDuration'));
 const tracks=[];
 const sets=[...text.matchAll(/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi)];
 for(const set of sets){
  const mime=attr(set[1],'mimeType');const type=attr(set[1],'contentType')||(mime.startsWith('audio/')?'audio':'video');
  for(const rep of set[2].matchAll(/<Representation\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/Representation>)/gi)){
   const id=attr(rep[1],'id'),bandwidth=Number(attr(rep[1],'bandwidth')||0);
   const repBody=rep[2]||'';
   const repBase=repBody.match(/<BaseURL\b[^>]*>([^<]+)<\/BaseURL>/i)?.[1];
   const baseUri=repBase?new URL(repBase,base).href:base;
   const list=repBody.match(/<SegmentList\b[^>]*>([\s\S]*?)<\/SegmentList>/i)?.[1];
   let segmentData=null;
   if(list){
    const initialization=list.match(/<Initialization\b[^>]*\bsourceURL=["']([^"']+)["']/i)?.[1];
    const segs=[...list.matchAll(/<SegmentURL\b[^>]*\bmedia=["']([^"']+)["'][^>]*\/?\s*>/gi)].map(x=>new URL(x[1],baseUri).href);
    if(initialization&&segs.length&&segs.length<=4000)segmentData={init:new URL(initialization,baseUri).href,segments:segs};
   }
   if(!segmentData){
    const template=repBody.match(/<SegmentTemplate\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/SegmentTemplate>)/i)
     ||set[2].slice(0,set[2].indexOf('<Representation')).match(/<SegmentTemplate\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/SegmentTemplate>)/i);
    if(template)segmentData=dashTemplate(template[1],template[2]||'',{id,bandwidth,base:baseUri,duration});
   }
   if(segmentData)tracks.push({type,url:baseUri,bandwidth,...segmentData});
  }
 }
 if(!tracks.length)throw Error('No supported DASH SegmentList or SegmentTemplate tracks in VOD manifest');
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

export function parseHtmlDataEpisodes(html,base){
 const found=new Map();
 for(const tag of html.matchAll(/<(?:a|video|source)\b([^>]*)>/gi)){
  const attrs=tag[1];
  const season=Number(attr(attrs,'data-season')),episode=Number(attr(attrs,'data-episode'));
  if(!Number.isInteger(season)||season<0||season>999||!Number.isInteger(episode)||episode<0||episode>9999)continue;
  const raw=attr(attrs,'href')||attr(attrs,'src');if(!raw)continue;
  let uri;try{uri=new URL(raw.replaceAll('&amp;','&'),base)}catch{continue}
  if(!['http:','https:'].includes(uri.protocol)||!/\.(?:m3u8|mpd|mp4)$/i.test(uri.pathname))continue;
  found.set(uri.href,{url:uri.href,title:(attr(attrs,'title')||'S'+String(season).padStart(2,'0')+'E'+String(episode).padStart(2,'0')).slice(0,140),season,episode});
 }
 return [...found.values()].slice(0,500);
}
export function selectSourceAdapter(adapter){
 const id=String(adapter||'auto');
 if(!['auto',...SOURCE_ADAPTERS.map(a=>a.id)].includes(id))throw Object.assign(Error('Unsupported source adapter'),{status:400});
 return id;
}

export async function analyzeSource(url,{fetcher=safeFetch,adapter='auto'}={}){
 adapter=selectSourceAdapter(adapter);
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
 if(adapter==='hls'||adapter==='dash')throw Error('Declared adapter does not match source type');
 return {adapter:adapter==='html-episode-data'?'html-episode-data':'html-links',kind:'html',items:adapter==='html-episode-data'?parseHtmlDataEpisodes(body,finalUrl):parseHtmlLinks(body,finalUrl)};
}
