import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {discoverPlayers,inspectPlayerPage} from '../src/player-bridge.mjs';
test('PlayerBridge distinguishes direct file URLs and external players without script execution',()=>{
 const html='<iframe src="https://voe.sx/e/player"></iframe><a href="https://filemoon.sx/e/demo" class="player">Watch</a><video src="/video/sample.mp4"></video><script>const url="https://bad.example/private.m3u8"</script>';
 const out=discoverPlayers(html,'https://example.org/series/episode');
 assert.equal(out.length,3);
 assert.deepEqual(out.map(x=>x.kind),['player','player','direct']);
 assert.equal(out[0].hoster,'VOE');
 assert.equal(out[2].url,'https://example.org/video/sample.mp4');
});
test('PlayerBridge rejects unsaved and off-domain inspection and never fetches external players',async()=>{
 const db=openDatabase(':memory:');const fetched=[];
 const fetcher=async url=>{fetched.push(url);return {url,body:Buffer.from('<iframe src="https://voe.sx/player"></iframe>')}};
 try{
  await assert.rejects(inspectPlayerPage(db,{siteId:'none',url:'https://example.org/episode'},{fetcher}),/Website/);
  db.prepare('INSERT INTO search_sites(id,url,label,adapter_id,enabled,search_template,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('site','https://example.org/','Demo','auto',1,'','now','now');
  await assert.rejects(inspectPlayerPage(db,{siteId:'site',url:'https://different.example/episode'},{fetcher}),/Website/);
  const out=await inspectPlayerPage(db,{siteId:'site',url:'https://example.org/episode'},{fetcher});
  assert.equal(out.counts.external,1);
  assert.deepEqual(fetched,['https://example.org/episode']);
 }finally{db.close()}
});
