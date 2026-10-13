import {newId,utc,one,rows} from './db.mjs';
import {downloadMedia} from './media-download.mjs';
import {previewLibrary} from './library.mjs';
import {loadSchedule,scheduleAllows,addNotification} from './phase3.mjs';
import {jellyfinRefresh} from './jellyfin.mjs';

const RECOVERABLE=/(?:ETIMEDOUT|ECONNRESET|EAI_AGAIN|HTTP\s+(?:408|429|500|502|503|504)|timeout|temporarily unavailable|socket hang up|network reset|fetch failed)/i;
function event(db,id,category,description){db.prepare('INSERT INTO transfer_events(transfer_id,category,description,created_at) VALUES(?,?,?,?)').run(id,category,String(description).slice(0,500),utc());}
export class TransferQueue {
 constructor(db,{mediaRoot='',interval=1800,download=downloadMedia}={}){this.db=db;this.root=mediaRoot;this.interval=interval;this.download=download;this.timer=null;this.busy=false;this.active=new Map();this.inFlight=null;}
 enqueue({mediaId,episodeId=null,sourceId,itemId=null}){
  const media=one(this.db,'SELECT * FROM media WHERE id=?',mediaId);
  if(!media)throw Object.assign(Error('Media project not found'),{status:404});
  const source=one(this.db,'SELECT * FROM sources WHERE id=? AND media_id=? AND enabled=1',sourceId,mediaId);
  if(!source)throw Object.assign(Error('Active source not found'),{status:404});
  let episode=null;
  if(media.kind==='series'){
   episode=one(this.db,'SELECT * FROM episodes WHERE id=? AND media_id=?',episodeId||'',mediaId);
   if(!episode)throw Object.assign(Error('Series episode must be selected'),{status:400});
  }else if(episodeId)throw Object.assign(Error('Movies have no episode'),{status:400});
  let targetUrl=source.url;
  if(itemId){const item=one(this.db,'SELECT * FROM source_items WHERE id=? AND source_id=?',itemId,sourceId);if(!item)throw Object.assign(Error('Discovered source item not found'),{status:404});if(episode && (item.season!=null&&item.season!==episode.season||item.episode!=null&&item.episode!==episode.episode))throw Object.assign(Error('Source episode does not match selected episode'),{status:409});targetUrl=item.url;}
  if(!/\.(m3u8|mpd|mp4|m4v)(?:[?#]|$)/i.test(new URL(targetUrl).pathname))throw Object.assign(Error('Select a direct HLS/DASH/MP4 source item first'),{status:400});
  const existing=one(this.db,"SELECT id FROM transfer_jobs WHERE media_id=? AND COALESCE(episode_id,'')=COALESCE(?,'') AND state IN ('queued','running')",mediaId,episodeId);
  if(existing)throw Object.assign(Error('A download is already queued for this title or episode'),{status:409});
  const id=newId(),time=utc();this.db.prepare('INSERT INTO transfer_jobs(id,media_id,episode_id,source_id,item_id,url,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,mediaId,episodeId,sourceId,itemId,targetUrl,'queued',time,time);
  event(this.db,id,'queued','Download scheduled');
  return one(this.db,'SELECT * FROM transfer_jobs WHERE id=?',id);
 }
 list(){return rows(this.db,'SELECT * FROM transfer_jobs ORDER BY created_at DESC,id DESC LIMIT 200');}
 cancel(id){const row=one(this.db,'SELECT state FROM transfer_jobs WHERE id=?',id);if(!row)return false;
  if(row.state==='running'){this.active.get(id)?.abort();return true;}
  const ok=this.db.prepare("UPDATE transfer_jobs SET state='cancelled',updated_at=? WHERE id=? AND state='queued'").run(utc(),id).changes>0;
  if(ok)event(this.db,id,'cancelled','Queued transfer cancelled');return ok;
 }
 retry(id){const ok=this.db.prepare("UPDATE transfer_jobs SET state='queued',error=NULL,progress=0,retry_after_epoch=0,updated_at=? WHERE id=? AND state IN ('failed','cancelled')").run(utc(),id).changes>0;if(ok)event(this.db,id,'retry','Manual retry requested');return ok;}
 start(){if(this.timer)return;this.timer=setInterval(()=>{this.inFlight=this.tick().catch(()=>{});},this.interval);this.timer.unref?.();}
 async stop(){if(this.timer)clearInterval(this.timer);this.timer=null;for(const x of this.active.values())x.abort();if(this.inFlight)await this.inFlight;}
 async tick(){
  if(this.busy)return false;
  if(!scheduleAllows(loadSchedule(this.db)))return false;
  const item=one(this.db,"SELECT * FROM transfer_jobs WHERE state='queued' AND retry_after_epoch<=? ORDER BY created_at,id LIMIT 1",Date.now());if(!item)return false;
  this.busy=true;const controller=new AbortController();this.active.set(item.id,controller);
  try{
   const media=one(this.db,'SELECT * FROM media WHERE id=?',item.media_id);
   const episode=item.episode_id?one(this.db,'SELECT * FROM episodes WHERE id=?',item.episode_id):null;
   if(!media||media.kind==='series'&&!episode)throw Error('Media or episode deleted');
   if(!this.root)throw Error('Jellyfin media root not configured');
   const preview=await previewLibrary(this.root,media,episode);
   if(preview.exists)throw Error('Jellyfin file already exists: '+preview.files.join(','));
   this.db.prepare("UPDATE transfer_jobs SET state='running',attempts=attempts+1,updated_at=? WHERE id=?").run(utc(),item.id);
   event(this.db,item.id,'running','Transfer started (attempt '+(item.attempts+1)+')');
   const preferred=one(this.db,"SELECT value FROM config WHERE key='preferred_language'")?.value||'de';
   const result=await this.download({jobId:item.id,language:preferred,sourceUrl:item.url,media,episode,root:this.root,rateLimitBytesPerSecond:loadSchedule(this.db).bandwidthKbps*1024,signal:controller.signal,onProgress:({segments,total,bytes})=>{
    const pct=Math.max(0,Math.min(99,Math.floor(segments/Math.max(1,total)*95)));
    this.db.prepare("UPDATE transfer_jobs SET progress=?,downloaded_bytes=?,updated_at=? WHERE id=? AND state='running'").run(pct,bytes,utc(),item.id);
   }});
   this.db.prepare("UPDATE transfer_jobs SET state='complete',progress=100,result_json=?,updated_at=? WHERE id=?").run(JSON.stringify(result),utc(),item.id);
   event(this.db,item.id,'complete',result.path||'Download finished');
   addNotification(this.db,{category:'download',message:'Download abgeschlossen: '+media.title+(episode?' S'+String(episode.season).padStart(2,'0')+'E'+String(episode.episode).padStart(2,'0'):''),refId:item.id});
   if(episode&&episode.status!=='ignored')this.db.prepare("UPDATE episodes SET status='available',updated_at=? WHERE id=?").run(utc(),episode.id);
   if(one(this.db,"SELECT value FROM config WHERE key='jellyfin_auto_refresh'")?.value==='1'){
    try{await jellyfinRefresh(this.db);event(this.db,item.id,'jellyfin','Jellyfin library refresh requested');}
    catch(error){event(this.db,item.id,'jellyfin-warning','Refresh failed: '+String(error.message||error).slice(0,200));}
   }
  }catch(error){
   const explanation=String(error?.message||error).slice(0,1000);
   const retries=loadSchedule(this.db).maxRetries;
   const mayRetry=!controller.signal.aborted&&RECOVERABLE.test(explanation)&&item.attempts<=retries;
   const delay=mayRetry?Math.min(30*60*1000,Math.pow(2,item.attempts)*10000):0;
   const next=controller.signal.aborted?'cancelled':mayRetry?'queued':'failed';
   this.db.prepare("UPDATE transfer_jobs SET state=?,error=?,retry_after_epoch=?,updated_at=? WHERE id=?").run(next,explanation,Date.now()+delay,utc(),item.id);
   event(this.db,item.id,mayRetry?'backoff':next,mayRetry?'Automatic retry in '+Math.ceil(delay/1000)+'s: '+explanation:explanation);
   if(!mayRetry)addNotification(this.db,{category:controller.signal.aborted?'cancel':'error',message:'Transfer '+(controller.signal.aborted?'abgebrochen':'fehlgeschlagen')+': '+explanation.slice(0,240),refId:item.id});
  }finally{this.active.delete(item.id);this.busy=false;}
  return true;
 }
}
