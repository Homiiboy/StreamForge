import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,newId,utc} from '../src/db.mjs';
import {BrowserScanSession,browserAgentStatus} from '../src/browser-scanner.mjs';
import {TransferQueue} from '../src/transfer-queue.mjs';

const page='https://licensed.example/anime/stream/one-piece/staffel-1/episode-49';
const media='https://cdn.licensed.example/episodes/one-piece-49.m3u8';
const master='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Deutsch",LANGUAGE="de",URI="de.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100000,AUDIO="a"\nvideo.m3u8\n';
const tmdb=async u=>{
 const path=new URL(u).pathname;const value=path==='/3/tv/319'?{id:319,name:'One Piece'}:
 path==='/3/tv/319/season/1'?{episodes:[{episode_number:49,name:'Episode 49'}]}:{};
 return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
};
const sourceFetch=async url=>({url,body:Buffer.from(url.includes('/search?')?
 '<html><a href="'+page+'">One Piece episode 49</a></html>':'<html><h1>One Piece</h1></html>')});
const languageFetch=async url=>({url,body:Buffer.from(master)});
const fakeAgent=async url=>({ok:true,json:async()=>url.endsWith('/health')?{ok:true,busy:false}:{
 state:'media-observed',sources:[{url:media,format:'m3u8',host:'cdn.licensed.example'}],playAttempts:1,blockedRequests:0,note:'Test'
}});
function seed(){
 const db=openDatabase(':memory:'),now=utc(),siteId=newId(),mediaId=newId(),episodeId=newId();
 db.prepare('INSERT INTO search_sites(id,url,label,adapter_id,enabled,search_template,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?)')
  .run(siteId,'https://licensed.example/','License','html-links','https://licensed.example/search?q={query}',now,now);
 db.prepare("INSERT INTO media(id,kind,title,external_id,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
  .run(mediaId,'series','One Piece','tmdb:tv:319','',now,now);
 db.prepare("INSERT INTO episodes(id,media_id,season,episode,title,status,created_at,updated_at) VALUES(?,?,?,?,?,'missing',?,?)")
  .run(episodeId,mediaId,1,49,'Episode 49',now,now);
 return{db,siteId};
}
test('v1.7.0 browser health endpoint is an isolated service and fails cleanly when absent',async()=>{
 assert.equal((await browserAgentStatus({fetcher:fakeAgent})).online,true);
 assert.equal((await browserAgentStatus({fetcher:async()=>{throw Error('offline')}})).online,false);
});
test('v1.7.0 browser requests only exact saved-site episodes with explicit consent',async()=>{
 const{db,siteId}=seed(),session=new BrowserScanSession();
 const opts={token:'fake',discoverFetch:tmdb,sourceFetch,languageFetch,agentFetch:fakeAgent};
 try{
  const params={kind:'tv',id:319,season:1,episode:49,siteId,url:page};
  await assert.rejects(session.scan(db,{...params,confirm:'NO'},opts),/ausdrücklich/);
  await assert.rejects(session.scan(db,{...params,url:'https://wrong.example/staffel-1/episode-49',confirm:'SCAN_MEDIA'},opts),/eigene/);
  await assert.rejects(session.scan(db,{...params,episode:50,confirm:'SCAN_MEDIA'},opts),/zugeordnet/);
  const scan=await session.scan(db,{...params,confirm:'SCAN_MEDIA'},opts);
  assert.equal(scan.sources.length,1,JSON.stringify(scan));
  assert.equal(scan.sources[0].language,'german');
  const queue=new TransferQueue(db);
  await assert.rejects(session.enqueue(db,queue,{scanId:scan.scanId,candidateId:'not-valid',confirm:'DOWNLOAD_GERMAN'},opts),/abgelaufen/);
  const done=await session.enqueue(db,queue,{scanId:scan.scanId,candidateId:scan.sources[0].id,confirm:'DOWNLOAD_GERMAN'},opts);
  assert.equal(done.language,'german');
  assert.equal(db.prepare('SELECT count(*) n FROM transfer_jobs').get().n,1);
  await assert.rejects(session.enqueue(db,queue,{scanId:scan.scanId,candidateId:scan.sources[0].id,confirm:'DOWNLOAD_GERMAN'},opts),/abgelaufen/);
 }finally{db.close()}
});
