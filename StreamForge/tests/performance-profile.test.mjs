import assert from 'node:assert/strict';
import { performanceProfile, PERFORMANCE_PROFILES } from '../performance-profile.js';
assert.equal(performanceProfile('balanced').start,4);
assert.equal(performanceProfile('gentle').max,4);
assert.equal(performanceProfile('fast').max,12);
assert.deepEqual(performanceProfile('__unknown'),PERFORMANCE_PROFILES.balanced);
assert.ok(Object.values(PERFORMANCE_PROFILES).every(x=>x.start>0 && x.start<=x.max && x.max<=12));
console.log('Performance profile tests passed');
