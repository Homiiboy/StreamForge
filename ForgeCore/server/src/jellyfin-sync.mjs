import {one,rows,utc,transaction} from './db.mjs';
import {credentials,jellyfinRequest} from './jellyfin.mjs';
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();
export async function jellyfinInventory(db,{fetcher,maxPages=5}={}){
 const creds=credentials(db),result=[];
 for(let i=0;i<maxPages;i++){
  const data=await jellyfinRequest(creds,'/Items?Recursive=true&IncludeItemTypes=Episode&StartIndex='+i*200+'&Limit=200',{fetcher});
  if(!Array.isArray(data.Items))throw Error('Unexpected Jellyfin item response');
  result.push(...data.Items);if(result.length>1000)throw Error('Jellyfin inventory too large');
  if(data.Items.length<200||data.TotalRecordCount<=result.length)break;
 }
 return result;
}
export function reconcilePreview(db,items){
 if(!Array.isArray(items)||items.length>1000)throw Error('Invalid Jellyfin inventory');
 const media=rows(db,"SELECT id,title FROM media WHERE kind='series'");
 const names=new Map(media.map(m=>[norm(m.title),m.id]));
 const matches=[],unique=new Set();let unmatched=0;
 for(const item of items){
  if(item.Type!=='Episode'||!item.SeriesName||!Number.isInteger(item.ParentIndexNumber)||!Number.isInteger(item.IndexNumber)){unmatched++;continue}
  const mediaId=names.get(norm(item.SeriesName));
  if(!mediaId){unmatched++;continue}
  const episode=one(db,'SELECT id,status FROM episodes WHERE media_id=? AND season=? AND episode=?',mediaId,item.ParentIndexNumber,item.IndexNumber);
  if(!episode||unique.has(episode.id)){unmatched++;continue}
  unique.add(episode.id);
  matches.push({episodeId:episode.id,mediaId,season:item.ParentIndexNumber,episode:item.IndexNumber,was:episode.status,jellyfinName:String(item.Name||'').slice(0,140)});
 }
 return {matched:matches.length,unmatched,availableToMark:matches.filter(x=>x.was==='missing').length,matches};
}
export function applyReconciliation(db,preview){
 const ids=[...new Set(preview.matches.filter(x=>x.was==='missing').map(x=>x.episodeId))];
 let updated=0;
 transaction(db,()=>{
  const q=db.prepare("UPDATE episodes SET status='available',updated_at=? WHERE id=? AND status='missing'");
  for(const id of ids)updated+=q.run(utc(),id).changes;
  db.prepare('INSERT INTO jellyfin_sync_events(checked_at,matched,updated,unmatched) VALUES(?,?,?,?)').run(utc(),preview.matched,updated,preview.unmatched);
 });
 return {updated,matched:preview.matched,unmatched:preview.unmatched};
}
export function recentJellyfinSync(db){return rows(db,'SELECT * FROM jellyfin_sync_events ORDER BY id DESC LIMIT 20')}
