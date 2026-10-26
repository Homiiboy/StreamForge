// Bounded, same-origin navigation: title page -> requested season -> exact episode.
// Do not guess links from a URL template, do not search other series, do not follow hosters.
import {safeFetch,parseWebUrl} from './source-security.mjs';
import {inspectCatalogHtml,linkedSeasons} from './catalog-inspect.mjs';

const MAX_SERIES_PAGES=4;
const MAX_BYTES=2*1024*1024;
const TIMEOUT=9000;

function seriesSlug(raw){
 try{
  const path=new URL(raw).pathname;
  const parts=path.split('/').filter(Boolean);
  return decodeURIComponent(parts.at(-1)||'').normalize('NFKD').toLowerCase();
 }catch{return ''}
}
function belongsToSeries(series,episode){
 try{
  const root=new URL(series),link=new URL(episode);
  if(root.origin!==link.origin)return false;
  const slug=seriesSlug(root.href);
  // Only a distinctly named series, not a generic numeric ID or index.
  if(slug.length<3||!/[\p{L}]/u.test(slug))return false;
  const segments=decodeURIComponent(link.pathname).normalize('NFKD').toLowerCase().split('/').filter(Boolean);
  return segments.includes(slug);
 }catch{return false}
}
async function readSameOrigin(url,origin,fetcher){
 const reply=await fetcher(url,{maxBytes:MAX_BYTES,timeout:TIMEOUT});
 const final=parseWebUrl(reply.url);
 if(final.origin!==origin)throw Error('Weiterleitung auf fremde Website blockiert');
 return {url:final.href,html:reply.body.toString('utf8')};
}
export async function resolveExactCatalogEpisodes(searchResults,{season,episode},{fetcher=safeFetch,maxSeriesPages=MAX_SERIES_PAGES}={}){
 if(!Number.isInteger(season)||season<0||season>999||!Number.isInteger(episode)||episode<1||episode>9999)
  throw Error('Ungültige Episodenanforderung');
 const pages=(searchResults||[]).filter(x=>x.kind==='catalog'&&['series','title'].includes(x.mediaType));
 const selected=[],seen=new Set();
 for(const x of pages){
  if(seen.has(x.siteId))continue;
  seen.add(x.siteId);selected.push(x);
  if(selected.length>=Math.min(MAX_SERIES_PAGES,Math.max(1,maxSeriesPages)))break;
 }
 const found=[],warnings=[];
 for(const root of selected){
  try{
   const origin=parseWebUrl(root.url).origin;
   const page=await readSameOrigin(root.url,origin,fetcher);
   let list=inspectCatalogHtml(page.html,page.url).episodes;
   let matched=list.find(x=>x.season===season&&x.episode===episode&&belongsToSeries(root.url,x.url));
   if(!matched){
    const seasons=linkedSeasons(page.html,page.url);
    const target=seasons.find(s=>s.season===season&&belongsToSeries(root.url,s.url));
    if(target){
     const sub=await readSameOrigin(target.url,origin,fetcher);
     list=inspectCatalogHtml(sub.html,sub.url).episodes;
     matched=list.find(x=>x.season===season&&x.episode===episode&&belongsToSeries(root.url,x.url));
    }
   }
   if(!matched)continue;
   // The episode exists as an actual same-site href. Never construct or guess it.
   found.push({kind:'catalog',mediaType:'episode',url:matched.url,title:root.title,
    aliases:root.aliases||[],siteId:root.siteId,siteLabel:root.siteLabel,
    season,episode,rank:150,resolvedFrom:root.url});
  }catch(e){warnings.push({siteId:root.siteId,siteLabel:root.siteLabel,
    message:'Staffel-/Episodennavigation: '+String(e.message||e).slice(0,110)})}
 }
 return {episodes:found,warnings,checked:selected.length};
}
