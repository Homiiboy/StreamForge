import {parseWebUrl,safeFetch} from './source-security.mjs';
import {jellyfinSeriesInventory} from './jellyfin-sync.mjs';

const norm=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const text=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|nbsp);/gi,(all,s)=>{
 if(s[0]==='#'){const hex=s[1]?.toLowerCase()==='x',n=parseInt(s.slice(hex?2:1),hex?16:10);return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):all}
 return {amp:'&',quot:'"',apos:"'",nbsp:' '}[s.toLowerCase()]||all;
}).replace(/\s+/g,' ').trim();
const fail=m=>{throw Object.assign(Error(m),{status:400})};
const episodePattern=/(?:^|[\/_.-])s(\d{1,3})[._-]*e(\d{1,4})(?:[\/_.-]|$)/i;
export const MAX_CATALOG_EPISODES=2500;
const explicitPattern=/(?:^|\/)(?:season|staffel)[-_/ ]*(\d{1,3})\/(?:episode|folge)[-_/ ]*(\d{1,4})(?:\/|$)/i;
export function episodeFromUrl(url){
 let parsed;try{parsed=new URL(url)}catch{return null}
 const path=parsed.pathname;
 if(/(?:^|\/)(?:comments?|kommentare?|forum|forums|discussion|diskussion|support|hilfe|blog|posts?)(?:\/|$)/i.test(path))return null;
 const match=path.match(episodePattern)||path.match(explicitPattern);
 if(match){
  const season=Number(match[1]),episode=Number(match[2]);
  return season<=999&&episode>=1&&episode<=9999?{season,episode}:null;
 }
 // Some series catalogues use URLs with explicit season and episode query
 // parameters rather than a /staffel-N/episode-N path. Require BOTH names.
 const p=parsed.searchParams;
 const s=p.get('staffel')??p.get('season'),e=p.get('folge')??p.get('episode');
 if(!s||!e||!/^[0-9]{1,3}$/.test(s)||!/^[0-9]{1,4}$/.test(e))return null;
 const season=Number(s),episode=Number(e);
 return season<=999&&episode>=1&&episode<=9999?{season,episode}:null;
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
  if(episodes.size>=MAX_CATALOG_EPISODES)break;
 }
 return {seasons:[...seasons].filter(x=>x<=999).sort((a,b)=>a-b).slice(0,100),episodes:[...episodes.values()].sort((a,b)=>a.season-b.season||a.episode-b.episode),truncated:episodes.size>=MAX_CATALOG_EPISODES};
}
export function linkedSeasons(html,base){
 const baseUrl=new URL(base),out=new Map();
 for(const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
  const raw=m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(!raw)continue;
  let link;try{link=new URL(raw.replace(/&amp;/g,'&'),base)}catch{continue}
  if(link.origin!==baseUrl.origin||link.hash)continue;
  // Explicit query season links are supported without guessing URLs.
  // Ignore any query path that already identifies a specific episode.
  if(episodeFromUrl(link.href))continue;
  const n=link.pathname.match(/(?:^|\/)(?:season|staffel)[-_\/]*(\d{1,3})(?:\/|$)/i);
  const params=link.searchParams;
  const querySeason=params.get('staffel')??params.get('season');
  if(!n&&(!querySeason||!/^[0-9]{1,3}$/.test(querySeason)))continue;
  const season=Number(n?n[1]:querySeason);if(season<0||season>100)continue;
  if(link.search&&[...params.keys()].some(key=>!['season','staffel'].includes(key)))continue;
  // An episode URL also contains "staffel-N/" and must never overwrite
  // the actual season overview link (especially across unrelated series).
  if(episodeFromUrl(link.href))continue;
  if(!out.has(season))out.set(season,link.href);
  if(out.size>=40)break;
 }
 return [...out].sort((a,b)=>a[0]-b[0]).map(([season,url])=>({season,url}));
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
 const navigation=linkedSeasons(html,final.href),all=[...parsed.episodes],errors=[],visited=new Set([final.href]);
 let anyTruncated=parsed.truncated;
 for(const link of navigation){
  if(visited.has(link.url))continue;
  visited.add(link.url);
  try{
   const extra=await fetcher(link.url,{maxBytes:2*1024*1024,timeout:12000});
   if(parseWebUrl(extra.url).origin!==root.origin)throw Error('Cross-origin season redirect');
   const part=inspectCatalogHtml(extra.body.toString('utf8'),extra.url);
   all.push(...part.episodes);parsed.seasons.push(...part.seasons);anyTruncated=anyTruncated||part.truncated;
  }catch(e){errors.push({season:link.season,error:String(e.message||e).slice(0,120)})}
 }
 const merged=new Map();
 for(const e of all)merged.set(e.season+':'+e.episode,e);
 parsed.episodes=[...merged.values()].sort((a,b)=>a.season-b.season||a.episode-b.episode).slice(0,MAX_CATALOG_EPISODES);
 anyTruncated=anyTruncated||merged.size>MAX_CATALOG_EPISODES;
 parsed.seasons=[...new Set([...parsed.seasons,...navigation.map(x=>x.season)])].sort((a,b)=>a-b);

 const exact=norm(title);
 const media=db.prepare("SELECT id,title FROM media WHERE kind='series'").all().find(m=>norm(m.title)===exact);
 const known=media?db.prepare('SELECT season,episode,title,status FROM episodes WHERE media_id=? ORDER BY season,episode LIMIT 1000').all(media.id):[];
 const knownKey=new Map(known.map(x=>[x.season+':'+x.episode,x]));
 const episodes=parsed.episodes.map(x=>({...x,forgecoreStatus:knownKey.get(x.season+':'+x.episode)?.status||'not-tracked'}));
 return {title:title.trim(),siteLabel:site.label,url:final.href,checkedSeasonPages:visited.size,seasonErrors:errors,sourceCounts:parsed.seasons.map(season=>({season,episodes:parsed.episodes.filter(e=>e.season===season).length})),mediaId:media?.id||null,seasons:[...new Set([...parsed.seasons,...known.map(e=>e.season)])].sort((a,b)=>a-b),episodes,knownEpisodes:known,truncated:anyTruncated,specialsState:parsed.episodes.some(e=>e.season===0)?'erkannt':navigation.some(n=>n.season===0)?'keine belegten Episoden':'nicht auf untersuchten Seiten nachgewiesen',notice:'Nur belegte Episoden-URLs werden gezählt. Nicht erkannte Specials oder Staffeln gelten nicht automatisch als nicht vorhanden.'};
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
 if(typeof title!=='string'||title.length<2||title.length>140||!Array.isArray(episodes)||episodes.length>MAX_CATALOG_EPISODES)fail('Ungültige Jellyfin-Vorschau');
 const normalized=episodes.map(e=>{
  if(!Number.isInteger(e.season)||e.season<0||e.season>999||!Number.isInteger(e.episode)||e.episode<0||e.episode>9999)fail('Ungültige Episodennummer');
  return {season:e.season,episode:e.episode};
 });
 const scoped=await jellyfinSeriesInventory(db,title,fetcher?{fetcher}:{});
 return {...compareCatalogWithJellyfin(title,normalized.filter(e=>e.season!==0),scoped.items.filter(e=>e.ParentIndexNumber!==0)),seriesId:scoped.seriesId,hiddenSpecials:scoped.specials};
}
