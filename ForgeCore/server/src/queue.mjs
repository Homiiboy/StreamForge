import {newId,utc,one,rows} from './db.mjs';
import {previewLibrary} from './library.mjs';

export class JobQueue {
 constructor(db,{mediaRoot='',interval=1500}={}){this.db=db;this.root=mediaRoot;this.interval=interval;this.busy=false;this.timer=null;}
 enqueue(type,payload={}){
  if(!['library_scan','metadata_check'].includes(type))throw Object.assign(Error('Unknown job type'),{status:400});
  const id=newId(),now=utc();
  this.db.prepare('INSERT INTO jobs(id,type,state,payload,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,type,'queued',JSON.stringify(payload),now,now);
  return one(this.db,'SELECT * FROM jobs WHERE id=?',id);
 }
 start(){if(this.timer)return;this.timer=setInterval(()=>this.tick().catch(()=>{}),this.interval);this.timer.unref?.();}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
 cancel(id){const r=this.db.prepare("UPDATE jobs SET state='cancelled',updated_at=? WHERE id=? AND state='queued'").run(utc(),id);return r.changes>0;}
 retry(id){const r=this.db.prepare("UPDATE jobs SET state='queued',error=NULL,updated_at=? WHERE id=? AND state IN ('failed','cancelled')").run(utc(),id);return r.changes>0;}
 async tick(){
  if(this.busy)return false;
  const job=one(this.db,"SELECT * FROM jobs WHERE state='queued' ORDER BY created_at,id LIMIT 1");
  if(!job)return false;
  this.busy=true;
  try{
   this.db.prepare("UPDATE jobs SET state='running',attempts=attempts+1,updated_at=? WHERE id=? AND state='queued'").run(utc(),job.id);
   const payload=JSON.parse(job.payload||'{}');let result;
   if(job.type==='library_scan'){
    if(!this.root)throw Error('Media root is not configured');
    let checked=0,available=0;
    const media=rows(this.db,'SELECT * FROM media ORDER BY created_at');
    for(const item of media){
     const eps=item.kind==='series'?rows(this.db,'SELECT * FROM episodes WHERE media_id=? ORDER BY season,episode',item.id):[null];
     for(const ep of eps){
      const scan=await previewLibrary(this.root,item,ep);
      checked++;
      if(scan.exists)available++;
      if(ep&&ep.status!=='ignored')this.db.prepare("UPDATE episodes SET status=?,updated_at=? WHERE id=?").run(scan.exists?'available':'missing',utc(),ep.id);
     }
    }
    result={checked,available,missing:checked-available};
   }else if(job.type==='metadata_check'){
    const item=one(this.db,'SELECT * FROM media WHERE id=?',payload.mediaId||'');
    if(!item)throw Error('Media project not found');
    // Offline-only validation in Phase 1, never a remote metadata request.
    result={id:item.id,title:item.title,kind:item.kind,year:item.year,valid:!!item.title};
   }
   this.db.prepare("UPDATE jobs SET state='complete',result=?,updated_at=? WHERE id=?").run(JSON.stringify(result),utc(),job.id);
  }catch(error){this.db.prepare("UPDATE jobs SET state='failed',error=?,updated_at=? WHERE id=?").run(String(error?.message||error).slice(0,500),utc(),job.id);}
  finally{this.busy=false;}
  return true;
 }
}
