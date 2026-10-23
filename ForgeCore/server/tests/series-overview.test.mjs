import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {buildSeriesOverview,importJellyfinSeries} from '../src/series-overview.mjs';
const jellyfin=[
 {Type:'Episode',SeriesName:'Slugterra',ParentIndexNumber:1,IndexNumber:1,Name:'Start'},
 {Type:'Episode',SeriesName:'Slugterra',ParentIndexNumber:1,IndexNumber:2,Name:'Next'},
 {Type:'Episode',SeriesName:'Other',ParentIndexNumber:1,IndexNumber:3,Name:'Other'}
];
test('overview unifies source, Jellyfin and tracked episodes without inventing gaps',()=>{
 const db=openDatabase(':memory:');
 try{
  const overview=buildSeriesOverview(db,'Slugterra',[{season:1,episode:2,title:'Source 2'},{season:2,episode:7,title:'Source 7'}],jellyfin);
  assert.deepEqual(overview.seasons,[1,2]);
  assert.deepEqual(overview.summary,{total:3,inJellyfin:2,onSource:2,onBoth:1,sourceOnly:1,jellyfinOnly:1,tracked:0});
  assert.equal(overview.episodes.find(x=>x.episode===7).jellyfin,false);
  assert.equal(overview.complete,false);
 }finally{db.close()}
});
test('confirmed import is idempotent and preserves manually changed statuses',async()=>{
 const db=openDatabase(':memory:');
 const fetcher=async url=>({ok:true,json:async()=>url.includes('IncludeItemTypes=Series')?{Items:[{Type:'Series',Name:'Slugterra',Id:'abcdef1234567890'}],TotalRecordCount:1}:{Items:jellyfin.filter(x=>x.SeriesName==='Slugterra').map(x=>({...x,SeriesId:'abcdef1234567890'})),TotalRecordCount:2}});
 db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run('jellyfin_url','http://127.0.0.1:8097');
 db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run('jellyfin_api_key','test-token-123456');
 try{
  await assert.rejects(importJellyfinSeries(db,{title:'Slugterra',confirm:'NO'},{fetcher}),/Bestätigung/);
  assert.equal(db.prepare('SELECT count(*) AS total FROM media').get().total,0);
  const first=await importJellyfinSeries(db,{title:'Slugterra',confirm:'IMPORT_JELLYFIN_SERIES'},{fetcher});
  assert.equal(first.created,true);assert.equal(first.added,2);
  const row=db.prepare('SELECT id FROM episodes WHERE media_id=? AND season=1 AND episode=1').get(first.mediaId);
  db.prepare("UPDATE episodes SET status='ignored' WHERE id=?").run(row.id);
  const second=await importJellyfinSeries(db,{title:'Slugterra',confirm:'IMPORT_JELLYFIN_SERIES'},{fetcher});
  assert.equal(second.created,false);assert.equal(second.added,0);
  assert.equal(db.prepare('SELECT status FROM episodes WHERE id=?').get(row.id).status,'ignored');
  assert.equal(db.prepare('SELECT count(*) AS total FROM media').get().total,1);
 }finally{db.close()}
});

test('different series specials are excluded and specials default to hidden',()=>{
 const db=openDatabase(':memory:');
 try{
  const content=[{Type:'Episode',SeriesName:'Slugterra',SeriesId:'abcdef1234567890',ParentIndexNumber:1,IndexNumber:1,Name:'A'},{Type:'Episode',SeriesName:'Slugterra',SeriesId:'abcdef1234567890',ParentIndexNumber:0,IndexNumber:1,Name:'Special'}];
  const result=buildSeriesOverview(db,'Slugterra',[],content);
  assert.equal(result.summary.inJellyfin,1);
  assert.ok(!result.seasons.includes(0));
  assert.equal(buildSeriesOverview(db,'Slugterra',[],content,{includeSpecials:true}).summary.inJellyfin,2);
 }finally{db.close()}
});
test('series scoped Jellyfin read rejects ambiguous series and unrelated series IDs',async()=>{
 const {jellyfinSeriesInventory}=await import('../src/jellyfin-sync.mjs');
 const db=openDatabase(':memory:');
 db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run('jellyfin_url','http://127.0.0.1:8097');
 db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run('jellyfin_api_key','test-token-123456');
 try{
  const fetcher=async url=>({ok:true,json:async()=>url.includes('IncludeItemTypes=Series')?{Items:[{Id:'abcdef1234567890',Type:'Series',Name:'Slugterra'}],TotalRecordCount:1}:{Items:[{Type:'Episode',SeriesId:'deadbeef99999999',ParentIndexNumber:0,IndexNumber:1},{Type:'Episode',SeriesId:'abcdef1234567890',ParentIndexNumber:3,IndexNumber:1}],TotalRecordCount:2}});
  const result=await jellyfinSeriesInventory(db,'Slugterra',{fetcher});
  assert.equal(result.items.length,1);
  assert.equal(result.specials,0);
 }finally{db.close()}
});

test('comparison fallback tolerates rejected ParentId queries but filters by SeriesId',async()=>{
 const {jellyfinSeriesInventory}=await import('../src/jellyfin-sync.mjs');
 const db=openDatabase(':memory:');
 db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run('jellyfin_url','http://127.0.0.1:8097');
 db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run('jellyfin_api_key','test-token-123456');
 const requested=[];
 const fetcher=async url=>{
  requested.push(url);
  if(url.includes('IncludeItemTypes=Series'))return {ok:true,json:async()=>({Items:[{Type:'Series',Name:'Slugterra',Id:'abcdef1234567890'}],TotalRecordCount:1})};
  if(url.includes('ParentId='))return {ok:false,status:400};
  return {ok:true,json:async()=>({Items:[{Type:'Episode',SeriesId:'deadbeef12345678',ParentIndexNumber:0,IndexNumber:1},{Type:'Episode',SeriesId:'abcdef1234567890',ParentIndexNumber:3,IndexNumber:1}],TotalRecordCount:2})};
 };
 try{
  const result=await jellyfinSeriesInventory(db,'Slugterra',{fetcher});
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].ParentIndexNumber,3);
  assert.ok(requested.some(x=>x.includes('ParentId=')));
  assert.ok(requested.some(x=>x.includes('IncludeItemTypes=Episode')&&!x.includes('ParentId=')));
 }finally{db.close()}
});
test('comparison fallback tolerates empty scoped response',async()=>{
 const {jellyfinSeriesInventory}=await import('../src/jellyfin-sync.mjs');
 const db=openDatabase(':memory:');
 db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run('jellyfin_url','http://127.0.0.1:8097');
 db.prepare('INSERT INTO config(key,value) VALUES(?,?)').run('jellyfin_api_key','test-token-123456');
 const fetcher=async url=>({ok:true,json:async()=>url.includes('IncludeItemTypes=Series')
  ?{Items:[{Type:'Series',Name:'Slugterra',Id:'abcdef1234567890'}],TotalRecordCount:1}
  :url.includes('ParentId=')?{Items:[],TotalRecordCount:0}
  :{Items:[{Type:'Episode',SeriesId:'abcdef1234567890',ParentIndexNumber:3,IndexNumber:1}],TotalRecordCount:1}});
 try{
  const result=await jellyfinSeriesInventory(db,'Slugterra',{fetcher});
  assert.equal(result.items.length,1);
 }finally{db.close()}
});
