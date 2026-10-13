import assert from 'node:assert/strict';

const store = new Map();
const tabKey = 'sf_tab_7';
const candidate = {
  id: 'h1', kind: 'hls', url: 'https://cdn.example.test/stream.m3u8', host: 'cdn.example.test',
  pageUrl: 'https://page.example.test/watch', frameUrl: 'https://page.example.test/watch',
  referer: 'https://page.example.test/watch', origin: 'https://page.example.test', requestProfile: {}, frameId: 0,
  title: 'Test', firstSeen: Date.now(), lastSeen: Date.now(), hits: 1
};
store.set(tabKey, [structuredClone(candidate)]);
let runtimeListener = null;
let fetchCalls = 0;
const noopEvent = { addListener() {} };
const clone = v => structuredClone(v);

globalThis.fetch = async () => {
  fetchCalls++;
  // Keep this request in flight briefly so two sf_probe messages overlap.
  await new Promise(r => setTimeout(r, 25));
  return {
    ok: true, status: 200,
    async text() { return '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg-1.ts\n#EXT-X-ENDLIST\n'; }
  };
};

globalThis.chrome = {
  runtime: {
    id: 'test-extension',
    onMessage: { addListener(fn) { runtimeListener = fn; } },
    getURL: p => `chrome-extension://test-extension/${p}`,
    getContexts: async () => [],
    sendMessage: async () => ({ ok: true })
  },
  declarativeNetRequest: { getSessionRules: async () => [], updateSessionRules: async () => {} },
  storage: { session: {
    async get(keys) {
      if (typeof keys === 'string') return { [keys]: clone(store.get(keys)) };
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter(k => store.has(k)).map(k => [k, clone(store.get(k))]));
      return {};
    },
    async set(obj) { for (const [k,v] of Object.entries(obj)) store.set(k, clone(v)); },
    async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) store.delete(k); }
  }},
  action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
  cookies: { async getAllCookieStores() { return []; }, async getAll() { return []; }, async getPartitionKey() { return null; } },
  permissions: { async contains() { return true; } },
  downloads: { async download() { return 1; }, onChanged: noopEvent },
  offscreen: { async createDocument() {} },
  tabs: { get: async () => ({ url: candidate.pageUrl, title: 'Test' }), create: async () => ({}), onRemoved: noopEvent, onUpdated: noopEvent },
  webRequest: { onBeforeSendHeaders: noopEvent, onHeadersReceived: noopEvent }
};

await import(`../background.js?probe-test=${Date.now()}`);
assert.equal(typeof runtimeListener, 'function');

function invoke(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ret = runtimeListener(message, {}, response => { settled = true; resolve(response); });
    if (!ret && !settled) reject(new Error('message not handled'));
  });
}

const [a,b] = await Promise.all([
  invoke({ type:'sf_probe', tabId:7, candidate: structuredClone(candidate) }),
  invoke({ type:'sf_probe', tabId:7, candidate: structuredClone(candidate) })
]);
assert.equal(a.ok, true);
assert.equal(b.ok, true);
assert.equal(fetchCalls, 1, 'same manifest should only be fetched once while a probe is in-flight');
assert.equal(a.probe.playlistType, 'media');
assert.equal(a.probe.summary, 'HLS · bereit');
assert.equal(store.get(tabKey)[0].probe.summary, 'HLS · bereit');
assert.equal(store.get(tabKey)[0].probeRetryAfter, 0);

console.log('background probe tests: OK');
