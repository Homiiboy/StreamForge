import assert from 'node:assert/strict';
import {subtitleSegments,parseWebVtt,mergeWebVttToSrt} from '../subtitle-export.js';
const parts=subtitleSegments('#EXTM3U\n#EXTINF:3,\nsubs/1.vtt\n#EXTINF:3,\nsubs/2.vtt\n','https://cdn.test/list.m3u8');
assert.equal(parts.length,2);assert.equal(parts[1].start,3);
assert.equal(parts[0].url,'https://cdn.test/subs/1.vtt');
assert.throws(()=>subtitleSegments('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128\n#EXTINF:3,\nx.vtt','https://cdn.test/'),/Verschlüsselte/);
const vtt='WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHallo';
assert.equal(parseWebVtt(vtt)[0].text,'Hallo');
assert.equal(mergeWebVttToSrt([{start:0,text:vtt},{start:3,text:'WEBVTT\n\n00:00:00.500 --> 00:00:01.000\nWelt'}]),
'1\n00:00:01,000 --> 00:00:02,000\nHallo\n\n2\n00:00:03,500 --> 00:00:04,000\nWelt\n');
assert.throws(()=>parseWebVtt('WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:90000'),/MPEGTS/);
console.log('WebVTT merge and SRT conversion tests passed');