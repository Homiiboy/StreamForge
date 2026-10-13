import assert from 'node:assert/strict';

const session = new Map();
const local = new Map();
const tabKey = 'sf_tab_7';
session.set(tabKey, [{ id: 'c1', title: 'Mutiny', download: {} }]);
let runtimeListener = null;
let downloadChangedListener = null;
let nextDownloadId = 40;
const internalMessages = [];
const noopEvent = { addListener() {} };
const clone = v => structuredClone(v);

function area(store) {
  return {
    async get(keys) {
      if (typeof keys === 'string') return { [keys]: clone(store.get(keys)) };
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter(k => store.has(k)).map(k => [k, clone(store.get(k))]));
      if (keys && typeof keys === 'object') {
        const out = {};
        for (const [k, def] of Object.entries(keys)) out[k] = store.has(k) ? clone(store.get(k)) : def;
        return out;
      }
      return Object.fromEntries([...store].map(([k,v]) => [k, clone(v)]));
    },
    async set(obj) { for (const [k,v] of Object.entries(obj)) store.set(k, clone(v)); },
    async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) store.delete(k); }
  };
}

globalThis.chrome = {
  runtime: {
    id: 'test-extension',
    onMessage: { addListener(fn) { runtimeListener = fn; } },
    getURL: p => `chrome-extension://test-extension/${p}`,
    getContexts: async () => [{ contextType: 'OFFSCREEN_DOCUMENT' }],
    async sendMessage(msg) {
      internalMessages.push(clone(msg));
      if (msg?.type === 'sf_export_prepare') {
        return { ok: true, ...msg.export, blobUrl: `blob:test/${msg.export.jobId}` };
      }
      return { ok: true };
    }
  },
  declarativeNetRequest: { getSessionRules: async () => [], updateSessionRules: async () => {} },
  storage: { session: area(session), local: area(local) },
  action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
  cookies: { async getAllCookieStores() { return []; }, async getAll() { return []; }, async getPartitionKey() { return null; } },
  permissions: { async contains() { return true; } },
  downloads: {
    async download() { return ++nextDownloadId; },
    onChanged: { addListener(fn) { downloadChangedListener = fn; } }
  },
  offscreen: { async createDocument() {} },
  tabs: { get: async () => ({ url: 'https://example.test', title: 'Mutiny' }), create: async () => ({}), onRemoved: noopEvent, onUpdated: noopEvent },
  webRequest: { onBeforeSendHeaders: noopEvent, onHeadersReceived: noopEvent }
};

await import(`../background.js?export-recovery=${Date.now()}`);
assert.equal(typeof runtimeListener, 'function');
assert.equal(typeof downloadChangedListener, 'function');

function invoke(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ret = runtimeListener(message, {}, r => { settled = true; resolve(r); });
    if (!ret && !settled) reject(new Error('message was not handled'));
  });
}

const ready = await invoke({
  type: 'sf_blob_ready', target: 'background', jobId: 'j1', tabId: 7, candidateId: 'c1',
  blobUrl: 'blob:test/initial', tempName: 'streamforge-j1-muxed.ts', tempNames: ['streamforge-j1-muxed.ts'],
  filename: 'Mutiny (2025).txt', mime: 'video/mp2t', bytes: 5_500_000_000
});
assert.equal(ready.ok, true);
const firstId = ready.downloadId;
assert.ok(firstId > 40);
assert.equal(local.get('sf_export_j1')?.filename, 'Mutiny (2025).ts', 'wrong .txt suffix must be replaced by .ts before Chrome export');
assert.equal(session.get(tabKey)[0].download.state, 'saving');
assert.equal(session.get(tabKey)[0].download.exportBytes, 5_500_000_000);

// Simulate Chrome failing only at the final export. OPFS metadata must remain.
await downloadChangedListener({ id: firstId, state: { current: 'interrupted' }, error: { current: 'FILE_NO_SPACE' } });
const failed = session.get(tabKey)[0].download;
assert.equal(failed.state, 'export_error');
assert.equal(failed.exportRetryAvailable, true);
assert.equal(failed.exportErrorCode, 'FILE_NO_SPACE');
assert.equal(local.has('sf_export_j1'), true, 'retained export metadata must survive interruption');
assert.ok(internalMessages.some(m => m.type === 'sf_export_release' && m.jobId === 'j1'));
assert.equal(internalMessages.some(m => m.type === 'sf_download_cleanup' && m.jobId === 'j1'), false, 'failed export must not delete OPFS temp');

// Retry must reuse the retained file rather than start HLS again.
const retried = await invoke({ type: 'sf_retry_export', jobId: 'j1', tabId: 7, candidateId: 'c1' });
assert.equal(retried.ok, true);
assert.ok(retried.downloadId > firstId);
assert.ok(internalMessages.some(m => m.type === 'sf_export_prepare' && m.export?.jobId === 'j1'));
assert.equal(session.get(tabKey)[0].download.state, 'saving');

// Successful retry removes OPFS temp and retained metadata.
await downloadChangedListener({ id: retried.downloadId, state: { current: 'complete' } });
assert.equal(session.get(tabKey)[0].download.state, 'complete');
assert.equal(local.has('sf_export_j1'), false);
assert.ok(internalMessages.some(m => m.type === 'sf_download_cleanup' && m.jobId === 'j1' && m.tempNames?.includes('streamforge-j1-muxed.ts')));

console.log('background export recovery tests: OK');

// 1.6.4 regression: after chrome.downloads.download() accepted the Blob URL,
// a transient failure while persisting sf_dl_<id> must NOT revoke that Blob.
const current = session.get(tabKey);
current.push({ id:'c2', title:'Export persistence race', download:{} });
session.set(tabKey,current);
const originalSessionSet = chrome.storage.session.set.bind(chrome.storage.session);
chrome.storage.session.set = async obj => {
  if (Object.keys(obj).some(k => k.startsWith('sf_dl_'))) throw new Error('simulated session storage failure');
  return originalSessionSet(obj);
};
const releaseCountBefore = internalMessages.filter(m => m.type === 'sf_export_release' && m.jobId === 'j2').length;
const ready2 = await invoke({
  type:'sf_blob_ready', target:'background', jobId:'j2', tabId:7, candidateId:'c2',
  blobUrl:'blob:test/persist-race', tempName:'streamforge-j2.ts', tempNames:['streamforge-j2.ts'],
  filename:'Race.txt', mime:'video/mp2t', bytes:123456
});
assert.equal(ready2.ok,true,'download acceptance must survive sf_dl persistence failure');
assert.equal(local.get('sf_export_j2')?.filename,'Race.ts');
assert.equal(internalMessages.filter(m => m.type === 'sf_export_release' && m.jobId === 'j2').length,releaseCountBefore,'accepted Blob must not be revoked because session metadata persistence failed');
await downloadChangedListener({id:ready2.downloadId,state:{current:'complete'}});
assert.equal(local.has('sf_export_j2'),false);
chrome.storage.session.set = originalSessionSet;
