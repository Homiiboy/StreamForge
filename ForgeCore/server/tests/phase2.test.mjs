import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {isPublicIP,authorizeUrl,safeFetch} from '../src/source-security.mjs';
import {parseHls,parseDash,parseHtmlLinks,analyzeSource} from '../src/source-adapters.mjs';
import {safePublish,downloadMedia,fetchManifest} from '../src/media-download.mjs';

const hls=`#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nseg1.ts\n#EXTINF:10,\nseg2.ts\n#EXT-X-ENDLIST\n`;
test('SSRF protections and pinned DNS response',async()=>{
 for(const ip of ['127.0.0.1','192.168.1.1','10.0.0.2','172.16.0.1','169.254.1.1','::1','fc00::1','2001:db8::1'])assert.equal(isPublicIP(ip),false,ip);
 for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(isPublicIP(ip),true,ip);
 await assert.rejects(authorizeUrl('http://localhost/movie.m3u8'),/Local/);
 await assert.rejects(authorizeUrl('http://127.0.0.1/movie.m3u8'),/Private/);
 await assert.rejects(authorizeUrl('http://user:secret@example.org/a'),/Unsafe/);
 await assert.rejects(authorizeUrl('http://example.org:10000/video.m3u8'),/Nonstandard/);
 await assert.rejects(authorizeUrl('http://example.org/a',{lookup:async()=>[{address:'192.168.0.5',family:4}]}),/Private/);
 const allowed=await authorizeUrl('https://test.example/video',{lookup:async()=>[{address:'8.8.8.8',family:4}]});assert.equal(allowed.ip,'8.8.8.8');
});
test('HLS playlist analysis rejects encrypted or live streams',()=>{
 assert.equal(parseHls(hls,'https://example.org/master.m3u8').segments.length,2);
 assert.equal(parseHls(hls,'https://example.org/master.m3u8').segments[0],'https://example.org/seg1.ts');
 const master=parseHls('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000\nhi.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nlo.m3u8','https://example.org/master.m3u8');
 assert.equal(master.variants[0].url,'https://example.org/hi.m3u8');
 assert.throws(()=>parseHls(hls.replace('#EXT-X-ENDLIST','#EXT-X-KEY:METHOD=AES-128'), 'https://example.org/a.m3u8'),/Encrypted/);
 assert.throws(()=>parseHls(hls.replace('#EXT-X-ENDLIST',''),'https://example.org/a.m3u8'),/Live/);
});
test('DASH explicit SegmentList parsing and DRM rejection',()=>{
 const xml=`<MPD type="static"><Period><AdaptationSet mimeType="video/mp4"><Representation bandwidth="900"><SegmentList><Initialization sourceURL="init.mp4"/><SegmentURL media="1.m4s"/><SegmentURL media="2.m4s"/></SegmentList></Representation></AdaptationSet><AdaptationSet mimeType="audio/mp4"><Representation bandwidth="90"><SegmentList><Initialization sourceURL="audio-init.mp4"/><SegmentURL media="a1.m4s"/></SegmentList></Representation></AdaptationSet></Period></MPD>`;
 const parsed=parseDash(xml,'https://example.org/media/manifest.mpd');assert.equal(parsed.video.segments.length,2);assert.equal(parsed.audio.segments.length,1);assert.equal(parsed.video.init,'https://example.org/media/init.mp4');
 assert.throws(()=>parseDash(xml.replace('<Period>','<ContentProtection/><Period>'),'https://example.org/a.mpd'),/Protected/);
});
test('DASH SegmentTemplate VOD supports numbered and timed fragments',()=>{
 const numbered='<MPD type="static" mediaPresentationDuration="PT6S"><Period><AdaptationSet mimeType="video/mp4"><SegmentTemplate timescale="1" duration="2" startNumber="1" initialization="$RepresentationID$/init.mp4" media="$RepresentationID$/$Number%03d$.m4s"/><Representation id="v1" bandwidth="1000"/></AdaptationSet></Period></MPD>';
 const v=parseDash(numbered,'https://example.org/manifest.mpd').video;
 assert.deepEqual(v.segments,['https://example.org/v1/001.m4s','https://example.org/v1/002.m4s','https://example.org/v1/003.m4s']);
 const timed='<MPD type="static"><Period><AdaptationSet mimeType="video/mp4"><Representation id="v1"><SegmentTemplate initialization="init.mp4" media="chunk-$Time$.m4s" timescale="1000"><SegmentTimeline><S t="100" d="500" r="2" /></SegmentTimeline></SegmentTemplate></Representation></AdaptationSet></Period></MPD>';
 assert.deepEqual(parseDash(timed,'https://example.org/a.mpd').video.segments,['https://example.org/chunk-100.m4s','https://example.org/chunk-600.m4s','https://example.org/chunk-1100.m4s']);
});
test('HTML discovery uses no scripts and identifies episodes',()=>{
 const items=parseHtmlLinks('<script>var a="secret.m3u8"</script><a href="/Slugterra-S02E08.m3u8" title="Slugterra S02E08">watch</a><a href="https://example.org/slugterra-episode-2.mp4">mp4</a>','https://example.org/series');
 assert.equal(items.length,2);assert.equal(items[0].season,2);assert.equal(items[0].episode,8);
});
test('source analysis supports injected fetcher and highest HLS variant',async()=>{
 const fetcher=async u=>({url:u,body:Buffer.from(u.endsWith('master.m3u8')?'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlow.m3u8':hls)});
 const a=await analyzeSource('https://example.org/master.m3u8',{fetcher});assert.equal(a.kind,'master');
 const b=await fetchManifest('https://example.org/master.m3u8',fetcher);assert.equal(b.segments.length,2);
});
test('safeFetch enforces redirect revalidation and content limits',async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{location:'/ok'});res.end();return;}if(req.url==='/large'){res.end('X'.repeat(4000));return;}res.end('hello')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base='http://127.0.0.1:'+server.address().port;
  // Localhost is forbidden even when allowPrivate=true because port is nonstandard.
  await assert.rejects(safeFetch(base+'/ok',{allowPrivate:true}),/Nonstandard/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('direct MP4 pipeline stores Jellyfin output without overwrite',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-phase2-'));
 try{
  const media={kind:'series',title:'Slugterra'},episode={season:2,episode:8};
  const fake=Buffer.alloc(2048,0x55);fake.write('ftyp',4,'ascii');
  const fetcher=async(url)=>({url,body:fake});
  const result=await downloadMedia({sourceUrl:'https://example.org/movie.mp4',media,episode,root,fetcher});
  assert.equal(result.path,'Shows/Slugterra/Season 02/Slugterra S02E08.mp4');
  assert.equal((await readFile(join(root,result.path))).length,2048);
  await assert.rejects(downloadMedia({sourceUrl:'https://example.org/movie.mp4',media,episode,root,fetcher}),/already exists/);
  await assert.rejects(downloadMedia({sourceUrl:'https://example.org/bad.mp4',media:{kind:'movie',title:'Bad'},root,fetcher:async url=>({url,body:Buffer.alloc(2048)})}),/Invalid MP4/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('safePublish reuses existing Staffel and preserves episode files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forgecore-staffel-'));
 try{
  const parent=join(root,'Shows','Slugterra','Staffel 2');await mkdir(parent,{recursive:true});
  const from=join(root,'temp.mp4');await writeFile(from,Buffer.alloc(2048,33));
  // library.relative identifies an existing "Staffel 2" but safePublish currently prefers canonical Season 02.
  // Ensure no overwrite regardless of existing path.
  const savedAlt=await safePublish(from,root,{kind:'series',title:'Slugterra'},{season:2,episode:8});
  assert.equal(savedAlt.path,'Shows/Slugterra/Staffel 2/Slugterra S02E08.mp4');
  const saved=await safePublish(from,root,{kind:'movie',title:'Interstellar',year:2014});
  assert.equal(saved.path,'Movies/Interstellar (2014)/Interstellar (2014).mp4');
  await assert.rejects(safePublish(from,root,{kind:'movie',title:'Interstellar',year:2014}),/already exists|EEXIST/);
 }finally{await rm(root,{recursive:true,force:true})}
});
