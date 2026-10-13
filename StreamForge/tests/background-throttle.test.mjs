import assert from 'node:assert/strict';

const store = new Map();
const key = 'sf_tab_7';
store.set(key, [{ id: 'c1', title: 'Test' }]);
let storageSets = 0;
let badgeCalls = 0;
let runtimeListener = null;
const noopEvent = { addListener() {} };

function clone(v) { return structuredClone(v); }

globalThis.chrome = {
  runtime: {
    id: 'test-extension',
    onMessage: { addListener(fn) { runtimeListener = fn; } },
    getURL: p => `chrome-extension://test-extension/${p}`,
    getContexts: async () => [],
    sendMessage: async () => ({ ok: true })
  },
  declarativeNetRequest: {
    getSessionRules: async () => [],
    updateSessionRules: async () => {}
  },
  storage: { session: {
    async get(keys) {
      if (typeof keys === 'string') return { [keys]: clone(store.get(keys)) };
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter(k => store.has(k)).map(k => [k, clone(store.get(k))]));
      return {};
    },
    async set(obj) { storageSets++; for (const [k,v] of Object.entries(obj)) store.set(k, clone(v)); },
    async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) store.delete(k); }
  }},
  action: {
    async setBadgeText() { badgeCalls++; },
    async setBadgeBackgroundColor() { badgeCalls++; }
  },
  cookies: {
    async getAllCookieStores() { return []; },
    async getAll() { return []; },
    async getPartitionKey() { return null; }
  },
  permissions: { async contains() { return true; } },
  downloads: { download: async () => 1, onChanged: noopEvent },
  offscreen: { async createDocument() {} },
  tabs: { get: async () => ({ url: 'https://example.test', title: 'Test' }), create: async () => ({}), onRemoved: noopEvent, onUpdated: noopEvent },
  webRequest: { onBeforeSendHeaders: noopEvent, onHeadersReceived: noopEvent }
};

await import(`../background.js?throttle-test=${Date.now()}`);
assert.equal(typeof runtimeListener, 'function');

function sendProgress(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ret = runtimeListener(message, {}, response => { settled = true; resolve(response); });
    if (!ret && !settled) reject(new Error('listener did not keep response channel open'));
  });
}

for (let i = 0; i < 25; i++) {
  const response = await sendProgress({
    type: 'sf_download_progress', target: 'background',
    jobId: 'j1', tabId: 7, candidateId: 'c1', state: 'downloading',
    progress: i, downloadProgress: i, muxProgress: Math.max(0, i - 2),
    speedBps: 2_000_000 + i, segmentDone: i, segmentTotal: 100
  });
  assert.equal(response?.ok, true);
  assert.equal(response?.queued, true);
}

// The 25 hot-path updates must coalesce into one storage write and must not
// touch the action badge at all.
await new Promise(r => setTimeout(r, 1050));
assert.equal(storageSets, 1, `expected 1 coalesced storage write, got ${storageSets}`);
assert.equal(badgeCalls, 0, `progress status must not update badge (calls=${badgeCalls})`);
const saved = store.get(key)?.[0]?.download;
assert.equal(saved?.progress, 24);
assert.equal(saved?.segmentDone, 24);

// Diagnostics stay immediate instead of waiting for the throttle timer.
const before = storageSets;
const errorResponse = await sendProgress({
  type: 'sf_download_progress', target: 'background', jobId: 'j1', tabId: 7, candidateId: 'c1',
  state: 'error', progress: 24, message: 'HTTP 503', diagnostic: { code: 'HTTP_503', title: 'Serverfehler' }
});
assert.equal(errorResponse?.ok, true);
assert.equal(storageSets, before + 1);
assert.equal(store.get(key)?.[0]?.download?.state, 'error');
assert.equal(store.get(key)?.[0]?.download?.diagnostics?.[0]?.code, 'HTTP_503');

console.log('background progress throttle tests: OK');
