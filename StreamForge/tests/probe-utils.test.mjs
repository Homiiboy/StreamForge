import assert from 'node:assert/strict';
import { QUICK_PROBE_ATTEMPTS, ROBUST_PROBE_ATTEMPTS, probeTimeoutMs, hlsPlaylistType, buildProbeSummary, shouldProbeNow } from '../probe-utils.js';

assert.equal(QUICK_PROBE_ATTEMPTS, 2);
assert.equal(ROBUST_PROBE_ATTEMPTS, 5);
assert.equal(probeTimeoutMs(1,'quick'), 7000);
assert.equal(probeTimeoutMs(2,'quick'), 10000);
assert.equal(probeTimeoutMs(1,'download'), 12000);
assert.equal(probeTimeoutMs(3,'download'), 18000);
assert.equal(hlsPlaylistType('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na.m3u8'), 'master');
assert.equal(hlsPlaylistType('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\na.ts'), 'media');
assert.equal(buildProbeSummary('hls',{playlistType:'media',variants:0}), 'HLS · bereit');
assert.equal(buildProbeSummary('hls',{height:1080,bandwidth:5500000,variants:3}), '1080p · 5.5 Mbps · 3 Varianten');
assert.equal(buildProbeSummary('dash',{variants:0}), 'DASH · analysiert');
assert.equal(shouldProbeNow({probe:{summary:'x'}},Date.now()), false);
assert.equal(shouldProbeNow({probeRetryAfter:Date.now()+10000},Date.now()), false);
assert.equal(shouldProbeNow({probeRetryAfter:0},Date.now()), true);

console.log('probe-utils tests OK');
