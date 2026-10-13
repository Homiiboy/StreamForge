import {one,rows,utc,newId} from './db.mjs';

export const defaults=Object.freeze({enabled:false,startHour:0,endHour:24,days:[0,1,2,3,4,5,6],maxRetries:3,bandwidthKbps:0});
export function validateSchedule(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(Error('Invalid schedule'),{status:400});
 const enabled=value.enabled===true;
 const startHour=Number(value.startHour??0),endHour=Number(value.endHour??24);
 const days=value.days??[0,1,2,3,4,5,6];
 const maxRetries=Number(value.maxRetries??3);
 const bandwidthKbps=Number(value.bandwidthKbps??0);
 if(!Number.isInteger(startHour)||startHour<0||startHour>23||!Number.isInteger(endHour)||endHour<1||endHour>24||startHour>=endHour||!Array.isArray(days)||days.length<1||days.length>7||!days.every(x=>Number.isInteger(x)&&x>=0&&x<=6)||new Set(days).size!==days.length||!Number.isInteger(maxRetries)||maxRetries<0||maxRetries>10||!Number.isInteger(bandwidthKbps)||bandwidthKbps<0||bandwidthKbps>51200)throw Object.assign(Error('Invalid schedule hours, days or retry count'),{status:400});
 return {enabled,startHour,endHour,days:[...days].sort(),maxRetries,bandwidthKbps};
}
export function loadSchedule(db){
 const raw=one(db,"SELECT value FROM config WHERE key='transfer_schedule'")?.value;
 if(!raw)return {...defaults};
 try{return validateSchedule(JSON.parse(raw))}catch{return {...defaults}};
}
export function setSchedule(db,input){
 const value=validateSchedule(input);
 db.prepare("INSERT INTO config(key,value) VALUES('transfer_schedule',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));
 return value;
}
export function scheduleAllows(schedule,now=new Date()){
 if(!schedule.enabled)return true;
 // System time is local to the server container. Explicit TZ is configured by the operator.
 return schedule.days.includes(now.getDay())&&now.getHours()>=schedule.startHour&&now.getHours()<schedule.endHour;
}
export function scoreSource(source,items=[],media={}){
 const count=items.length;
 const numbered=items.filter(item=>Number.isInteger(item.season)&&Number.isInteger(item.episode)).length;
 const suffix=/\.(m3u8|mpd|mp4|m4v)(?:[?#]|$)/i.exec(source.url||'')?.[1]?.toLowerCase();
 const format=suffix==='m3u8'?'HLS':suffix==='mpd'?'DASH':suffix?'MP4':'HTML';
 // Quality is deliberately NOT fabricated: score represents structural suitability only.
 const score=(source.enabled?20:0)+(format==='HLS'?18:format==='MP4'?16:format==='DASH'?12:0)+Math.min(25,numbered*3)+Math.min(10,count);
 return {id:source.id,label:source.label,url:source.url,format,score,discovered:count,numbered,enabled:!!source.enabled,recommendation:source.enabled?'candidate':'disabled',mediaId:media.id||null};
}
export function sourceRanking(db,mediaId){
 const sources=rows(db,'SELECT * FROM sources WHERE media_id=?',mediaId);
 return sources.map(s=>scoreSource(s,rows(db,'SELECT season,episode FROM source_items WHERE source_id=?',s.id),{id:mediaId})).sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label));
}
export function missingEpisodePlan(db,mediaId,sourceId){
 const project=one(db,'SELECT id,kind FROM media WHERE id=?',mediaId);
 if(!project||project.kind!=='series')throw Object.assign(Error('A series is required'),{status:400});
 const source=one(db,'SELECT * FROM sources WHERE id=? AND media_id=? AND enabled=1',sourceId,mediaId);
 if(!source)throw Object.assign(Error('Active source not found'),{status:404});
 const known=rows(db,'SELECT id,season,episode,status FROM episodes WHERE media_id=?',mediaId);
 const byEpisode=new Map(known.map(x=>[x.season+':'+x.episode,x]));
 const items=rows(db,'SELECT id,season,episode,title,url FROM source_items WHERE source_id=? ORDER BY season,episode LIMIT 500',sourceId);
 const seen=new Set();const plan=[];
 for(const item of items){
  if(item.season===null||item.episode===null)continue;
  const key=item.season+':'+item.episode;
  if(seen.has(key))continue;
  seen.add(key);
  const ep=byEpisode.get(key);
  const reason=!ep?'not_in_library':ep.status==='ignored'?'ignored':ep.status==='available'?'available':'missing';
  const active=ep?one(db,"SELECT id FROM transfer_jobs WHERE episode_id=? AND state IN ('queued','running')",ep.id):null;
  plan.push({itemId:item.id,episodeId:ep?.id||null,season:item.season,episode:item.episode,title:item.title,reason:active?'already_queued':reason,canQueue:!!ep&&reason==='missing'&&!active});
 }
 return {mediaId,sourceId,total:plan.length,missing:plan.filter(x=>x.canQueue).length,items:plan};
}
export function addNotification(db,{category='info',message,refId=null}){
 const text=String(message||'').trim().slice(0,500);
 if(!text)throw Error('Notification message empty');
 const id=newId();db.prepare('INSERT INTO notifications(id,category,message,ref_id,created_at) VALUES(?,?,?,?,?)').run(id,category,text,refId,utc());
 db.prepare('DELETE FROM notifications WHERE id IN (SELECT id FROM notifications ORDER BY created_at DESC LIMIT -1 OFFSET 500)').run();
 return id;
}
export function listNotifications(db){return rows(db,'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100');}
export function markNotificationRead(db,id){return db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND read_at IS NULL').run(utc(),id).changes>0;}
export function diagnostics(db){
 const state=rows(db,'SELECT state,COUNT(*) AS count FROM transfer_jobs GROUP BY state');
 return {transferCounts:Object.fromEntries(state.map(x=>[x.state,x.count])),mediaCount:one(db,'SELECT COUNT(*) AS n FROM media').n,sourceCount:one(db,'SELECT COUNT(*) AS n FROM sources').n,unreadNotifications:one(db,'SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL').n,version:one(db,'PRAGMA user_version')?.user_version};
}
