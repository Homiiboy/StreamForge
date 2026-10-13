import assert from 'node:assert/strict';
import { normalizeObservedHeaders, profileFromObservedHeaders, cookieHeaderFromCookies, cacheModeForRequest, buildRequestHeaderRule } from '../request-profile.js';

const headers = [
  {name:'Referer',value:'https://site.example/watch'},
  {name:'Origin',value:'https://site.example'},
  {name:'Accept',value:'application/vnd.apple.mpegurl,*/*'},
  {name:'Cookie',value:'secret=1'},
  {name:'Authorization',value:'Bearer secret'},
  {name:'Accept-Language',value:'de-DE,de;q=0.9'}
];
const normalized = normalizeObservedHeaders(headers);
assert.equal(normalized.referer, 'https://site.example/watch');
assert.equal(normalized.cookie, undefined);
assert.equal(normalized.authorization, undefined);
const profile = profileFromObservedHeaders(headers);
assert.equal(profile.origin, 'https://site.example');
assert.equal(cookieHeaderFromCookies([{name:'a',value:'1'},{name:'b',value:'2'}]), 'a=1; b=2');
assert.equal(cacheModeForRequest({attempt:1,isManifest:false}), 'force-cache');
assert.equal(cacheModeForRequest({attempt:1,isManifest:true}), 'default');
assert.equal(cacheModeForRequest({attempt:3,isManifest:false}), 'reload');
const rule = buildRequestHeaderRule({id:77,hostname:'cdn.example',extensionId:'abcdefghijklmnop',profile,cookieHeader:'sid=abc'});
assert.equal(rule.id, 77);
assert.equal(rule.condition.requestDomains[0], 'cdn.example');
assert.equal(rule.action.requestHeaders.find(x=>x.header==='Referer').value, 'https://site.example/watch');
assert.equal(rule.action.requestHeaders.find(x=>x.header==='Accept').value, 'application/vnd.apple.mpegurl,*/*');
assert.equal(rule.action.requestHeaders.find(x=>x.header==='Cookie').value, 'sid=abc');
console.log('request profile tests ok');
