import {analyzeSource,selectSourceAdapter} from './source-adapters.mjs';
import {parseWebUrl,safeFetch} from './source-security.mjs';
const bad=m=>{throw Object.assign(Error(m),{status:400})};
export function validateSearchSite(input){
 if(!input||typeof input!=='object'||Array.isArray(input))bad('Ungültige Website');
 const url=String(input.url||'').trim();try{parseWebUrl(url)}catch{bad('Ungültige Website-URL')}
 const label=String(input.label||new URL(url).hostname).trim().slice(0,140);
 const searchTemplate=String(input.searchTemplate||'').trim();
 if(searchTemplate){
  if(searchTemplate.length>2048||!searchTemplate.includes('{query}'))bad('Suchvorlage muss {query} enthalten');
  const preview=searchTemplate.replaceAll('{query}',encodeURIComponent('Test'));
  let parsed;try{parsed=parseWebUrl(preview)}catch{bad('Ungültige Suchvorlage')}
  const origin=new URL(url);
  if(parsed.origin!==origin.origin)bad('Suchvorlage muss zur selben Website gehören');
 }
 return {url,label,adapterId:selectSourceAdapter(input.adapterId||'auto'),enabled:input.enabled!==false,searchTemplate};
}
export function normalizeSearchTerm(value){const q=String(value||'').trim().replace(/\s+/g,' ');if(q.length<2||q.length>140)bad('Suchbegriff muss 2 bis 140 Zeichen enthalten');return q;}
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ');
export function matchItems(items,query){
 const needle=norm(query).trim().split(/\s+/),seen=new Set(),out=[];
 for(const item of items||[]){
  if(typeof item.url!=='string'||seen.has(item.url))continue;
  let pathname;try{const u=new URL(item.url);if(!['http:','https:'].includes(u.protocol))continue;pathname=u.pathname}catch{continue}
  const hay=norm((item.title||'')+' '+pathname);
  if(!needle.every(w=>hay.includes(w)))continue;
  seen.add(item.url);out.push({url:item.url,title:String(item.title||'').slice(0,140),season:item.season??null,episode:item.episode??null});
 }
 return out.slice(0,100);
}
const entityMap={amp:'&',quot:'"',apos:"'",nbsp:' ',lt:'<',gt:'>',hellip:'…',ndash:'–',mdash:'—'};
export function decodeTitle(value){
 return String(value||'').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);?/gi,(full,key)=>{
  if(key[0]==='#'){
   const hex=key[1]?.toLowerCase()==='x',n=Number.parseInt(key.slice(hex?2:1),hex?16:10);
   return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):full;
  }
  return entityMap[key.toLowerCase()]??full;
 }).replace(/\s+/g,' ').trim();
}
function splitTitle(label,query){
 const clean=decodeTitle(label).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 const parts=clean.split(/\s*,\s*/).filter(Boolean);
 if(parts.length<2)return {title:clean.slice(0,140),aliases:[]};
 const term=norm(query).trim();
 const primary=parts.find(part=>norm(part).trim()===term)||parts[0];
 return {title:primary.slice(0,140),aliases:[...new Set(parts.filter(p=>p!==primary))].slice(0,12).map(x=>x.slice(0,140))};
}
function explicitTitlePath(path){
 return /\/(?:serie|series|show|shows|anime|animes|film|films|movie|movies|title|titel|watch|episode|episodes)\/[^/]+\/?$/i.test(path);
}
function disallowedCatalogPath(path){
 return /(?:^|\/)(?:comment|comments|kommentar|kommentare|discussion|diskussion|forum|forums|support|help|hilfe|faq|user|users|profile|news|blog|article|articles|post|posts|search|suche)(?:\/|$)/i.test(path);
}
function episodeFromPath(path){
 const m=path.match(/(?:^|[\/._-])s(\d{1,3})[ ._-]*e(\d{1,4})(?:[\/._-]|$)/i)
  ||path.match(/(?:^|[\/._-])(?:season|staffel)[ ._-]*(\d{1,3})[\/._-]*(?:episode|folge)[ ._-]*(\d{1,4})(?:[\/._-]|$)/i);
 return m?{season:Number(m[1]),episode:Number(m[2])}:{season:null,episode:null};
}
function catalogRank(item,query){
 const needle=norm(query).trim(),raw=norm(item.title).trim();
 const path=new URL(item.url).pathname,slug=norm(decodeURIComponent(path.split('/').filter(Boolean).at(-1)||'')).trim();
 const alias=(item.aliases||[]).some(x=>norm(x).trim()===needle);
 return (raw===needle?100:alias?95:slug===needle?90:raw.startsWith(needle+' ')?75:raw.includes(needle)?45:10)+(explicitTitlePath(path)?10:0);
}
function pageInfo(html){
 // Only non-executable HTML: h1, meta title and publication year.
 const h1=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
 const meta=html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
 const name=decodeTitle((h1||meta||'').replace(/<[^>]*>/g,' '));
 const text=decodeTitle(html.replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<[^>]*>/g,' '));
 const match=text.match(/\b(?:19|20)\d{2}\b/);
 return {name:name.slice(0,140),year:match?Number(match[0]):null};
}
export function detailCandidates(html,base,term,{max=5}={}){
 const origin=new URL(base).origin,seen=new Set(),out=[];
 const normalized=norm(term).trim().split(/\s+/).filter(Boolean);
 for(const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
  const attrs=m[1],href=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  if(!href)continue;
  let next;try{next=new URL(decodeTitle(href),base)}catch{continue}
  if(next.origin!==origin||!['http:','https:'].includes(next.protocol)||next.hash||seen.has(next.href)||disallowedCatalogPath(next.pathname))continue;
  if(/\.(?:m3u8|mpd|mp4|m4v|webm)$/i.test(next.pathname))continue;
  const attrTitle=attrs.match(/\b(?:title|data-title)\s*=\s*["']([^"']+)["']/i)?.[1]||'';
  const linkLabel=decodeTitle(m[2].replace(/<[^>]*>/g,' '));
  const display=decodeTitle(attrTitle||linkLabel);
  const searchable=norm(display+' '+next.pathname);
  if(!normalized.every(t=>searchable.includes(t)))continue;
  // Avoid treating verbose comments and questions as catalog titles.
  if(!explicitTitlePath(next.pathname)&&(/^(?:bei|warum|wieso|wie|kann|frage|help)\b/i.test(display)||display.length>175||/[?!].{8,}/.test(display)))continue;
  if(!display&&next.pathname==='/')continue;
  seen.add(next.href);
  out.push({url:next.href,title:display.slice(0,800)});
  if(out.length>=max)break;
 }
 return out;
}
/** Catalog pages have their own status; episode tags must come from URL structure. */
function catalogHit(candidate,site,query,info={}){
 const path=new URL(candidate.url).pathname;
 const raw=info.name&&norm(info.name).includes(norm(query).trim())?info.name:candidate.title;
 const parsed=splitTitle(raw||query,query);
 const {season,episode}=episodeFromPath(path);
 const type=season!==null?'episode':/(?:^|\/)(?:film|films|movie|movies)(?:\/|$)/i.test(path)?'movie':/(?:^|\/)(?:serie|series|shows?|animes?)(?:\/|$)/i.test(path)?'series':'title';
 const item={url:candidate.url,title:parsed.title||query,aliases:parsed.aliases,year:info.year||null,kind:'catalog',mediaType:type,season,episode,siteId:site.id,siteLabel:site.label};
 return {...item,rank:catalogRank(item,query)};
}
export async function searchSites(db,query,{fetcher=safeFetch}={}){
 const q=normalizeSearchTerm(query),sites=db.prepare('SELECT id,url,label,adapter_id,search_template FROM search_sites WHERE enabled=1 ORDER BY label COLLATE NOCASE LIMIT 20').all(),results=[],errors=[],warnings=[];
 for(const site of sites){
  try{
   const start=site.search_template?site.search_template.replaceAll('{query}',encodeURIComponent(q)):site.url;
   const response=await fetcher(start,{maxBytes:2*1024*1024,timeout:12000});
   const finalUrl=response.url,body=response.body.toString('utf8');
   const analysis=await analyzeSource(finalUrl,{adapter:site.adapter_id,fetcher:async(url,opts)=>url===finalUrl?response:fetcher(url,opts)});
   const media=matchItems(analysis.items,q).map(x=>({...x,kind:'media',siteId:site.id,siteLabel:site.label}));
   const catalog=analysis.kind==='html'?detailCandidates(body,finalUrl,q,{max:15}):[];
   const seen=new Set(media.map(x=>x.url)),detailInfo=new Map();
   // Fetch at most five same-origin catalog pages; no arbitrary crawling.
   for(const detail of catalog.slice(0,5)){
    try{
     const pageResponse=await fetcher(detail.url,{maxBytes:2*1024*1024,timeout:12000});
     // Read metadata from HTML, not from arbitrary comment text.
     const text=pageResponse.body.toString('utf8');
     if(/<html\b|<h1\b|<meta\b/i.test(text))detailInfo.set(detail.url,pageInfo(text));
     const page=await analyzeSource(pageResponse.url,{adapter:site.adapter_id,fetcher:async()=>pageResponse});
     for(const item of page.items||[]){
      if(typeof item.url!=='string'||seen.has(item.url))continue;
      seen.add(item.url);
      media.push({url:item.url,title:decodeTitle(item.title||detail.title).slice(0,140),season:item.season??null,episode:item.episode??null,detailUrl:detail.url,kind:'media',siteId:site.id,siteLabel:site.label});
      if(media.length>=100)break;
     }
    }catch(err){errors.push({siteId:site.id,siteLabel:site.label,error:'Detailseite: '+String(err?.message||err).slice(0,140)})}
    if(media.length>=100)break;
   }
   for(const item of media)results.push(item);
   for(const item of catalog){
    if(!seen.has(item.url)&&!media.some(hit=>hit.detailUrl===item.url))results.push(catalogHit(item,site,q,detailInfo.get(item.url)));
   }
   if(!site.search_template&&catalog.length===0&&media.length===0)warnings.push({siteId:site.id,siteLabel:site.label,message:'Kein passender Titel auf der Startseite. Prüfe die Suchadresse mit {query}.'});
  }catch(e){errors.push({siteId:site.id,siteLabel:site.label,error:String(e?.message||e).slice(0,160)})}
 }
 results.sort((a,b)=>(b.rank||0)-(a.rank||0)||a.title.localeCompare(b.title,'de'));
 return {query:q,checked:sites.length,results:results.slice(0,200),errors,warnings,moreResults:results.length>200};
}
