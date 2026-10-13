import assert from 'node:assert/strict';
import {
  describeDownloadError, normalizeDownloadError, exportStorageKey, isRetainedExportRecord,
  canonicalMediaMime, extensionForMediaMime, normalizeMediaFilename, inspectMediaHead,
  createTypedMediaBlob
} from '../export.js';

assert.equal(normalizeDownloadError('FILE_NO_SPACE'), 'FILE_NO_SPACE');
assert.equal(normalizeDownloadError('Error: Download interrupted: USER_CANCELED'), 'USER_CANCELED');
assert.equal(describeDownloadError('FILE_NO_SPACE').retryable, true);
assert.match(describeDownloadError('FILE_NO_SPACE').title, /Speicherplatz/);
assert.equal(describeDownloadError('FILE_BLOCKED').retryable, false);
assert.equal(describeDownloadError('something odd').retryable, true);
assert.equal(exportStorageKey('abc'), 'sf_export_abc');
assert.equal(isRetainedExportRecord({jobId:'j',tempName:'x.ts',filename:'Film.ts',bytes:12}), true);
assert.equal(isRetainedExportRecord({jobId:'j',filename:'Film.ts',bytes:12}), false);
assert.equal(isRetainedExportRecord({jobId:'j',tempName:'x.ts',filename:'Film.ts',bytes:0}), false);

// MIME and filename normalization: a wrong text suffix must be replaced,
// never turned into "Film.txt.ts".
assert.equal(canonicalMediaMime('video/mpegts'), 'video/mp2t');
assert.equal(extensionForMediaMime('video/mp2t'), '.ts');
assert.equal(normalizeMediaFilename('Mutiny (2025).txt', 'video/mp2t'), 'Mutiny (2025).ts');
assert.equal(normalizeMediaFilename('Mutiny (2025).m3u8', 'video/mp2t'), 'Mutiny (2025).ts');
assert.equal(normalizeMediaFilename('Mutiny (2025).mp4', 'video/mp2t'), 'Mutiny (2025).ts');
assert.equal(normalizeMediaFilename('Mutiny (2025)', 'video/mp4'), 'Mutiny (2025).mp4');
assert.equal(normalizeMediaFilename('Mutiny (2025).ts', 'video/mp2t'), 'Mutiny (2025).ts');

// Explicit Blob MIME fixes the OPFS File.type=="" export regression.
const raw = new Blob([new Uint8Array([1,2,3])]);
assert.equal(raw.type, '');
const typed = createTypedMediaBlob(raw, 'video/mp2t');
assert.equal(typed.type, 'video/mp2t');
assert.equal(typed.size, raw.size);

// Build a minimal head with three aligned TS sync bytes.
const tsHead = new Uint8Array(188 * 3);
tsHead[0] = tsHead[188] = tsHead[376] = 0x47;
assert.deepEqual(inspectMediaHead(tsHead, 'video/mp2t'), { ok:true, code:'', detectedMime:'video/mp2t', kind:'ts' });
assert.equal(inspectMediaHead(tsHead, 'video/mp4').code, 'EXPORT_TYPE_MISMATCH');

// Minimal ISO-BMFF ftyp box header.
const mp4Head = new Uint8Array([0,0,0,24, 0x66,0x74,0x79,0x70, 0x69,0x73,0x6f,0x6d, 0,0,0,0, 0,0,0,0, 0,0,0,0]);
assert.deepEqual(inspectMediaHead(mp4Head, 'video/mp4'), { ok:true, code:'', detectedMime:'video/mp4', kind:'mp4' });
assert.equal(inspectMediaHead(mp4Head, 'video/mp2t').code, 'EXPORT_TYPE_MISMATCH');

const playlist = new TextEncoder().encode('#EXTM3U\n#EXT-X-VERSION:3\n');
assert.equal(inspectMediaHead(playlist, 'video/mp2t').code, 'EXPORT_PLAYLIST_CONTENT');
assert.equal(describeDownloadError('EXPORT_PLAYLIST_CONTENT').retryable, false);
const html = new TextEncoder().encode('<!doctype html><html><body>403</body></html>');
assert.equal(inspectMediaHead(html, 'video/mp2t').code, 'EXPORT_HTML_CONTENT');
assert.equal(inspectMediaHead(new Uint8Array([1,2,3,4,5,6,7,8]), 'video/mp2t').code, 'EXPORT_INVALID_TS');
assert.equal(inspectMediaHead(new Uint8Array([1,2,3,4,5,6,7,8]), 'video/mp4').code, 'EXPORT_INVALID_MP4');

console.log('export recovery + media validation tests: OK');
