import assert from 'node:assert/strict';
import {validateSegmentPayload,validateDownloadProgress} from '../download-reliability.js';
assert.equal(validateSegmentPayload(new Uint8Array([1,2,3]))[0],1);
assert.throws(()=>validateSegmentPayload(new Uint8Array()),/leer/);
assert.throws(()=>validateSegmentPayload(new TextEncoder().encode('<!DOCTYPE html><html>')),/HTML/);
assert.throws(()=>validateDownloadProgress({written:20,total:3,done:2}),/unvollständig/);
assert.throws(()=>validateDownloadProgress({written:20,total:1,done:1,expected:30}),/unvollständig/);
assert.equal(validateDownloadProgress({written:20,total:1,done:1}),true);
console.log('download reliability tests passed');
