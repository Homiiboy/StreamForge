import assert from 'node:assert/strict';
import { parseMasterPlaylist, parseMediaPlaylist, chooseBestVariant, chooseVariant, isMasterPlaylist, isHlsPlaylist, looksLikeHlsPlaylistBytes } from '../hls.js';

const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=450000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
hi/index.m3u8`;
const parsed = parseMasterPlaylist(master, 'https://cdn.example/master.m3u8');
assert.equal(parsed.variants.length, 2);
assert.equal(chooseBestVariant(parsed).height, 1080);
assert.equal(chooseBestVariant(parsed).uri, 'https://cdn.example/hi/index.m3u8');
assert.equal(chooseVariant(parsed, 'https://cdn.example/low/index.m3u8').height, 360);
assert.equal(chooseVariant(parsed, {uri:'https://cdn.example/expired/old.m3u8',height:360}).height, 360);

const mediaTs = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6,
a.ts
#EXTINF:6,
b.ts
#EXT-X-ENDLIST`;
const ts = parseMediaPlaylist(mediaTs, 'https://cdn.example/hi/index.m3u8');
assert.equal(ts.encrypted, false);
assert.equal(ts.segments.length, 2);
assert.equal(ts.fmp4, false);
assert.equal(ts.segments[0].url, 'https://cdn.example/hi/a.ts');
assert.equal(ts.segments[0].duration, 6);
assert.equal(ts.segments[1].start, 6);
assert.equal(ts.duration, 12);

const encrypted = parseMediaPlaylist(`#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:5,\na.ts`, 'https://cdn.example/p.m3u8');
assert.equal(encrypted.encrypted, true);

const fmp4 = parseMediaPlaylist(`#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\nseg1.m4s\n#EXTINF:4,\nseg2.m4s`, 'https://cdn.example/p.m3u8');
assert.equal(fmp4.fmp4, true);
assert.equal(fmp4.segments[0].map.url, 'https://cdn.example/init.mp4');

const discontinuous = parseMediaPlaylist(`#EXTM3U
#EXT-X-DISCONTINUITY-SEQUENCE:4
#EXTINF:4,
a.ts
#EXT-X-DISCONTINUITY
#EXTINF:4,
b.ts`, 'https://cdn.example/p.m3u8');
assert.equal(discontinuous.segments[0].discontinuity, false);
assert.equal(discontinuous.segments[0].discontinuitySequence, 4);
assert.equal(discontinuous.segments[1].discontinuity, true);
assert.equal(discontinuous.segments[1].discontinuitySequence, 5);

const separate = parseMasterPlaylist(`#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Deutsch",DEFAULT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,AUDIO="aud"\nvideo.m3u8`, 'https://cdn.example/master.m3u8');
assert.equal(separate.variants[0].separateAudio, true);
assert.equal(separate.audioGroups.get('aud')[0].name, 'Deutsch');
assert.equal(separate.audioGroups.get('aud')[0].isDefault, true);
console.log('hls tests ok');

assert.equal(isHlsPlaylist(master), true);
assert.equal(isMasterPlaylist(master), true);
assert.equal(isMasterPlaylist(mediaTs), false);
assert.equal(looksLikeHlsPlaylistBytes(new TextEncoder().encode('#EXTM3U\n#EXTINF:4,\na.ts')), true);
assert.throws(() => parseMediaPlaylist(master, 'https://cdn.example/master.m3u8'), /Master-Playlist/);

const withSubtitle=parseMasterPlaylist(`#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Deutsch",LANGUAGE="de",DEFAULT=YES,URI="sub/de.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="sub/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,SUBTITLES="subs"
video.m3u8`, 'https://cdn.example/master.m3u8');
assert.equal(withSubtitle.variants[0].subtitleGroup,'subs');
assert.equal(withSubtitle.subtitleGroups.get('subs').length,2);
assert.equal(withSubtitle.subtitleGroups.get('subs')[0].language,'de');
assert.equal(withSubtitle.subtitleGroups.get('subs')[0].isDefault,true);
assert.equal(withSubtitle.subtitleGroups.get('subs')[1].uri,'https://cdn.example/sub/en.m3u8');
