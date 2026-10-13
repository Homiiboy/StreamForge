import {newId,utc,one,rows,transaction} from './db.mjs';
import {analyzeSource} from './source-adapters.mjs';
import {addNotification} from './phase3.mjs';

const reject=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const defaults={enabled:false,autoQueue:false,autoAddEpisodes:true,intervalMinutes:360,maxPerCheck:10};
export function validateAutomation(value){
 if(!value||typeof value!=='object'||Array.isArray(value))reject('Invalid automation configuration');
 const intervalMinutes=Number(value.intervalMinutes??360),maxPerCheck=Number(value.maxPerCheck??10);
 if(!Number.isInteger(intervalMinutes)||intervalMinutes<30||intervalMinutes>10080)reject('Interval must be 30–10080 minutes');
 if(!Number.isInteger(maxPerCheck)||maxPerCheck<1||maxPerCheck>50)reject('Maximum transfers per check must be 1–50');
 const enabled=value.enabled===true,autoQueue=value.autoQueue===true,autoAddEpisodes=value.autoAddEpisodes!==false;
 if(autoQueue&&!autoAddEpisodes)reject('Episode import required for automatic downloads');
 return {enabled,autoQueue,autoAddEpisodes,intervalMinutes,maxPerCheck};
}
export class SourceAutomation{
 constructor(db,{transfers,fetcher,interval=60000,now=()=>Date.now()}={}){this.db=db;this.transfers=transfers;this.fetcher=fetcher;this.interval=interval;this.now=now;this.timer=null;this.busy=false;this.active=new Set();this.inFlight=null;}
 get(id){
  const source=one(this.db,'SELECT * FROM sources WHERE id=?',id);
  if(!source)reject('Source not found',404);
  const v=one(this.db,'SELECT * FROM source_automation WHERE source_id=?',id);
  return {source,...defaults,...(v?{enabled:!!v.enabled,autoQueue:!!v.auto_queue,autoAddEpisodes:!!v.auto_add_episodes,intervalMinutes:v.interval_minutes,maxPerCheck:v.max_per_check}:{}),nextCheckEpoch:v?.next_check_epoch||0,lastCheckEpoch:v?.last_check_epoch||null,lastError:v?.last_error||null,lastDiscovered:v?.last_discovered||0,failures:v?.failures||0};
 }
 configure(id,value){
  const src=one(this.db,'SELECT s.id,m.kind FROM sources s JOIN media m ON m.id=s.media_id WHERE s.id=?',id);
  if(!src)reject('Source not found',404);
  if(src.kind!=='series')reject('Only series support automatic source checks');
  const p=validateAutomation(value);
  this.db.prepare('INSERT INTO source_automation(source_id,enabled,auto_queue,auto_add_episodes,interval_minutes,max_per_check,next_check_epoch,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET enabled=excluded.enabled,auto_queue=excluded.auto_queue,auto_add_episodes=excluded.auto_add_episodes,interval_minutes=excluded.interval_minutes,max_per_check=excluded.max_per_check,next_check_epoch=excluded.next_check_epoch,failures=0,last_error=NULL,updated_at=excluded.updated_at').run(id,+p.enabled,+p.autoQueue,+p.autoAddEpisodes,p.intervalMinutes,p.maxPerCheck,p.enabled?this.now():0,utc());
  return this.get(id);
 }
 history(id){this.get(id);return rows(this.db,'SELECT * FROM source_check_events WHERE source_id=? ORDER BY id DESC LIMIT 60',id)}
 list(){return rows(this.db,'SELECT a.*,s.label,m.title AS media_title FROM source_automation a JOIN sources s ON s.id=a.source_id JOIN media m ON m.id=s.media_id ORDER BY a.enabled DESC,a.next_check_epoch LIMIT 250');}
 start(){if(this.timer)return;this.timer=setInterval(()=>{this.inFlight=this.tick().catch(e=>process.stderr.write('Source automation: '+e.message+'\n'))},this.interval);this.timer.unref?.()}
 async stop(){if(this.timer)clearInterval(this.timer);this.timer=null;if(this.inFlight)await this.inFlight}
 async tick(){
  if(this.busy)return false;this.busy=true;
  try{
   const due=one(this.db,"SELECT a.source_id FROM source_automation a JOIN sources s ON s.id=a.source_id JOIN media m ON m.id=s.media_id WHERE a.enabled=1 AND s.enabled=1 AND m.kind='series' AND a.next_check_epoch<=? ORDER BY a.next_check_epoch LIMIT 1",this.now());
   if(!due)return false;await this.check(due.source_id);return true;
  }finally{this.busy=false}
 }
 async check(id,{manual=false}={}){
  if(this.active.has(id))reject('Source check already running',409);
  const p=this.get(id),source=p.source;
  if(!source.enabled)reject('Source disabled',409);
  if(!manual&&!p.enabled)return {status:'disabled'};
  if(!manual&&p.nextCheckEpoch>this.now())return {status:'not_due'};
  this.active.add(id);
  const now=this.now(),state=one(this.db,'SELECT * FROM source_automation WHERE source_id=?',id);
  if(state&&p.enabled)this.db.prepare('UPDATE source_automation SET next_check_epoch=?,updated_at=? WHERE source_id=?').run(now+p.intervalMinutes*60000,utc(),id);
  try{
   const result=await analyzeSource(source.url,this.fetcher?{fetcher:this.fetcher}:{});
   if(result.adapter!=='html-links')throw Error('Automatic episode discovery requires HTML links');
   if(!Array.isArray(result.items)||result.items.length>500||!result.items.length)throw Error('No usable links; previous discoveries preserved');
   let created=0,queued=0,skipped=0,discovered=0;
   const eligible=[],seen=new Set();
   transaction(this.db,()=>{
    const itemWrite=this.db.prepare('INSERT INTO source_items(id,source_id,url,title,season,episode,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(source_id,url) DO UPDATE SET title=excluded.title,season=excluded.season,episode=excluded.episode');
    const epWrite=this.db.prepare('INSERT OR IGNORE INTO episodes(id,media_id,season,episode,title,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
    const epGet=this.db.prepare('SELECT id,status FROM episodes WHERE media_id=? AND season=? AND episode=?');
    const itemGet=this.db.prepare('SELECT id FROM source_items WHERE source_id=? AND url=?');
    for(const x of result.items){
     const season=x.season,episode=x.episode;
     if(!Number.isInteger(season)||!Number.isInteger(episode)||season<0||season>999||episode<0||episode>9999)continue;
     const key=season+':'+episode;if(seen.has(key))continue;seen.add(key);discovered++;
     itemWrite.run(newId(),id,x.url,String(x.title||'').slice(0,140),season,episode,utc());
     if(p.autoAddEpisodes)created+=epWrite.run(newId(),source.media_id,season,episode,String(x.title||'').slice(0,140),utc(),utc()).changes;
     const ep=epGet.get(source.media_id,season,episode);
     if(ep?.status==='missing')eligible.push({episodeId:ep.id,itemId:itemGet.get(id,x.url).id});
    }
    this.db.prepare('INSERT INTO source_check_events(source_id,checked_at,status,discovered,new_episodes,queued,message) VALUES(?,?,?,?,?,?,?)').run(id,utc(),'success',discovered,created,0,'Read '+result.items.length+' links');
    if(state)this.db.prepare('UPDATE source_automation SET last_check_epoch=?,last_error=NULL,failures=0,last_discovered=?,updated_at=? WHERE source_id=?').run(now,discovered,utc(),id);
   });
   if(p.autoQueue)for(const x of eligible.slice(0,p.maxPerCheck)){
    try{this.transfers.enqueue({mediaId:source.media_id,episodeId:x.episodeId,sourceId:id,itemId:x.itemId});queued++}catch{skipped++}
   }
   this.db.prepare('UPDATE source_check_events SET queued=? WHERE id=(SELECT MAX(id) FROM source_check_events WHERE source_id=?)').run(queued,id);
   if(created||queued)addNotification(this.db,{category:'automation',message:(source.label||'Quelle')+': '+created+' neue Episoden und '+queued+' Downloads',refId:id});
   return {status:'success',discovered,newEpisodes:created,queued,skipped};
  }catch(error){
   const message=String(error.message||error).slice(0,400),failures=(state?.failures||0)+1;
   const delay=Math.min(p.intervalMinutes*60000,2**Math.min(failures,6)*60000);
   if(state)this.db.prepare('UPDATE source_automation SET last_check_epoch=?,last_error=?,failures=?,next_check_epoch=?,updated_at=? WHERE source_id=?').run(now,message,failures,now+delay,utc(),id);
   this.db.prepare('INSERT INTO source_check_events(source_id,checked_at,status,message) VALUES(?,?,?,?)').run(id,utc(),'failed',message);
   if(failures===1||failures%5===0)addNotification(this.db,{category:'automation-error',message:'Quellenfehler: '+message,refId:id});
   if(manual)reject(message,422);
   return {status:'failed',error:message};
  }finally{this.active.delete(id)}
 }
}
