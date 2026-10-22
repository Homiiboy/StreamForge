import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import {isIP} from 'node:net';

export function isPublicIP(ip){
  if(isIP(ip)===4){const v=ip.split('.').map(Number);const [a,b,c]=v;return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0&&c===0||a===192&&b===0&&c===2||a===198&&(b===18||b===19)||a===198&&b===51&&c===100||a===203&&b===0&&c===113||a===255);}
  if(isIP(ip)===6){const str=ip.toLowerCase();return !(str==='::'||str==='::1'||str.startsWith('fe80:')||str.startsWith('fc')||str.startsWith('fd')||str.startsWith('ff')||str.startsWith('2001:db8:')||str.startsWith('::ffff:'))}
  return false;
}
export function parseWebUrl(raw){
 let u;try{u=new URL(String(raw));}catch{throw Error('Invalid source URL');}
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.hash||u.hostname.endsWith('.')||u.hostname.includes('%'))throw Error('Unsafe source URL');
 if(!u.hostname||u.href.length>2048)throw Error('Invalid source URL');
 return u;
}
export async function authorizeUrl(raw,{allowPrivate=false,lookup=dns.lookup}={}){
 const u=parseWebUrl(raw);
 if(u.port&&!['80','443'].includes(u.port))throw Error('Nonstandard ports are not allowed');
 if(!allowPrivate && (u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')))throw Error('Local hosts are blocked');
 const ips=isIP(u.hostname)?[{address:u.hostname,family:isIP(u.hostname)}]:await lookup(u.hostname,{all:true,verbatim:true});
 if(!ips.length||ips.some(x=>!allowPrivate&&!isPublicIP(x.address)))throw Error('Private or non-public address is blocked');
 return {url:u,ip:ips[0].address,family:ips[0].family};
}
/** Honor Node's dns.lookup callback contract for single and all-address callers. */
export function pinnedLookup(ip,family){
 if(!isIP(ip)||isIP(ip)!==family)throw Error('Invalid pinned DNS address');
 return (_hostname,options,callback)=>{
  if(typeof options==='function'){callback=options;options={};}
  if(options?.all)callback(null,[{address:ip,family}]);
  else callback(null,ip,family);
 };
}
/** Requests connect to the already verified IP, preserving Host and SNI; redirects get reauthorized. */
export async function safeStream(raw,{maxBytes=48*1024*1024,timeout=15000,allowPrivate=false,lookup=dns.lookup,redirects=3,onChunk=async()=>{},signal}={}){
 let current=raw;
 for(let n=0;n<=redirects;n++){
  if(signal?.aborted)throw Error('Source request aborted');
  const {url,ip,family}=await authorizeUrl(current,{allowPrivate,lookup});
  const library=url.protocol==='https:'?https:http;
  const response=await new Promise((resolve,reject)=>{
   const req=library.request(url,{method:'GET',lookup:pinnedLookup(ip,family),headers:{'user-agent':'ForgeCore/0.1.9 (authorized-source-client)','accept':'application/vnd.apple.mpegurl,application/dash+xml,text/html,video/*,*/*;q=0.5','accept-encoding':'identity'},timeout},resolve);
   const abort=()=>req.destroy(Error('Source request aborted'));
   signal?.addEventListener('abort',abort,{once:true});
   req.once('error',reject);req.once('timeout',()=>req.destroy(Error('Source request timed out')));
   req.once('close',()=>signal?.removeEventListener('abort',abort));req.end();
  });
  const status=response.statusCode||0;
  if([301,302,303,307,308].includes(status)){
   response.resume();if(!response.headers.location)throw Error('Redirect missing location');
   current=new URL(response.headers.location,url).href;continue;
  }
  if(status!==200){response.destroy();throw Error('Source HTTP '+status)}
  const len=Number(response.headers['content-length']);if(len>maxBytes){response.destroy();throw Error('Source content exceeds limit')}
  let bytes=0;
  try{
   for await(const chunk of response){
    if(signal?.aborted)throw Error('Source request aborted');
    bytes+=chunk.length;if(bytes>maxBytes)throw Error('Source content exceeds limit');
    await onChunk(chunk);
   }
  }catch(error){response.destroy();throw error}
  return {url:url.href,bytes,contentType:String(response.headers['content-type']||'')};
 }
 throw Error('Too many source redirects');
}
export async function safeFetch(raw,opts={}){
 const chunks=[];
 const result=await safeStream(raw,{...opts,onChunk:chunk=>{chunks.push(chunk)}});
 return {...result,body:Buffer.concat(chunks)};
}
