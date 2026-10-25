import {newId,rows,one,utc,transaction} from './db.mjs';
import {getJellyfinStatus,jellyfinRequest,credentials} from './jellyfin.mjs';
import {jellyfinSeriesInventory} from './jellyfin-sync.mjs';
import {discoverDetail} from './discover.mjs';
import {discoverSeason,discoverMetadata,validId,validKind,validSeason} from './discover-metadata.mjs';
const fail=(msg,status=400)=>{throw Object.assign(Error(msg),{status})};
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase();
const eid=(kind,id)=>'tmdb:'+kind+':'+id;
export const discoverWatchlist=db=>rows(db,'SELECT tmdb_id AS id,kind,title,year,monitored,added_at AS addedAt,updated_at AS updatedAt,last_checked_at AS lastCheckedAt FROM discover_watchlist ORDER BY updated_at DESC LIMIT 1000').map(x=>({...x,monitored:!!x.monitored}));
export function watchlistRemove(db,{kind,id}){
 validKind(kind);id=validId(id);
 return {removed:db.prepare('DELETE FROM discover_watchlist WHERE kind=? AND tmdb_id=?').run(kind,id).changes>0};
}
export async function watchlistSave(db,{kind,id,monitored=false},{token,fetcher}={}){
 validKind(kind);id=validId(id);
 if(typeof monitored!=='boolean')fail('Ungültiger Überwachungsstatus');
 const title=await discoverDetail({kind,id,token,fetcher});
 const now=utc();
 db.prepare('INSERT INTO discover_watchlist(tmdb_id,kind,title,year,monitored,added_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(kind,tmdb_id) DO UPDATE SET title=excluded.title,year=excluded.year,monitored=excluded.monitored,updated_at=excluded.updated_at')
 .run(id,kind,title.title,title.year,monitored?1:0,now,now);
 return {item:one(db,'SELECT tmdb_id AS id,kind,title,year,monitored FROM discover_watchlist WHERE kind=? AND tmdb_id=?',kind,id)};
}
export function watchlistMonitor(db,{kind,id,monitored}){
 validKind(kind);id=validId(id);
 if(typeof monitored!=='boolean')fail('Ungültiger Überwachungsstatus');
 const changed=db.prepare('UPDATE discover_watchlist SET monitored=?,updated_at=? WHERE kind=? AND tmdb_id=?').run(monitored?1:0,utc(),kind,id).changes;
 if(!changed)fail('Titel nicht auf Merkliste',404);
 return {ok:true};
}
function movieMatch(item,detail){
 if(item?.Type!=='Movie')return false;
 const tid=String(item.ProviderIds?.Tmdb||item.ProviderIds?.TMDb||'');
 if(tid)return tid===String(detail.id);
 return norm(item.Name)===norm(detail.title)&&!!detail.year&&Number(item.ProductionYear)===detail.year;
}
export async function discoverJellyfin(db,detail,{fetcher}={}){
 if(!getJellyfinStatus(db).configured)return {configured:false,state:'unknown',reason:'Jellyfin nicht verbunden',present:[],seriesId:null};
 if(detail.kind==='tv'){
  const found=await jellyfinSeriesInventory(db,detail.title,fetcher?{fetcher}:{});
  const present=found.items.filter(e=>e.Type==='Episode'&&Number.isInteger(e.ParentIndexNumber)&&e.ParentIndexNumber>=0&&Number.isInteger(e.IndexNumber)&&e.IndexNumber>=0)
   .map(e=>({season:e.ParentIndexNumber,episode:e.IndexNumber,title:String(e.Name||'').slice(0,140)}));
  return {configured:true,state:found.seriesId?'matched':'not-matched',
   reason:found.seriesId?'Jellyfin-Serie eindeutig zugeordnet':'Kein eindeutig passender Serientitel gefunden',
   seriesId:found.seriesId,present,specials:found.specials};
 }
 const matches=[],creds=credentials(db);
 for(let page=0;page<5;page++){
  const data=await jellyfinRequest(creds,'/Items?Recursive=true&IncludeItemTypes=Movie&StartIndex='+(page*200)+'&Limit=200',{fetcher});
  if(!Array.isArray(data.Items))fail('Ungültige Jellyfin-Antwort',502);
  for(const movie of data.Items)if(movieMatch(movie,detail))matches.push(movie);
  if(data.Items.length<200||data.TotalRecordCount<=(page+1)*200)break;
  if(page===4)fail('Jellyfin-Filmliste überschreitet die geprüfte Grenze',409);
 }
 return {configured:true,state:matches.length===1?'matched':matches.length>1?'ambiguous':'not-matched',
  reason:matches.length>1?'Mehrdeutiger Film':matches.length===0?'Film nicht eindeutig erkannt':'Film in Jellyfin erkannt',
  present:[],movieId:matches.length===1?matches[0].Id:null};
}
export async function discoverJellyfinPreview(db,{kind,id},{token,fetcher,jellyfinFetch}={}){
 kind=validKind(kind);id=validId(id);
 const detail=await discoverDetail({kind,id,token,fetcher});
 const jf=await discoverJellyfin(db,detail,{fetcher:jellyfinFetch});
 const media=one(db,'SELECT id FROM media WHERE external_id=?',eid(kind,id));
 return {title:detail.title,kind,id,projectId:media?.id||null,...jf};
}
export async function discoverEpisodePlan(db,{id,season},{token,fetcher,jellyfinFetch}={}){
 id=validId(id);season=validSeason(season);
 const detail=await discoverDetail({kind:'tv',id,token,fetcher});
 const list=await discoverSeason({id,season,token,fetcher});
 const media=one(db,'SELECT id FROM media WHERE external_id=?',eid('tv',id));
 const known=media?rows(db,'SELECT season,episode,status FROM episodes WHERE media_id=? AND season=?',media.id,season):[];
 const registry=new Map(known.map(e=>[e.episode,e]));
 const jf=await discoverJellyfin(db,detail,{fetcher:jellyfinFetch});
 const present=new Set(jf.present.filter(e=>e.season===season).map(e=>e.episode));
 const busy=media?rows(db,"SELECT e.episode FROM transfer_jobs t JOIN episodes e ON e.id=t.episode_id WHERE t.media_id=? AND e.season=? AND t.state IN ('queued','running')",media.id,season):[];
 const pending=new Set(busy.map(e=>e.episode));
 const episodes=list.episodes.map(e=>{
  const local=registry.get(e.episode),inJellyfin=present.has(e.episode);
  const state=inJellyfin?'in-jellyfin':local?.status==='available'?'available':local?.status==='ignored'?'ignored':pending.has(e.episode)?'queued':local?.status==='missing'?'missing':'not-tracked';
  return {...e,season,state,inJellyfin,selectable:state==='missing'||state==='not-tracked'};
 });
 return {id,season,title:detail.title,projectId:media?.id||null,jellyfin:{configured:jf.configured,state:jf.state,reason:jf.reason},
  episodes,notice:'Die Übersicht enthält nur TMDB-Einträge. Kein Jellyfin-Treffer ist kein Beweis für eine fehlende Datei. Es werden keine Downloads gestartet.'};
}
export async function applyDiscoverEpisodePlan(db,{id,season,episodes,confirm},{token,fetcher,jellyfinFetch}={}){
 if(confirm!=='ADD_MISSING')fail('Explizite Bestätigung erforderlich');
 id=validId(id);season=validSeason(season);
 if(!Array.isArray(episodes)||!episodes.length||episodes.length>300||new Set(episodes).size!==episodes.length||episodes.some(e=>!Number.isInteger(e)||e<1||e>9999))fail('Ungültige Episodenauswahl');
 const plan=await discoverEpisodePlan(db,{id,season},{token,fetcher,jellyfinFetch});
 const choices=new Map(plan.episodes.map(e=>[e.episode,e]));
 if(episodes.some(n=>!choices.has(n)))fail('Episode nicht in TMDB-Staffel gefunden');
 const now=utc(),externalId=eid('tv',id),media=one(db,'SELECT id FROM media WHERE external_id=?',externalId);
 const mediaId=media?.id||newId(),skipped=[];let added=0;
 transaction(db,()=>{
  if(!media)db.prepare("INSERT INTO media(id,kind,title,year,external_id,notes,created_at,updated_at) VALUES(?,'series',?,?,?,'',?,?)").run(mediaId,plan.title,null,externalId,now,now);
  const insert=db.prepare("INSERT OR IGNORE INTO episodes(id,media_id,season,episode,title,status,created_at,updated_at) VALUES(?,?,?,?,?,'missing',?,?)");
  for(const number of episodes){
   const ep=choices.get(number);
   if(!ep.selectable){skipped.push({episode:number,reason:ep.state});continue}
   const old=one(db,'SELECT status FROM episodes WHERE media_id=? AND season=? AND episode=?',mediaId,season,number);
   if(old){skipped.push({episode:number,reason:old.status});continue}
   added+=insert.run(newId(),mediaId,season,number,ep.title,now,now).changes;
  }
 });
 return {mediaId,added,skipped,downloadJobs:0,notice:'Episoden in der Bibliothek vorgemerkt. Ein Download erfordert separat freigegebene, unterstützte Medienlinks.'};
}
export async function checkDiscoverRadar(db,{token,fetcher,tvmazeFetch,max=30}={}){
 if(!token)return {checked:0,notified:0,errors:['TMDB nicht konfiguriert']};
 const watch=rows(db,'SELECT * FROM discover_watchlist WHERE monitored=1 ORDER BY last_checked_at ASC LIMIT ?',Math.min(Math.max(max,1),50));
 let checked=0,notified=0;const errors=[];
 for(const item of watch){
  try{
   const d=await discoverMetadata({token,kind:item.kind,id:item.tmdb_id,fetcher,tvmazeFetch});
   let event=null;
   if(item.kind==='tv'&&d.nextEpisode?.airDate){
    const ep=d.nextEpisode,days=(Date.parse(ep.airDate+'T12:00:00Z')-Date.now())/86400000;
    if(days>=-1&&days<=30)event={key:'episode:'+ep.season+':'+ep.episode+':'+ep.airDate,message:d.title+' · S'+ep.season+'E'+ep.episode+' am '+ep.airDate};
   }else if(item.kind==='movie'&&d.releaseDate){
    const days=(Date.parse(d.releaseDate+'T12:00:00Z')-Date.now())/86400000;
    if(days>=-1&&days<=30)event={key:'film:'+d.releaseDate,message:d.title+' · angekündigt für '+d.releaseDate};
   }
   if(event&&event.key!==item.last_event_key){
    transaction(db,()=>{
     db.prepare('INSERT INTO notifications(id,category,message,ref_id,created_at) VALUES(?,?,?,?,?)').run(newId(),'discover',event.message,eid(item.kind,item.tmdb_id),utc());
     db.prepare('UPDATE discover_watchlist SET last_event_key=?,last_checked_at=? WHERE kind=? AND tmdb_id=?').run(event.key,utc(),item.kind,item.tmdb_id);
    });notified++;
   }else db.prepare('UPDATE discover_watchlist SET last_checked_at=? WHERE kind=? AND tmdb_id=?').run(utc(),item.kind,item.tmdb_id);
   checked++;
  }catch(e){errors.push(item.title+': '+String(e.message||e).slice(0,100))}
 }
 return {checked,notified,errors};
}
