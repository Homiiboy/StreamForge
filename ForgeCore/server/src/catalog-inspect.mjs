import {parseWebUrl,safeFetch} from './source-security.mjs';
import {jellyfinInventory} from './jellyfin-sync.mjs';

const norm=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const text=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|nbsp);/gi,(all,s)=>{
 if(s[0]==='#'){const hex=s[1]?.toLowerCase()==='x',n=parseInt(s.slice(hex?2:1),hex?16:10);return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):all}
 return {amp:'&',quot:'"',apos:"'",nbsp:' '}[s.toLowerCase()]||all;
}).replace(/\s+/g,' ').trim();
const fail=m=>{throw Object.assign(Error(m),{status:400})};
const episodePattern=/(?:^|[\/_.-])s(\d{1,3})[._-]*e(\d{1,4})(?:[\/_.-]|$)/i;
const explicitPattern=/(?:^|\/)(?:season|staffel)[-_/ ]*(\d{1,3})\/(?:episode|folge)[-_/ ]*(\d{1,4})(?:\/|$)/i;
export function episodeFromUrl(url){
 let path;try{path=new URL(url).pathname}catch{return null}
 if(/(?:^|\/)(?:comments?|kommentare?|forum|forums|discussion|diskussion|support|hilfe|blog|posts?)(?:\/|$)/i.test(path))return null;
 const match=path.match(episodePattern)||path.match(explicitPattern);
 if(!match)return null;
 const season=Number(match[1]),episode=Number(match[2]);
 if(season>999||episode>9999)return null;
 return {season,episode};
}
export function inspectCatalogHtml(html,base){
 const origin=new URL(base).origin,episodes=new Map(),seasons=new Set();
 const body=String(html||'').slice(0,2*1024*1024);
 for(const m of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
  const href=m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;
  let url;try{url=new URL(href.replace(/&amp;/gi,'&'),base)}catch{continue}
  if(url.origin!==origin||!['http:','https:'].includes(url.protocol)||url.hash)continue;
  const path=url.pathname;
  const seasonOnly=path.match(/(?:^|\/)(?:staffel|season)[-_/ ]*(\d{1,3})(?:\/|$)/i);
  if(seasonOnly)seasons.add(Number(seasonOnly[1]));
  const ep=episodeFromUrl(url.href);if(!ep)continue;
  seasons.add(ep.season);
  const key=ep.season+':'+ep.episode;
  if(!episodes.has(key))episodes.set(key,{...ep,title:text(m[2]).slice(0,140),url:url.href});
  if(episodes.size>=200)break;
 }
 return {seasons:[...seasons].filter(x=>x<=999).sort((a,b)=>a-b).slice(0,100),episodes:[...episodes.values()].sort((a,b)=>a.season-b.season||a.episode-b.episode),truncated:episodes.size>=200};
}
/** Only URLs belonging to an enabled, saved site can be inspected. */
export async function inspectCatalog(db,{siteId,url,title},{fetcher=safeFetch}={}){
 if(typeof siteId!=='string'||typeof url!=='string'||typeof title!=='string'||title.trim().length<2||title.length>140)fail('Ungültige Kataloganfrage');
 const site=db.prepare('SELECT id,url,label FROM search_sites WHERE id=? AND enabled=1').get(siteId);
 if(!site)fail('Website nicht gespeichert oder deaktiviert');
 const target=parseWebUrl(url),root=parseWebUrl(site.url);
 if(target.origin!==root.origin||target.href.length>2048)fail('Titelseite muss zur gespeicherten Website gehören');
 if(/\/(?:suche|search|comments|forum|hilfe)(?:\/|$)/i.test(target.pathname))fail('Keine gültige Titelseite');
 const response=await fetcher(target.href,{maxBytes:2*1024*1024,timeout:12000});
 const final=parseWebUrl(response.url);
 if(final.origin!==root.origin)fail('Weiterleitung auf andere Website nicht zulässig');
 const html=response.body.toString('utf8');
 const parsed=inspectCatalogHtml(html,final.href);
 const exact=norm(title);
 const media=db.prepare("SELECT id,title FROM media WHERE kind='series'").all().find(m=>norm(m.title)===exact);
 const known=media?db.prepare('SELECT season,episode,title,status FROM episodes WHERE media_id=? ORDER BY season,episode LIMIT 1000').all(media.id):[];
 const knownKey=new Map(known.map(x=>[x.season+':'+x.episode,x]));
 const episodes=parsed.episodes.map(x=>({...x,forgecoreStatus:knownKey.get(x.season+':'+x.episode)?.status||'not-tracked'}));
 return {title:title.trim(),siteLabel:site.label,url:final.href,mediaId:media?.id||null,seasons:[...new Set([...parsed.seasons,...known.map(e=>e.season)])].sort((a,b)=>a-b),episodes,knownEpisodes:known,truncated:parsed.truncated,notice:'Nur direkt anhand von URL-Mustern belegte Episoden werden erkannt. Unvollständige Staffellisten sind möglich.'};
}
export function compareCatalogWithJellyfin(title,episodes,inventory){
 const needle=norm(title),have=new Map();
 for(const item of inventory){
  if(item?.Type!=='Episode'||norm(item.SeriesName)!==needle||!Number.isInteger(item.ParentIndexNumber)||!Number.isInteger(item.IndexNumber))continue;
  have.set(item.ParentIndexNumber+':'+item.IndexNumber,String(item.Name||'').slice(0,140));
 }
 return {foundInJellyfin:have.size,matched:episodes.filter(x=>have.has(x.season+':'+x.episode)).length,items:episodes.map(x=>({season:x.season,episode:x.episode,inJellyfin:have.has(x.season+':'+x.episode)}))};
}
export async function catalogJellyfinPreview(db,{title,episodes},{fetcher}={}){
 if(typeof title!=='string'||title.length<2||title.length>140||!Array.isArray(episodes)||episodes.length>200)fail('Ungültige Jellyfin-Vorschau');
 const normalized=episodes.map(e=>{
  if(!Number.isInteger(e.season)||e.season<0||e.season>999||!Number.isInteger(e.episode)||e.episode<0||e.episode>9999)fail('Ungültige Episodennummer');
  return {season:e.season,episode:e.episode};
 });
 const inventory=await jellyfinInventory(db,fetcher?{fetcher}:{});
 return compareCatalogWithJellyfin(title,normalized,inventory);
}
