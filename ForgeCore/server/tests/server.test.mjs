import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../src/server.mjs';

test('health, status and unknown paths',async()=>{
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{
    const url='http://127.0.0.1:'+server.address().port;
    const health=await fetch(url+'/api/health');
    assert.equal(health.status,200);
    assert.deepEqual(await health.json(),{ok:true,service:'ForgeCore',version:'0.1.0'});
    assert.equal(health.headers.get('cache-control'),'no-store');
    const status=await fetch(url+'/api/status');
    assert.equal(status.status,200);
    assert.equal((await status.json()).capabilities.downloads,false);
    const missing=await fetch(url+'/api/not-found');
    assert.equal(missing.status,404);
    const invalid=await fetch(url+'/api/health',{method:'POST'});
    assert.equal(invalid.status,405);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
