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
 const fetcher=async()=>({ok:true,json:async()=>({Items:jellyfin,TotalRecordCount:jellyfin.length})});
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
