import assert from 'node:assert/strict';
import { parseIsoDuration } from '../dash.js';
assert.equal(parseIsoDuration('PT1H2M3.5S'),3723.5);
assert.equal(parseIsoDuration('PT90S'),90);
assert.equal(parseIsoDuration('P1DT1H'),90000);
assert.equal(parseIsoDuration('n/a'),0);
console.log('dash utils tests: ok');
