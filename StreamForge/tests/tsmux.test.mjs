import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TsMuxer, muxTsBuffers, extractPesFromTs, isMpegTs } from '../tsmux.js';
const video = new Uint8Array(fs.readFileSync(new URL('./fixtures/video.ts', import.meta.url)));
const audio = new Uint8Array(fs.readFileSync(new URL('./fixtures/audio.ts', import.meta.url)));
assert.equal(isMpegTs(video), true);
assert.equal(isMpegTs(audio), true);
const out = await muxTsBuffers(video, audio);
const parsed = extractPesFromTs(out);
assert.ok(parsed.pes.some(x => x.kind === 'video'), 'video PES missing');
assert.ok(parsed.pes.some(x => x.kind === 'audio'), 'audio PES missing');
assert.equal(out[0], 0x47);
assert.equal(out.length % 188, 0);

// 1.4.4 regression: when a previously written audio HLS segment spans the
// following video interval, the muxer must be able to append video-only TS
// without duplicating that audio segment.
const chunks = []; let writerCalls = 0;
const writer = { write: async b => { writerCalls++; chunks.push(b.slice ? b.slice() : new Uint8Array(b)); } };
const muxer = new TsMuxer(writer);
await muxer.writePair(video, audio);
const beforeVideoOnly = muxer.bytesWritten;
const videoOnlyResult = await muxer.writeVideo(video);
assert.equal(videoOnlyResult.audioPes, 0);
assert.ok(muxer.bytesWritten > beforeVideoOnly);
await muxer.flush();
const combined = new Uint8Array(chunks.reduce((n,x)=>n+x.length,0));
let pos = 0; for (const chunk of chunks) { combined.set(chunk,pos); pos += chunk.length; }
const combinedParsed = extractPesFromTs(combined);
assert.ok(combinedParsed.pes.some(x => x.kind === 'video'));
assert.ok(combinedParsed.pes.some(x => x.kind === 'audio'));
assert.equal(combined.length % 188, 0);
assert.ok(writerCalls <= 2, `Kleine TS-Ausgabe sollte persistent gepuffert werden (writes=${writerCalls})`);

// 1.5.1 regression: the output buffer must persist across HLS segment pairs.
// Repeating the small fixture creates a multi-megabyte output and should result
// in only a handful of physical writer calls rather than one flush per pair.
let stressCalls = 0, stressBytes = 0;
const stressWriter = { write: async b => { stressCalls++; stressBytes += b.byteLength; } };
const stressMuxer = new TsMuxer(stressWriter,{flushBytes:2*1024*1024});
for (let i=0;i<48;i++) await stressMuxer.writePair(video,audio);
await stressMuxer.flush();
assert.equal(stressBytes, stressMuxer.bytesWritten);
assert.equal(stressBytes % 188, 0);
assert.ok(stressCalls <= 3, `Persistenter 2-MiB-Puffer erzeugt zu viele Writes (writes=${stressCalls})`);

console.log('ts mux tests: OK');
