import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,newId,utc} from '../src/db.mjs';
import {TransferQueue} from '../src/transfer-queue.mjs';
import {germanAudioDecision,isGermanLanguage,inspectGermanSource,NOT_GERMAN} from '../src/german-language.mjs';
import {discoverDownloadSources,queueDiscoverDownload,checkGermanAvailabilityRadar} from '../src/discover-download.mjs';
import {createApp} from '../src/server.mjs';

const germanMaster='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Deutsch",LANGUAGE="de",DEFAULT=NO,URI="de.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",DEFAULT=YES,URI="en.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,AUDIO="audio"\nvideo.m3u8\n';
const englishMaster='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",DEFAULT=YES,URI="en.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,AUDIO="audio"\nvideo.m3u8\n';
const episodeUrl='https://licensed.example/One-Piece-S01E02.m3u8';
const sourceFetch=async(url)=>({url,body:Buffer.from('<html><h1>One Piece</h1><a href="'+episodeUrl+'" title="One Piece S01E02" data-season="1" data-episode="2">One Piece S01E02</a></html>')});
const languageFetch=async(url)=>({url,body:Buffer.from(germanMaster)});
const tmdb=async url=>{
 const path=new URL(url).pathname;
 let content;
 if(path==='/3/tv/319')content={id:319,name:'One Piece',first_air_date:'1999-10-20'};
 else if(path==='/3/tv/319/season/1')content={episodes:[{episode_number:1,name:'Erste Folge'},{episode_number:2,name:'Zweite Folge'}]};
 else if(path==='/3/movie/123')content={id:123,title:'Film',release_date:'2020-01-01'};
 else content={};
 return new Response(JSON.stringify(content),{status:200,headers:{'content-type':'application/json'}});
};
const opts={token:'fake',discoverFetch:tmdb,sourceFetch,languageFetch};
function seeded(){
 const db=openDatabase(':memory:');
 const now=utc(),mediaId=newId(),episodeId=newId(),siteId=newId();
 db.prepare('INSERT INTO media(id,kind,title,year,external_id,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
  .run(mediaId,'series','One Piece',1999,'tmdb:tv:319','',now,now);
 db.prepare("INSERT INTO episodes(id,media_id,season,episode,title,status,created_at,updated_at) VALUES(?,?,?,?,?,'missing',?,?)")
  .run(episodeId,mediaId,1,2,'Zweite Folge',now,now);
 db.prepare('INSERT INTO search_sites(id,url,label,adapter_id,enabled,search_template,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
  .run(siteId,'https://licensed.example/','Lizenzierte Quelle','html-episode-data',1,'https://licensed.example/search?q={query}',now,now);
 return {db,mediaId,episodeId,siteId};
}
test('v1.5.2 German speech evidence is strict and rejects unknown or non-German audio',()=>{
 assert.equal(isGermanLanguage('deu'),true);
 assert.equal(isGermanLanguage('en'),false);
 assert.equal(germanAudioDecision({streams:[{codec_type:'audio',tags:{language:'eng'}}]}).german,false);
 assert.equal(germanAudioDecision({streams:[{codec_type:'audio',tags:{language:'deu'}}]}).german,true);
 assert.equal(germanAudioDecision({streams:[{codec_type:'audio',tags:{}}]}).german,false);
 assert.equal(germanAudioDecision({streams:[{codec_type:'audio',tags:{}}],manifestLanguage:'de'}).german,true);
 assert.equal(germanAudioDecision({streams:[]}).german,false);
 assert.equal(germanAudioDecision({streams:[{codec_type:'audio',tags:{language:'en'}}],manifestLanguage:'de'}).german,false);
});
test('v1.5.2 German HLS manifest filter confirms de, rejects en and never claims MP4 language',async()=>{
 const source='https://licensed.example/One-Piece-S01E02.m3u8';
 const de=await inspectGermanSource(source,{fetcher:languageFetch});
 assert.equal(de.state,'german');
 const en=await inspectGermanSource(source,{fetcher:async url=>({url,body:Buffer.from(englishMaster)})});
 assert.equal(en.state,'not-german');
 assert.equal((await inspectGermanSource('https://licensed.example/movie.mp4')).state,'unverified');
});
test('v1.5.2 Discover searches only saved sites, exact episode, German and queues via existing worker',async()=>{
 const {db,siteId}=seeded();
 try{
  const found=await discoverDownloadSources(db,{kind:'tv',id:319,season:1,episode:2},opts);
  assert.equal(found.results.length,1,JSON.stringify(found));
  assert.equal(found.results[0].language,'german');
  assert.equal(found.results[0].siteId,siteId);
  const other=await discoverDownloadSources(db,{kind:'tv',id:319,season:1,episode:1},opts);
  assert.equal(other.results.length,0);
  const queue=new TransferQueue(db);
  await assert.rejects(queueDiscoverDownload(db,queue,{kind:'tv',id:319,season:1,episode:2,url:episodeUrl,siteId,confirm:'NO'},opts),/bestätigt/);
  await assert.rejects(queueDiscoverDownload(db,queue,{kind:'tv',id:319,season:1,episode:1,url:episodeUrl,siteId,confirm:'DOWNLOAD_GERMAN'},opts),/Episode zunächst/);
  const done=await queueDiscoverDownload(db,queue,{kind:'tv',id:319,season:1,episode:2,url:episodeUrl,siteId,confirm:'DOWNLOAD_GERMAN'},opts);
  assert.equal(done.language,'german');
  assert.equal(db.prepare('SELECT count(*) n FROM transfer_jobs').get().n,1);
  await assert.rejects(queueDiscoverDownload(db,queue,{kind:'tv',id:319,season:1,episode:2,url:episodeUrl,siteId,confirm:'DOWNLOAD_GERMAN'},opts),/already|bereits|eingeplant/);
 }finally{db.close()}
});
test('v1.5.4 German radar is opt-in; reports only explicitly confirmed German direct sources',async()=>{
 const {db}=seeded();const queue=new TransferQueue(db);
 try{
  const now=utc();
  db.prepare('INSERT INTO discover_watchlist(tmdb_id,kind,title,monitored,auto_queue_german,added_at,updated_at) VALUES(319,\'tv\',\'One Piece\',1,0,?,?)').run(now,now);
  const first=await checkGermanAvailabilityRadar(db,queue,opts);
  assert.equal(first.confirmed,1);
  assert.equal(first.queued,0);
  const second=await checkGermanAvailabilityRadar(db,queue,opts);
  assert.equal(second.confirmed,0);
  db.prepare("UPDATE discover_watchlist SET auto_queue_german=1 WHERE tmdb_id=319").run();
  const third=await checkGermanAvailabilityRadar(db,queue,opts);
  assert.equal(third.queued,1,JSON.stringify(third));
 }finally{db.close()}
});
test('v1.6.0 authenticated Discover download endpoints require CSRF and explicit source confirmation',async()=>{
 const {db}=seeded();db.close();
 const app=createApp({dbPath:':memory:',startWorker:false,staticFiles:false,tmdbToken:'fake',discoverFetch:tmdb,sourceFetch,languageFetch});
 const db2=app.db,now=utc(),mediaId=newId(),episodeId=newId(),siteId=newId();
 db2.prepare('INSERT INTO media(id,kind,title,external_id,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(mediaId,'series','One Piece','tmdb:tv:319','',now,now);
 db2.prepare("INSERT INTO episodes(id,media_id,season,episode,title,status,created_at,updated_at) VALUES(?,?,?,?,?,'missing',?,?)").run(episodeId,mediaId,1,2,'Zweite Folge',now,now);
 db2.prepare('INSERT INTO search_sites(id,url,label,adapter_id,enabled,search_template,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?)').run(siteId,'https://licensed.example/','Lizenzierte Quelle','html-episode-data','https://licensed.example/search?q={query}',now,now);
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;let cookie='',csrf='';
 const send=async(path,method='GET',body,sendCsrf=true)=>{
  const headers={'x-forgecore-request':'1',...(cookie?{cookie}:{}),...(sendCsrf&&csrf?{'x-forgecore-csrf':csrf}:{}),...(body?{'content-type':'application/json'}:{})};
  const resp=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});
  if(resp.headers.get('set-cookie'))cookie=resp.headers.get('set-cookie').split(';')[0];
  const data=await resp.json();if(data.csrf)csrf=data.csrf;
  return {status:resp.status,data};
 };
 try{
  assert.equal((await send('/api/discover/download-sources?kind=tv&id=319&season=1&episode=2')).status,401);
  assert.equal((await send('/api/setup','POST',{password:'testing german-only download password'})).status,201);
  assert.equal((await send('/api/auth/login','POST',{password:'testing german-only download password'})).status,200);
  const found=await send('/api/discover/download-sources?kind=tv&id=319&season=1&episode=2');
  assert.equal(found.status,200,JSON.stringify(found.data));
  assert.equal(found.data.results.length,1);
  const body={kind:'tv',id:319,season:1,episode:2,siteId,url:episodeUrl,confirm:'DOWNLOAD_GERMAN'};
  assert.equal((await send('/api/discover/download','POST',body,false)).status,403);
  const ok=await send('/api/discover/download','POST',body);
  assert.equal(ok.status,201,JSON.stringify(ok.data));
  assert.equal(db2.prepare('SELECT count(*) n FROM transfer_jobs').get().n,1);
 }finally{await app.close()}
});
