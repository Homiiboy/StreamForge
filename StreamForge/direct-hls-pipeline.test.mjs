import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../offscreen.js', import.meta.url), 'utf8');
const start = src.indexOf('async function writePartsToTemp(');
const end = src.indexOf('\nfunction mediaParts', start);
assert.ok(start >= 0 && end > start, 'writePartsToTemp must exist');
const body = src.slice(start, end);
assert.match(body, /createDynamicLimiter/);
assert.match(body, /scheduleWindow/);
assert.match(body, /bufferedBytes/);
assert.match(body, /nextSchedule/);
assert.match(body, /nextWrite/);
assert.doesNotMatch(body, /Promise\.all\(batch\.map/, 'fixed Promise.all batch barrier must not return');
assert.match(body, /setInterval\([^]*500/, 'progress should be emitted out of the hot path on a ticker');
console.log('direct HLS rolling-prefetch regression tests: OK');
