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


test('PlayerBridge ignores social network widgets and unrelated raw-IP iframes',()=>{
 const html=[
  '<iframe src="https://186.2.175.5/stream"></iframe>',
  '<iframe src="https://45.10.243.23/player"></iframe>',
  '<iframe src="https://www.facebook.com/plugins/video.php"></iframe>',
  '<iframe src="https://platform.twitter.com/widgets/tweet_button.html"></iframe>',
  '<iframe src="https://onlinefilter.info/embed/id"></iframe>',
  '<iframe src="https://voe.sx/e/episode"></iframe>',
  '<a class="player" href="https://filemoon.sx/e/movie">Film ansehen</a>'
 ].join('\n');
 const out=discoverPlayers(html,'https://licensed.example/show/staffel-1/episode-49');
 assert.deepEqual(out.map(x=>x.hoster),['onlinefilter.info','VOE','Filemoon']);
 assert.equal(out.every(x=>x.kind==='player'),true);
});
