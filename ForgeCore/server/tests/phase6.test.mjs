import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.mjs';
import {openDatabase,newId,utc} from '../src/db.mjs';
import {parseHtmlDataEpisodes,selectSourceAdapter,analyzeSource} from '../src/source-adapters.mjs';
import {validateJellyfinConfig,saveJellyfin,getJellyfinStatus,jellyfinTest} from '../src/jellyfin.mjs';
import {reconcilePreview,applyReconciliation} from '../src/jellyfin-sync.mjs';

test('trusted HTML data-season adapter recognizes attributed episodes only',async()=>{
 const html='<a data-season="2" data-episode="8" href="/slugterra-8.m3u8">Eight</a><a href="/unassigned.m3u8">Unknown</a><a data-season="2" data-episode="9" href="javascript:alert(1)">Unsafe</a>';
 const items=parseHtmlDataEpisodes(html,'https://example.org/show');
 assert.equal(items.length,1);
 assert.equal(items[0].season,2);assert.equal(items[0].episode,8);
 assert.equal(selectSourceAdapter('html-episode-data'),'html-episode-data');
 assert.throws(()=>selectSourceAdapter('eval'),/Unsupported/);
 const found=await analyzeSource('https://example.org/show',{adapter:'html-episode-data',fetcher:async u=>({url:u,body:Buffer.from(html)})});
 assert.equal(found.adapter,'html-episode-data');assert.equal(found.items.length,1);
});
test('Jellyfin settings require a key and never return it from status',()=>{
 const db=openDatabase();
 try{
  assert.throws(()=>validateJellyfinConfig({url:'file:///etc/passwd',apiKey:'abcdefghijklm'}),/Jellyfin/);
  assert.throws(()=>validateJellyfinConfig({url:'http://user:pass@localhost:8096/',apiKey:'abcdefghijklm'}),/Jellyfin/);
  assert.throws(()=>validateJellyfinConfig({url:'http://localhost:8096/',apiKey:'short'}),/key/);
  const status=saveJellyfin(db,{url:'http://127.0.0.1:8096/',apiKey:'phase6-test-secret-1234'});
  assert.equal(status.configured,true);
  assert.ok(!JSON.stringify(getJellyfinStatus(db)).includes('phase6-test-secret-1234'));
 }finally{db.close()}
});
test('conservative Jellyfin reconciliation never marks unlisted episodes absent',()=>{
 const db=openDatabase(),now=utc(),series=newId(),e1=newId(),e2=newId();
 try{
  db.prepare('INSERT INTO media(id,kind,title,created_at,updated_at) VALUES(?,?,?,?,?)').run(series,'series','Slugterra',now,now);
  const add=db.prepare('INSERT INTO episodes(id,media_id,season,episode,title,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
  add.run(e1,series,2,8,'Episode Eight',now,now);add.run(e2,series,2,9,'Episode Nine',now,now);
  const preview=reconcilePreview(db,[{Type:'Episode',SeriesName:'Slugterra',ParentIndexNumber:2,IndexNumber:8,Name:'Eight'}]);
  assert.equal(preview.availableToMark,1);
  const done=applyReconciliation(db,preview);assert.equal(done.updated,1);
  assert.equal(db.prepare('SELECT status FROM episodes WHERE id=?').get(e1).status,'available');
  assert.equal(db.prepare('SELECT status FROM episodes WHERE id=?').get(e2).status,'missing');
  assert.equal(applyReconciliation(db,reconcilePreview(db,[{Type:'Episode',SeriesName:'Slugterra',ParentIndexNumber:2,IndexNumber:8}])).updated,0);
 }finally{db.close()}
});
test('authenticated Jellyfin HTTP API can test, preview and confirm non-destructive sync',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forgecore-phase6-')),requests=[];
 const fetcher=async(url,{method,headers})=>{
  requests.push({url,method,secret:headers['X-Emby-Token']});
  const response=url.includes('/System/Info')?{ServerName:'Home Jellyfin',Version:'10.11'}:{Items:[{Type:'Episode',SeriesName:'Slugterra',ParentIndexNumber:2,IndexNumber:8,Name:'Episode 8'}],TotalRecordCount:1};
  return {ok:true,json:async()=>response};
 };
 const app=createApp({dbPath:join(dir,'db.sqlite'),mediaRoot:dir,startWorker:false,jellyfinFetch:fetcher,staticFiles:false});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;let cookie='',csrf='';
 async function request(path,method='GET',body){
  const headers={'x-forgecore-request':'1',...(body?{'content-type':'application/json'}:{}),...(csrf?{'x-forgecore-csrf':csrf}:{}),...(cookie?{cookie}:{})};
  const res=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});
  const data=await res.json();if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];if(data.csrf)csrf=data.csrf;
  return {status:res.status,data};
 }
 try{
  assert.equal((await request('/api/jellyfin')).status,401);
  await request('/api/setup','POST',{password:'test phase six secure password'});
  await request('/api/auth/login','POST',{password:'test phase six secure password'});
  const series=(await request('/api/media','POST',{kind:'series',title:'Slugterra'})).data.item;
  const episode=(await request('/api/media/'+series.id+'/episodes','POST',{season:2,episode:8,title:'Episode 8'})).data.item;
  assert.equal((await request('/api/jellyfin','PUT',{url:'http://127.0.0.1:8096/',apiKey:'test-jellyfin-key-123'})).status,200);
  assert.ok(!JSON.stringify((await request('/api/jellyfin')).data).includes('test-jellyfin-key-123'));
  assert.ok(!JSON.stringify((await request('/api/config')).data).includes('test-jellyfin-key-123'));
  assert.ok(!JSON.stringify((await request('/api/backup/export')).data).includes('test-jellyfin-key-123'));
  assert.equal((await request('/api/jellyfin/test','POST')).data.serverName,'Home Jellyfin');
  assert.equal((await request('/api/jellyfin/sync/preview','POST')).data.availableToMark,1);
  assert.equal((await request('/api/jellyfin/sync/apply','POST',{confirm:'NO'})).status,400);
  assert.equal((await request('/api/jellyfin/sync/apply','POST',{confirm:'MARK_AVAILABLE'})).data.updated,1);
  assert.equal((await request('/api/media/'+series.id+'/episodes')).data.items[0].status,'available');
  assert.equal((await request('/api/jellyfin/refresh','POST')).status,200);
  assert.ok(requests.some(r=>r.method==='POST'&&r.url.includes('/Library/Refresh')));
  assert.ok(requests.every(r=>r.secret==='test-jellyfin-key-123'));
 }finally{await app.close();await rm(dir,{recursive:true,force:true})}
});
