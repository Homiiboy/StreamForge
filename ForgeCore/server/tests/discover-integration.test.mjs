import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {discoverMetadata,discoverSeason} from '../src/discover-metadata.mjs';
import {discoverJellyfinPreview,discoverEpisodePlan,applyDiscoverEpisodePlan,discoverWatchlist,watchlistSave,watchlistMonitor,watchlistRemove,checkDiscoverRadar} from '../src/discover-state.mjs';

const tmdb=async(url)=>{
 const path=new URL(url).pathname;
 let result;
 if(path==='/3/tv/319')result={id:319,name:'One Piece',first_air_date:'1999-10-20',seasons:[
  {season_number:0,name:'Specials',episode_count:1},{season_number:1,name:'Staffel 1',episode_count:3}
 ],next_episode_to_air:{season_number:1,episode_number:3,air_date:'2099-01-01',name:'Future'}};
 else if(path==='/3/movie/123')result={id:123,title:'Ein Film',release_date:'2099-01-01'};
 else if(path==='/3/tv/319/watch/providers')result={results:{AT:{flatrate:[{provider_id:8,provider_name:'Netflix'}],rent:[{provider_id:9,provider_name:'Apple TV'}]}}};
 else if(path==='/3/movie/123/watch/providers')result={results:{}};
 else if(path==='/3/tv/319/external_ids')result={imdb_id:'tt1234567'};
 else if(path==='/3/tv/319/season/1')result={episodes:[
  {episode_number:1,name:'Erste Folge'}, {episode_number:2,name:'Zweite Folge'}, {episode_number:3,name:'Dritte Folge'}
 ]};
 else if(path==='/3/tv/319/season/0')result={episodes:[{episode_number:1,name:'Special'}]};
 else return new Response('{}',{status:404});
 return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
};
const tvmaze=async url=>{
 const path=new URL(url).pathname;
 const result=path==='/lookup/shows'?{id:99}:{
  _embedded:{nextepisode:{season:1,number:3,airdate:'2099-01-01',name:'Dritte Folge'}}};
 return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
};
const jf=async url=>{
 const u=new URL(url),path=u.pathname+u.search;
 let items;
 if(path.includes('IncludeItemTypes=Series'))items=[{Type:'Series',Name:'One Piece',Id:'abcd1234'}];
 else if(path.includes('IncludeItemTypes=Episode'))items=[
  {Type:'Episode',SeriesId:'abcd1234',SeriesName:'One Piece',ParentIndexNumber:1,IndexNumber:1,Name:'Erste Folge'}
 ];
 else items=[];
 return new Response(JSON.stringify({Items:items,TotalRecordCount:items.length}),{status:200});
};
function configuredDb(){
 const db=openDatabase(':memory:');
 db.prepare("INSERT INTO config(key,value) VALUES('jellyfin_url','http://jellyfin.test')").run();
 db.prepare("INSERT INTO config(key,value) VALUES('jellyfin_api_key','fake_key_long_enough')").run();
 return db;
}
test('v1.4.1 TMDB detail, Austrian provider filtering, unambiguous TVmaze lookup',async()=>{
 const d=await discoverMetadata({token:'fake-token',kind:'tv',id:319,fetcher:tmdb,tvmazeFetch:tvmaze});
 assert.equal(d.title,'One Piece');
 assert.equal(d.providers.region,'AT');
 assert.equal(d.providers.items.length,2);
 assert.equal(d.nextEpisode.episode,3);
 assert.equal(d.tvmaze.matched,true);
 assert.deepEqual(d.seasons.map(s=>s.season),[0,1]);
 const s=await discoverSeason({token:'fake-token',id:319,season:1,fetcher:tmdb});
 assert.equal(s.episodes.length,3);
 await assert.rejects(()=>discoverSeason({token:'fake-token',id:319,season:-1,fetcher:tmdb}),/Ungültige Staffel/);
});
test('v1.4.2 Jellyfin sees only episodes belonging to exact SeriesId',async()=>{
 const db=configuredDb();
 try{
  const result=await discoverJellyfinPreview(db,{kind:'tv',id:319},{token:'fake-token',fetcher:tmdb,jellyfinFetch:jf});
  assert.equal(result.state,'matched');
  assert.deepEqual(result.present.map(x=>x.episode),[1]);
 }finally{db.close()}
});
test('v1.4.3 watchlist persists, monitoring opt-in and no repeated notifications',async()=>{
 const db=openDatabase(':memory:');
 try{
  const saved=await watchlistSave(db,{kind:'tv',id:319},{token:'fake-token',fetcher:tmdb});
  assert.equal(saved.item.monitored,0);
  assert.equal(discoverWatchlist(db).length,1);
  watchlistMonitor(db,{kind:'tv',id:319,monitored:true});
  assert.equal(discoverWatchlist(db)[0].monitored,true);
  const check=await checkDiscoverRadar(db,{token:'fake-token',fetcher:tmdb,tvmazeFetch:tvmaze});
  assert.equal(check.checked,1);
  assert.equal(check.notified,0); // Future date outside 30 days.
  assert.equal(watchlistRemove(db,{kind:'tv',id:319}).removed,true);
  assert.equal(discoverWatchlist(db).length,0);
 }finally{db.close()}
});
test('v1.4.4 episode planning never queues streams and honors Jellyfin and existing statuses',async()=>{
 const db=configuredDb();
 try{
  const plan=await discoverEpisodePlan(db,{id:319,season:1},{token:'fake-token',fetcher:tmdb,jellyfinFetch:jf});
  assert.equal(plan.episodes.find(x=>x.episode===1).state,'in-jellyfin');
  assert.equal(plan.episodes.find(x=>x.episode===2).selectable,true);
  await assert.rejects(()=>applyDiscoverEpisodePlan(db,{id:319,season:1,episodes:[2],confirm:'WRONG'},{token:'fake-token',fetcher:tmdb,jellyfinFetch:jf}),/Bestätigung/);
  const applied=await applyDiscoverEpisodePlan(db,{id:319,season:1,episodes:[1,2],confirm:'ADD_MISSING'},{token:'fake-token',fetcher:tmdb,jellyfinFetch:jf});
  assert.equal(applied.added,1);
  assert.equal(applied.skipped[0].reason,'in-jellyfin');
  assert.equal(db.prepare('SELECT count(*) AS n FROM transfer_jobs').get().n,0);
  const again=await applyDiscoverEpisodePlan(db,{id:319,season:1,episodes:[2],confirm:'ADD_MISSING'},{token:'fake-token',fetcher:tmdb,jellyfinFetch:jf});
  assert.equal(again.added,0);
  assert.equal(db.prepare('SELECT status FROM episodes').get().status,'missing');
  await assert.rejects(()=>applyDiscoverEpisodePlan(db,{id:319,season:1,episodes:[44],confirm:'ADD_MISSING'},{token:'fake-token',fetcher:tmdb,jellyfinFetch:jf}),/nicht in TMDB/);
 }finally{db.close()}
});


test('v1.4.1-v1.4.4 authenticated API, CSRF, backup and non-destructive planning',async()=>{
 const {createApp}=await import('../src/server.mjs');
 const app=createApp({dbPath:':memory:',startWorker:false,staticFiles:false,tmdbToken:'fake-token',discoverFetch:tmdb,tvmazeFetch:tvmaze});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 let cookie='',csrf='';
 const send=async(path,method='GET',body,csrfEnabled=true)=>{
  const headers={'x-forgecore-request':'1'};
  if(body!==undefined)headers['content-type']='application/json';
  if(cookie)headers.cookie=cookie;
  if(csrfEnabled&&csrf)headers['x-forgecore-csrf']=csrf;
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
  const data=await r.json();if(data.csrf)csrf=data.csrf;
  return {status:r.status,data};
 };
 try{
  assert.equal((await send('/api/discover/watchlist')).status,401);
  assert.equal((await send('/api/setup','POST',{password:'strong password for discover api'})).status,201);
  assert.equal((await send('/api/auth/login','POST',{password:'strong password for discover api'})).status,200);
  assert.equal((await send('/api/discover/detail?kind=tv&id=319')).data.tvmaze.matched,true);
  assert.equal((await send('/api/discover/season?id=319&season=0')).data.episodes.length,1);
  assert.equal((await send('/api/discover/watchlist','POST',{kind:'tv',id:319},false)).status,403);
  assert.equal((await send('/api/discover/watchlist','POST',{kind:'tv',id:319,monitored:true})).status,201);
  assert.equal((await send('/api/discover/watchlist')).data.items[0].monitored,true);
  const overview=await send('/api/discover/plan?id=319&season=1');
  assert.equal(overview.data.episodes.length,3);
  assert.equal((await send('/api/discover/plan/apply','POST',{id:319,season:1,episodes:[2],confirm:'ADD_MISSING'})).data.added,1);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM transfer_jobs').get().n,0);
  const exportResult=await send('/api/backup/export');
  assert.equal(exportResult.data.discover_watchlist.length,1);
  assert.equal((await send('/api/backup/import','POST',{...exportResult.data,confirm:'REPLACE'})).status,200);
  assert.equal((await send('/api/discover/watchlist')).data.items[0].monitored,false);
  assert.equal((await send('/api/discover/watchlist','DELETE',{kind:'tv',id:319})).data.removed,true);
 }finally{await app.close()}
});
