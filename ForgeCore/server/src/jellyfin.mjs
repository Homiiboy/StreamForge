import http from 'node:http';
import https from 'node:https';
import {URL} from 'node:url';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export function validateJellyfinConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid Jellyfin settings');
 let url;try{url=new URL(String(input.url||''))}catch{fail('Invalid Jellyfin URL')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')fail('Jellyfin URL must be a server origin');
 if(!url.hostname||url.href.length>300||url.hostname.includes('%'))fail('Invalid Jellyfin host');
 const apiKey=String(input.apiKey||'').trim();
 if(!/^[a-zA-Z0-9_-]{12,256}$/.test(apiKey))fail('Invalid Jellyfin API key');
 return {url:url.origin,apiKey};
}
export function getJellyfinStatus(db){
 const url=db.prepare("SELECT value FROM config WHERE key='jellyfin_url'").get()?.value||'';
 const key=db.prepare("SELECT value FROM config WHERE key='jellyfin_api_key'").get()?.value||'';
 return {configured:!!url&&!!key,url:url||null,apiKeyConfigured:!!key,autoRefresh:db.prepare("SELECT value FROM config WHERE key='jellyfin_auto_refresh'").get()?.value==='1'};
}
export function credentials(db){
 const url=db.prepare("SELECT value FROM config WHERE key='jellyfin_url'").get()?.value||'';
 const apiKey=db.prepare("SELECT value FROM config WHERE key='jellyfin_api_key'").get()?.value||'';
 if(!url||!apiKey)fail('Configure Jellyfin first',409);
 return {url,apiKey};
}
export function saveJellyfin(db,input){
 const {url,apiKey}=validateJellyfinConfig(input);
 const query=db.prepare('INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
 query.run('jellyfin_url',url);query.run('jellyfin_api_key',apiKey);query.run('jellyfin_auto_refresh',input.autoRefresh===true?'1':'0');
 return getJellyfinStatus(db);
}
export async function jellyfinRequest({url,apiKey},path,{method='GET',fetcher,timeout=8000}={}){
 const base=new URL(url);
 if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.pathname!=='/')fail('Invalid Jellyfin origin');
 if(!['/System/Info','/Library/Refresh'].includes(path)&&!/^\/Items\?Recursive=true&IncludeItemTypes=(?:Episode|Movie|Series)(?:&StartIndex=\d{1,5})?(?:&Limit=\d{1,3})?$/.test(path))fail('Unsupported Jellyfin operation');
 const target=new URL(path.slice(1),base.href);
 if(fetcher){
  const response=await fetcher(target.href,{method,headers:{'X-Emby-Token':apiKey},redirect:'error'});
  if(!response.ok)throw Error('Jellyfin HTTP '+response.status);
  return method==='POST'?{ok:true}:response.json();
 }
 const transport=base.protocol==='https:'?https:http;
 return await new Promise((resolve,reject)=>{
  const req=transport.request(target,{method,headers:{'X-Emby-Token':apiKey,'User-Agent':'ForgeCore/0.5.9','Accept':'application/json'},timeout},async res=>{
   const status=res.statusCode||0;
   if(status<200||status>=300){res.resume();reject(Error('Jellyfin HTTP '+status));return}
   if(method==='POST'){res.resume();resolve({ok:true});return}
   let size=0;const chunks=[];
   try{for await(const chunk of res){size+=chunk.length;if(size>2*1024*1024)throw Error('Jellyfin response too large');chunks.push(chunk)}
    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
   }catch(error){reject(error)}
  });
  req.once('timeout',()=>req.destroy(Error('Jellyfin timed out')));
  req.once('error',reject);req.end();
 });
}
export async function jellyfinTest(db,opts={}){
 const result=await jellyfinRequest(credentials(db),'/System/Info',opts);
 return {connected:true,serverName:String(result.ServerName||'').slice(0,120),serverVersion:String(result.Version||'').slice(0,70)};
}
export async function jellyfinRefresh(db,opts={}){
 return jellyfinRequest(credentials(db),'/Library/Refresh',{...opts,method:'POST'});
}
