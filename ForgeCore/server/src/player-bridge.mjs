import {parseWebUrl,safeFetch} from './source-security.mjs';

const directMedia=/\.(?:mp4|m4v|m3u8|mpd)(?:$)/i;
const hostnameLabel=host=>({
 'voe.sx':'VOE','doodstream.com':'Doodstream','filemoon.sx':'Filemoon','vidmoly.to':'Vidmoly'
}[host]||host);
const htmlDecode=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;/gi,"'");
function candidate(raw,base,kind){
 let url;try{url=parseWebUrl(new URL(htmlDecode(raw),base).href)}catch{return null}
 if(url.searchParams.has('token')||url.searchParams.has('key'))return null;
 const host=url.hostname.replace(/^www\./,'').toLowerCase();
 return {url:url.href,hoster:hostnameLabel(host).slice(0,100),kind};
}
/** HTML-only, no script interpretation, no external requests, no stream extraction. */
export function discoverPlayers(html,base,{max=30}={}){
 const results=[],seen=new Set();
 const add=(raw,kind)=>{
  const item=candidate(raw,base,kind);
  if(!item||seen.has(item.url)||results.length>=max)return;
  const baseOrigin=new URL(base).origin;
  if(kind==='direct'&&!directMedia.test(new URL(item.url).pathname))return;
  if(kind==='player'&&new URL(item.url).origin===baseOrigin)return;
  seen.add(item.url);results.push(item);
 };
 for(const m of String(html).slice(0,2*1024*1024).matchAll(/<(iframe|a|video|source)\b([^>]*?)>/gi)){
  const tag=m[1].toLowerCase(),attrs=m[2];
  const raw=attrs.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1];
  if(!raw)continue;
  const check=candidate(raw,base,'player');if(!check)continue;
  if(directMedia.test(new URL(check.url).pathname))add(raw,'direct');
  else if(tag==='iframe'||(tag==='a'&&/(?:embed|player|watch|stream|hoster|redirect)/i.test(attrs+' '+check.url)))add(raw,'player');
 }
 return results;
}
export async function inspectPlayerPage(db,{siteId,url},{fetcher=safeFetch}={}){
 if(typeof siteId!=='string'||typeof url!=='string')throw Object.assign(Error('Ungültige PlayerBridge-Anfrage'),{status:400});
 const site=db.prepare('SELECT id,url FROM search_sites WHERE id=? AND enabled=1').get(siteId);
 if(!site)throw Object.assign(Error('Gespeicherte Website nicht vorhanden'),{status:404});
 const root=parseWebUrl(site.url),target=parseWebUrl(url);
 if(target.origin!==root.origin)throw Object.assign(Error('Episodenseite muss zur Website gehören'),{status:400});
 const response=await fetcher(target.href,{maxBytes:2*1024*1024,timeout:12000});
 const final=parseWebUrl(response.url);
 if(final.origin!==root.origin)throw Object.assign(Error('Website hat auf fremde Domain weitergeleitet'),{status:400});
 const items=discoverPlayers(response.body.toString('utf8'),final.href);
 return {url:final.href,players:items,counts:{external:items.filter(i=>i.kind==='player').length,direct:items.filter(i=>i.kind==='direct').length},notice:'Externe Player sind nur Wiedergabelinks. ForgeCore extrahiert keine Hosterstreams oder Schutzmechanismen.'};
}
