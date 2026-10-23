import {randomUUID} from 'node:crypto';
import {jellyfinInventory} from './jellyfin-sync.mjs';
import {utc,transaction} from './db.mjs';

const normalize=v=>String(v||'').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const error=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const key=e=>e.season+':'+e.episode;
function validate(title,sourceEpisodes){
 if(typeof title!=='string'||title.trim().length<2||title.trim().length>140||!Array.isArray(sourceEpisodes)||sourceEpisodes.length>200)error('Ungültige Serienübersicht');
 const entries=new Map();
 for(const e of sourceEpisodes){
  if(!e||!Number.isInteger(e.season)||e.season<0||e.season>999||!Number.isInteger(e.episode)||e.episode<0||e.episode>9999)error('Ungültige Episodendaten');
  entries.set(key(e),{season:e.season,episode:e.episode,title:String(e.title||'').slice(0,140)});
 }
 return {title:title.trim(),sourceEpisodes:[...entries.values()]};
}
export function buildSeriesOverview(db,title,sourceEpisodes,inventory){
 const {title:clean,sourceEpisodes:source}=validate(title,sourceEpisodes);
 const wanted=normalize(clean);
 const jellyfin=new Map();
 for(const item of inventory){
  if(item?.Type!=='Episode'||normalize(item.SeriesName)!==wanted||!Number.isInteger(item.ParentIndexNumber)||!Number.isInteger(item.IndexNumber))continue;
  const season=item.ParentIndexNumber,episode=item.IndexNumber;
  if(season<0||season>999||episode<0||episode>9999)continue;
  jellyfin.set(season+':'+episode,{season,episode,title:String(item.Name||'').slice(0,140)});
 }
 const project=db.prepare("SELECT id,title FROM media WHERE kind='series'").all().find(item=>normalize(item.title)===wanted);
 const tracked=project?db.prepare('SELECT season,episode,title,status FROM episodes WHERE media_id=? ORDER BY season,episode LIMIT 1500').all(project.id):[];
 const combined=new Map();
 for(const e of source)combined.set(key(e),{season:e.season,episode:e.episode,source:true,jellyfin:false,title:e.title,forgecoreStatus:'not-tracked'});
 for(const e of jellyfin.values()){const k=key(e),current=combined.get(k)||{season:e.season,episode:e.episode,source:false,jellyfin:false,title:e.title,forgecoreStatus:'not-tracked'};current.jellyfin=true;if(!current.title)current.title=e.title;combined.set(k,current)}
 for(const e of tracked){const k=key(e),current=combined.get(k)||{season:e.season,episode:e.episode,source:false,jellyfin:false,title:e.title,forgecoreStatus:'not-tracked'};current.forgecoreStatus=e.status;if(!current.title)current.title=e.title;combined.set(k,current)}
 const episodes=[...combined.values()].sort((a,b)=>a.season-b.season||a.episode-b.episode);
 return {title:clean,mediaId:project?.id||null,seasons:[...new Set(episodes.map(e=>e.season))],episodes,summary:{total:episodes.length,inJellyfin:episodes.filter(e=>e.jellyfin).length,onSource:episodes.filter(e=>e.source).length,onBoth:episodes.filter(e=>e.source&&e.jellyfin).length,sourceOnly:episodes.filter(e=>e.source&&!e.jellyfin).length,jellyfinOnly:episodes.filter(e=>e.jellyfin&&!e.source).length,tracked:episodes.filter(e=>e.forgecoreStatus!=='not-tracked').length},complete:false,notice:'Die Übersicht vereinigt nur bestätigte Einträge aus der untersuchten Seite, Jellyfin und ForgeCore. Fehlende Einträge beweisen nicht, dass Episoden fehlen.'};
}
export async function seriesOverview(db,{title,episodes},{fetcher}={}){
 validate(title,episodes);
 const inventory=await jellyfinInventory(db,fetcher?{fetcher}:{});
 return buildSeriesOverview(db,title,episodes,inventory);
}
/** Only explicit project import; never modifies Jellyfin or existing episode statuses. */
export async function importJellyfinSeries(db,{title,confirm},{fetcher}={}){
 if(confirm!=='IMPORT_JELLYFIN_SERIES')error('Bestätigung erforderlich');
 if(typeof title!=='string'||title.trim().length<2||title.trim().length>140)error('Ungültiger Serientitel');
 const inventory=await jellyfinInventory(db,fetcher?{fetcher}:{});
 const overview=buildSeriesOverview(db,title,[],inventory);
 if(!overview.summary.inJellyfin)error('Keine passende Jellyfin-Serie gefunden',404);
 const now=utc(),id=overview.mediaId||randomUUID();let added=0;
 transaction(db,()=>{
  if(!overview.mediaId)db.prepare("INSERT INTO media(id,kind,title,year,external_id,notes,created_at,updated_at) VALUES(?,'series',?,NULL,'','',?,?)").run(id,overview.title,now,now);
  const insert=db.prepare('INSERT OR IGNORE INTO episodes(id,media_id,season,episode,title,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
  for(const ep of overview.episodes.filter(e=>e.jellyfin)){
   added+=insert.run(randomUUID(),id,ep.season,ep.episode,ep.title||'', 'available',now,now).changes;
  }
 });
 return {mediaId:id,created:!overview.mediaId,added,alreadyTracked:overview.summary.inJellyfin-added,notice:'Nur nachgewiesene Jellyfin-Episoden wurden importiert. Bestehende ForgeCore-Episoden wurden nicht überschrieben.'};
}
