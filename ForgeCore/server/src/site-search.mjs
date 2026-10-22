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
export function detailCandidates(html,base,term,{max=5}={}){
 const origin=new URL(base).origin,seen=new Set(),out=[];
 const normalized=norm(term).trim().split(/\s+/).filter(Boolean);
 for(const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
  const attrs=m[1],href=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  if(!href)continue;
  const title=((attrs.match(/\b(?:title|data-title)\s*=\s*["']([^"']+)["']/i)||[])[1]||m[2].replace(/<[^>]*>/g,' ')).trim();
  const searchable=norm(title+' '+href);
  if(!normalized.every(t=>searchable.includes(t)))continue;
  let next;try{next=new URL(href.replaceAll('&amp;','&'),base)}catch{continue}
  if(next.origin!==origin||!['http:','https:'].includes(next.protocol)||next.hash||seen.has(next.href))continue;
  if(/\.(?:m3u8|mpd|mp4|m4v|webm)(?:$|[?#])/i.test(next.pathname))continue;
  seen.add(next.href);out.push({url:next.href,title:title.slice(0,140)});
  if(out.length>=max)break;
 }
 return out;
}
export async function searchSites(db,query,{fetcher=safeFetch}={}){
 const q=normalizeSearchTerm(query),sites=db.prepare('SELECT id,url,label,adapter_id,search_template FROM search_sites WHERE enabled=1 ORDER BY label COLLATE NOCASE LIMIT 20').all(),results=[],errors=[];
 for(const site of sites){
  try{
   const start=site.search_template?site.search_template.replaceAll('{query}',encodeURIComponent(q)):site.url;
   const response=await fetcher(start,{maxBytes:2*1024*1024,timeout:12000});
   const finalUrl=response.url,body=response.body.toString('utf8');
   const analysis=await analyzeSource(finalUrl,{adapter:site.adapter_id,fetcher:async(url,opts)=>url===finalUrl?response:fetcher(url,opts)});
   let matches=matchItems(analysis.items,q);
   // Follow only matching same-origin title links, never a whole website.
   if(analysis.kind==='html'&&matches.length===0){
    for(const detail of detailCandidates(body,finalUrl,q)){
     try{
      const page=await analyzeSource(detail.url,{adapter:site.adapter_id,fetcher});
      const unique=new Set(matches.map(x=>x.url));
      for(const item of page.items||[]){
       if(typeof item.url!=='string'||unique.has(item.url))continue;
       unique.add(item.url);
       matches.push({url:item.url,title:(item.title||detail.title).slice(0,140),season:item.season??null,episode:item.episode??null,detailUrl:detail.url});
       if(matches.length>=100)break;
      }
     }catch(err){errors.push({siteId:site.id,siteLabel:site.label,error:'Detailseite: '+String(err?.message||err).slice(0,140)})}
     if(matches.length>=100)break;
    }
   }
   for(const hit of matches)results.push({...hit,siteId:site.id,siteLabel:site.label});
  }catch(e){errors.push({siteId:site.id,siteLabel:site.label,error:String(e?.message||e).slice(0,160)})}
 }
 return {query:q,checked:sites.length,results:results.slice(0,200),errors,moreResults:results.length>200};
}
