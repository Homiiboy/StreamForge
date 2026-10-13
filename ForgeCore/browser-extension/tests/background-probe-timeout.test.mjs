import assert from 'node:assert/strict';

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
// Scale timers so the production 7s/10s quick-probe timeout can be tested fast.
globalThis.setTimeout = (fn, ms = 0, ...args) => realSetTimeout(fn, Math.max(1, Math.round(Number(ms || 0) / 100)), ...args);
globalThis.clearTimeout = id => realClearTimeout(id);

const store = new Map();
const tabKey = 'sf_tab_9';
const candidate = { id:'h1',kind:'hls',url:'https://stall.example.test/a.m3u8',host:'stall.example.test',pageUrl:'https://page.example.test',frameUrl:'https://page.example.test',referer:'https://page.example.test',origin:'https://page.example.test',requestProfile:{},frameId:0,title:'Stall',hits:1 };
store.set(tabKey,[structuredClone(candidate)]);
let runtimeListener=null;
let fetchCalls=0;
const noopEvent={addListener(){}};
const clone=v=>structuredClone(v);

globalThis.fetch = async (_url, options={}) => {
  fetchCalls++;
  return {
    ok:true,status:200,
    text(){
      return new Promise((_,reject)=>{
        options.signal?.addEventListener('abort',()=>{const e=new Error('aborted body');e.name='AbortError';reject(e);},{once:true});
      });
    }
  };
};

globalThis.chrome={
  runtime:{id:'test-extension',onMessage:{addListener(fn){runtimeListener=fn;}},getURL:p=>`chrome-extension://test-extension/${p}`,getContexts:async()=>[],sendMessage:async()=>({ok:true})},
  declarativeNetRequest:{getSessionRules:async()=>[],updateSessionRules:async()=>{}},
  storage:{session:{async get(k){if(typeof k==='string')return{[k]:clone(store.get(k))};return{};},async set(o){for(const [k,v] of Object.entries(o))store.set(k,clone(v));},async remove(){}}},
  action:{async setBadgeText(){},async setBadgeBackgroundColor(){}},
  cookies:{async getAllCookieStores(){return[];},async getAll(){return[];},async getPartitionKey(){return null;}},
  permissions:{async contains(){return true;}},
  downloads:{async download(){return 1;},onChanged:noopEvent},offscreen:{async createDocument(){}},
  tabs:{get:async()=>({url:candidate.pageUrl,title:'Stall'}),create:async()=>({}),onRemoved:noopEvent,onUpdated:noopEvent},
  webRequest:{onBeforeSendHeaders:noopEvent,onHeadersReceived:noopEvent}
};

await import(`../background.js?probe-timeout=${Date.now()}`);
function invoke(message){return new Promise((resolve,reject)=>{let settled=false;const ret=runtimeListener(message,{},r=>{settled=true;resolve(r);});if(!ret&&!settled)reject(new Error('not handled'));});}
const started=Date.now();
const result=await invoke({type:'sf_probe',tabId:9,candidate});
const elapsed=Date.now()-started;
assert.equal(result.ok,false);
assert.match(result.error,/Timeout|Zeitüberschreitung|abgebrochen/i);
assert.equal(fetchCalls,2,'quick probe should stop after two attempts');
assert.ok(elapsed<1000,`scaled body-timeout test should finish quickly, got ${elapsed}ms`);
assert.ok(Number(store.get(tabKey)[0].probeRetryAfter||0)>Date.now());

globalThis.setTimeout=realSetTimeout;
globalThis.clearTimeout=realClearTimeout;
console.log('background probe body-timeout tests: OK');
