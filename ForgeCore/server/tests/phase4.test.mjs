import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cacheSegments,prepareStaging,cleanupTransferStaging} from '../src/transfer-recovery.mjs';
import {openDatabase,utc} from '../src/db.mjs';
import {TransferQueue} from '../src/transfer-queue.mjs';
import {newId} from '../src/db.mjs';
test('checksum-verified segments survive a failed download and resume without refetch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-resume-'));const id=newId();
 try{
  const staging=await prepareStaging(root,id);
  let reads=[];let breakSecond=true;
  const fetcher=async url=>{reads.push(url);if(url.endsWith('b.bin')&&breakSecond)throw Error('ECONNRESET');return {body:Buffer.from(url.endsWith('a.bin')?'AAA':'BBB')}};
  const options={staging,track:'video',urls:['https://example.org/a.bin','https://example.org/b.bin'],fetcher};
  await assert.rejects(cacheSegments(options),/ECONNRESET/);
  assert.deepEqual(reads,['https://example.org/a.bin','https://example.org/b.bin']);
  breakSecond=false;reads=[];
  let recovered=0;const ok=await cacheSegments({...options,onRecover:()=>recovered++});
  assert.equal(recovered,1);assert.deepEqual(reads,['https://example.org/b.bin']);
  assert.equal((await readFile(ok.filename)).toString(),'AAABBB');
  await writeFile(join(staging,'video-00000.bin'),'CORRUPTED');
  reads=[];recovered=0;
  await cacheSegments({...options,onRecover:()=>recovered++});
  assert.equal(recovered,1);
  assert.deepEqual(reads,['https://example.org/a.bin']);
  const changed=await cacheSegments({...options,urls:['https://example.org/new.bin'],fetcher});
  assert.equal((await readFile(changed.filename)).toString(),'BBB');
 }finally{await cleanupTransferStaging(root,id);await rm(root,{recursive:true,force:true})}
});
test('resumable staging rejects traversal and non-UUID identifiers',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-badjob-'));
 try{await assert.rejects(prepareStaging(root,'../../danger'),/Unsafe/);}
 finally{await rm(root,{recursive:true,force:true})}
});
test('transient queue failures back off, retry, succeed, preserve events',async()=>{
 const db=openDatabase();
 const now=utc(),mediaId=newId(),sourceId=newId();let attempts=0;
 db.prepare('INSERT INTO media(id,kind,title,created_at,updated_at) VALUES(?,?,?,?,?)').run(mediaId,'movie','Retry Movie',now,now);
 db.prepare('INSERT INTO sources(id,media_id,url,created_at,updated_at) VALUES(?,?,?,?,?)').run(sourceId,mediaId,'https://example.org/retry.mp4',now,now);
 const queue=new TransferQueue(db,{mediaRoot:'/tmp',download:async()=>{attempts++;if(attempts===1)throw Error('ECONNRESET');return {path:'Movies/Retry Movie/Retry Movie.mp4',bytes:9000};}});
 // Library preview only reads target directories; no file is published by the injected stub.
 const job=queue.enqueue({mediaId,sourceId});
 await queue.tick();
 let state=db.prepare('SELECT state,retry_after_epoch FROM transfer_jobs WHERE id=?').get(job.id);
 assert.equal(state.state,'queued');assert.ok(state.retry_after_epoch>Date.now());
 assert.equal(await queue.tick(),false);
 db.prepare('UPDATE transfer_jobs SET retry_after_epoch=0 WHERE id=?').run(job.id);
 await queue.tick();
 assert.equal(db.prepare('SELECT state FROM transfer_jobs WHERE id=?').get(job.id).state,'complete');
 assert.equal(attempts,2);
 assert.deepEqual(db.prepare('SELECT category FROM transfer_events WHERE transfer_id=? ORDER BY id').all(job.id).map(x=>x.category),['queued','running','backoff','running','complete']);
 await queue.stop();db.close();
});
test('existing ForgeCore SQLite data migrates without deleting library',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-v3upgrade-'));const filename=join(root,'library.db');
 try{
  const db=openDatabase(filename);const mediaId=newId(),now=utc();
  db.prepare('INSERT INTO media(id,kind,title,created_at,updated_at) VALUES(?,?,?,?,?)').run(mediaId,'movie','Keep Me',now,now);
  assert.ok(db.prepare('PRAGMA user_version').get().user_version>=6);
  db.close();
  const again=openDatabase(filename);
  assert.equal(again.prepare('SELECT title FROM media WHERE id=?').get(mediaId).title,'Keep Me');
  again.close();
 }finally{await rm(root,{recursive:true,force:true})}
});
