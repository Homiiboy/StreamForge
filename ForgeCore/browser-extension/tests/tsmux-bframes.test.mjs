import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TsMuxer, muxTsBuffers, extractPesFromTs } from '../tsmux.js';

const video = new Uint8Array(fs.readFileSync(new URL('./fixtures/video-bframes.ts', import.meta.url)));
const audio = new Uint8Array(fs.readFileSync(new URL('./fixtures/audio-bframes.ts', import.meta.url)));
const inputVideo = extractPesFromTs(video, 'video').pes;
assert.ok(inputVideo.some(x => Number.isFinite(x.pts) && Number.isFinite(x.dts) && x.pts !== x.dts), 'fixture must contain B-frame PTS/DTS reordering');

const out = await muxTsBuffers(video, audio);
const parsed = extractPesFromTs(out);
const videoPes = parsed.pes.filter(x => x.kind === 'video' && Number.isFinite(x.dts));
assert.ok(videoPes.length > 10, 'expected video PES');
for (let i = 1; i < videoPes.length; i++) {
  assert.ok(videoPes[i].dts >= videoPes[i - 1].dts, `video DTS must stay in decode order at ${i}`);
}

// HLS discontinuities must be signalled in the generated TS rather than being
// interpreted by downstream demuxers as accidental timestamp corruption.
const chunks = [];
const writer = { write: async b => chunks.push(b.slice ? b.slice() : new Uint8Array(b)) };
const muxer = new TsMuxer(writer, { flushBytes: 256 * 1024 });
await muxer.writePair(video, audio);
await muxer.markDiscontinuity();
await muxer.writePair(video, audio);
await muxer.flush();
const combined = new Uint8Array(chunks.reduce((n, x) => n + x.length, 0));
let o = 0; for (const c of chunks) { combined.set(c, o); o += c.length; }
let foundDiscontinuity = false;
for (let p = 0; p + 188 <= combined.length; p += 188) {
  if (combined[p] !== 0x47) continue;
  const pid = ((combined[p + 1] & 0x1f) << 8) | combined[p + 2];
  if (pid !== 0x100 && pid !== 0x101) continue;
  const afc = (combined[p + 3] >> 4) & 0x03;
  if (afc !== 2 && afc !== 3) continue;
  const len = combined[p + 4];
  if (len > 0 && (combined[p + 5] & 0x80)) { foundDiscontinuity = true; break; }
}
assert.equal(foundDiscontinuity, true, 'TS discontinuity_indicator missing');
console.log('ts mux B-frame/discontinuity tests: OK');
