import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,newId,utc} from '../src/db.mjs';
import {SourceAutomation,validateAutomation} from '../src/source-automation.mjs';

function fixture(){
 const db=openDatabase(),timestamp=utc(),mediaId=newId(),sourceId=newId();
 db.prepare('INSERT INTO media(id,kind,title,created_at,updated_at) VALUES(?,?,?,?,?)').run(mediaId,'series','Slugterra',timestamp,timestamp);
 db.prepare('INSERT INTO sources(id,media_id,url,label,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(sourceId,mediaId,'https://example.org/slugterra','Slugterra Test',timestamp,timestamp);
 const data=['<a href="/Slugterra-S01E01.m3u8" title="Slugterra S01E01">Folge 1</a>','<a href="/Slugterra-S01E02.m3u8" title="Slugterra S01E02">Folge 2</a>'];
 const fetcher=async u=>({url:u,body:Buffer.from(data.join(''))});
 const transfers={jobs:[],enqueue:function(o){if(this.jobs.some(x=>x.episodeId===o.episodeId))throw Error('Already queued');this.jobs.push(o);return o}};
 const worker=new SourceAutomation(db,{transfers,fetcher,now:()=>1000000,interval:100});
 return {db,mediaId,sourceId,data,transfers,worker};
}
test('source monitoring is opt-in, auto-download separately opt-in',async()=>{
 const {db,sourceId,worker,transfers}=fixture();
 try{
  assert.equal((await worker.tick()),false);
  assert.equal(worker.get(sourceId).enabled,false);
  worker.configure(sourceId,{enabled:true,autoQueue:false,intervalMinutes:30});
  assert.equal(await worker.tick(),true);
  assert.equal(db.prepare('SELECT COUNT(*) as n FROM episodes').get().n,2);
  assert.equal(transfers.jobs.length,0);
  assert.equal(worker.get(sourceId).lastDiscovered,2);
  assert.equal((await worker.check(sourceId,{manual:true})).newEpisodes,0);
  assert.equal(db.prepare('SELECT COUNT(*) as n FROM source_items').get().n,2);
  assert.equal(db.prepare('SELECT COUNT(*) as n FROM episodes').get().n,2);
  assert.equal(worker.history(sourceId).length,2);
 }finally{await worker.stop();db.close()}
});
test('auto-queue adds missing episodes once, respects cap and ignored episodes',async()=>{
 const {db,sourceId,mediaId,worker,transfers,data}=fixture();
 try{
  worker.configure(sourceId,{enabled:true,autoQueue:true,maxPerCheck:1,intervalMinutes:30});
  let res=await worker.check(sourceId,{manual:true});
  assert.equal(res.queued,1);assert.equal(transfers.jobs.length,1);
  res=await worker.check(sourceId,{manual:true});
  assert.equal(res.queued,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM episodes').get().n,2);
  res=await worker.check(sourceId,{manual:true});assert.equal(res.queued,0);
  // The first fake job is considered already queued, leaving the other episode eligible.
  assert.ok(worker.history(sourceId).some(x=>x.queued===1));
  const another=db.prepare('SELECT id FROM episodes WHERE season=1 AND episode=2').get().id;
  db.prepare("UPDATE episodes SET status='ignored' WHERE id=?").run(another);
  res=await worker.check(sourceId,{manual:true});assert.equal(res.queued,0);
  assert.equal(worker.get(sourceId).failures,0);
 }finally{db.close()}
});
test('failures preserve previous episodes and stagger the next attempt',async()=>{
 const {db,sourceId,worker,data}=fixture();
 try{
  worker.configure(sourceId,{enabled:true,autoQueue:false,intervalMinutes:30});
  await worker.check(sourceId,{manual:true});
  data.length=0;
  await assert.rejects(worker.check(sourceId,{manual:true}),/No usable links/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM source_items').get().n,2);
  assert.equal(worker.get(sourceId).failures,1);
  assert.ok(worker.get(sourceId).nextCheckEpoch>1000000);
  assert.equal(worker.history(sourceId)[0].status,'failed');
 }finally{db.close()}
});
test('validate policies deny overly fast polling and unsafe auto queue settings',()=>{
 assert.throws(()=>validateAutomation({enabled:true,intervalMinutes:1}),/30/);
 assert.throws(()=>validateAutomation({enabled:true,maxPerCheck:999}),/1–50/);
 assert.throws(()=>validateAutomation({autoQueue:true,autoAddEpisodes:false}),/required/);
});
