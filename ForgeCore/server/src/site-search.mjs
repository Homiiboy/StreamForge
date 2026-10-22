import {analyzeSource,selectSourceAdapter} from './source-adapters.mjs';
import {parseWebUrl} from './source-security.mjs';
const bad=m=>{throw Object.assign(Error(m),{status:400})};
export function validateSearchSite(input){
 if(!input||typeof input!=='object'||Array.isArray(input))bad('Ungültige Website');
 const url=String(input.url||'').trim();try{parseWebUrl(url)}catch{bad('Ungültige Website-URL')}
 const label=String(input.label||new URL(url).hostname).trim().slice(0,140);
 return {url,label,adapterId:selectSourceAdapter(input.adapterId||'auto'),enabled:input.enabled!==false};
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
export async function searchSites(db,query,{fetcher}={}){
 const q=normalizeSearchTerm(query),sites=db.prepare('SELECT id,url,label,adapter_id FROM search_sites WHERE enabled=1 ORDER BY label COLLATE NOCASE LIMIT 20').all(),results=[],errors=[];
 for(const site of sites){try{
  const x=await analyzeSource(site.url,{adapter:site.adapter_id,...(fetcher?{fetcher}:{})});
  for(const hit of matchItems(x.items,q))results.push({...hit,siteId:site.id,siteLabel:site.label});
 }catch(e){errors.push({siteId:site.id,siteLabel:site.label,error:String(e?.message||e).slice(0,160)})}}
 return {query:q,checked:sites.length,results:results.slice(0,200),errors,moreResults:results.length>200};
}
