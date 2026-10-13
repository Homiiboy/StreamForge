import assert from 'node:assert/strict';
import { pairHlsSegments, pairRequestCost, takePairBatch } from '../hls-pipeline.js';

const video = [
  { start: 0, end: 2, duration: 2 },
  { start: 2, end: 4, duration: 2 },
  { start: 4, end: 6, duration: 2 },
  { start: 6, end: 8, duration: 2 }
];
const audio = [
  { start: 0, end: 2, duration: 2 },
  { start: 2, end: 4, duration: 2 },
  { start: 4, end: 6, duration: 2 },
  { start: 6, end: 8, duration: 2 }
];
const pairs = pairHlsSegments(video, audio);
assert.deepEqual(pairs.map(x => x.audioIndexes), [[0],[1],[2],[3]]);
assert.ok(pairs.every(x => x.hasAudioCoverage));
assert.equal(pairRequestCost(pairs[0]), 2);

// Parallelität 8 means at most eight planned HTTP requests: four normal
// video+audio pairs in one batch.
let batch = takePairBatch(pairs, 0, 8);
assert.equal(batch.items.length, 4);
assert.equal(batch.requestCount, 8);
assert.equal(batch.nextIndex, 4);

// If adaptive networking drops to 4, the next batch only contains two pairs.
batch = takePairBatch(pairs, 0, 4);
assert.equal(batch.items.length, 2);
assert.equal(batch.requestCount, 4);
assert.equal(batch.nextIndex, 2);

// A video interval can legitimately consume multiple short audio intervals.
const splitAudioPairs = pairHlsSegments(
  [{ start: 0, end: 4, duration: 4 }, { start: 4, end: 8, duration: 4 }],
  [
    { start: 0, end: 2, duration: 2 },
    { start: 2, end: 4, duration: 2 },
    { start: 4, end: 6, duration: 2 },
    { start: 6, end: 8, duration: 2 }
  ]
);
assert.deepEqual(splitAudioPairs.map(x => x.audioIndexes), [[0,1],[2,3]]);
assert.equal(pairRequestCost(splitAudioPairs[0]), 3);
const constrained = takePairBatch(splitAudioPairs, 0, 4);
assert.equal(constrained.items.length, 1);
assert.equal(constrained.requestCount, 3);

// 1.4.4 regression: one long audio segment may cover multiple video
// segments. It must only be downloaded once; later video segments are already
// covered and therefore cost one video request instead of failing.
const longAudioPairs = pairHlsSegments(
  [{ start: 0, end: 2 }, { start: 2, end: 4 }, { start: 4, end: 6 }],
  [{ start: 0, end: 4 }, { start: 4, end: 6 }]
);
assert.deepEqual(longAudioPairs.map(x => x.audioIndexes), [[0],[],[1]]);
assert.equal(longAudioPairs[1].coveredByPrevious, true);
assert.equal(longAudioPairs[1].hasAudioCoverage, true);
assert.equal(pairRequestCost(longAudioPairs[1]), 1);

// A tiny playlist-end drift on the final video segment is accepted. This is
// common when independent HLS packagers round audio/video EXTINF differently.
const tailDriftPairs = pairHlsSegments(
  [{ start: 0, end: 2 }, { start: 2, end: 4 }, { start: 4, end: 6 }],
  [{ start: 0, end: 2 }, { start: 2, end: 3.98 }]
);
assert.equal(tailDriftPairs[2].hasAudioCoverage, true);
assert.equal(tailDriftPairs[2].tailGapAccepted, true);
assert.ok(tailDriftPairs[2].tailGapSeconds < 0.1);
assert.deepEqual(tailDriftPairs[2].audioIndexes, []);

// Genuine holes in the middle are still rejected by the caller.
const missingMiddle = pairHlsSegments(
  [{ start: 0, end: 2 }, { start: 2, end: 4 }, { start: 4, end: 6 }],
  [{ start: 0, end: 2 }, { start: 4, end: 6 }]
);
assert.equal(missingMiddle[1].hasAudioCoverage, false);

// A large end gap is not hidden by the trailing tolerance.
const missingTail = pairHlsSegments(
  [{ start: 0, end: 2 }, { start: 2, end: 4 }, { start: 4, end: 6 }],
  [{ start: 0, end: 2 }, { start: 2, end: 3 }]
);
assert.equal(missingTail[2].hasAudioCoverage, false);

// A single expensive pair is still emitted even if it is larger than the
// current budget, preventing a deadlock on unusual playlists.
const one = takePairBatch([{ videoIndex: 0, audioIndexes: [0,1,2] }], 0, 2);
assert.equal(one.items.length, 1);
assert.equal(one.requestCount, 4);

console.log('hls-pipeline tests OK');
