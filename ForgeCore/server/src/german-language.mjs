// ForgeCore v1.6.0: German-only audio policy. Metadata is evidence, not speech recognition.
// Missing or contradictory audio language information must never be reported as German.
import {safeFetch,parseWebUrl} from './source-security.mjs';
import {parseHls} from './source-adapters.mjs';
export const NOT_GERMAN='Gibt es noch nicht auf Deutsch';
export const isGermanLanguage=v=>/^(?:de|deu|ger)(?:[-_](?:[A-Za-z0-9]+))*$/i.test(String(v||'').trim());
export const isKnownNonGerman=v=>!!String(v||'').trim()&&!isGermanLanguage(v)&&!/^(?:und|unknown|mul|zxx)$/i.test(String(v).trim());
export const germanAudioDecision=({streams=[],manifestLanguage}={})=>{
 const audio=streams.filter(s=>s.codec_type==='audio');
 const langs=audio.map(s=>String(s.tags?.language||s.tags?.LANGUAGE||'').toLowerCase());
 if(!audio.length)return {german:false,reason:NOT_GERMAN+' (keine Audiospur)'};
 if(langs.some(isGermanLanguage))return {german:true,evidence:'ffprobe',languages:langs};
 if(langs.some(isKnownNonGerman))return {german:false,reason:NOT_GERMAN+' (Audiospur ist nicht Deutsch)',languages:langs};
 if(isGermanLanguage(manifestLanguage))return {german:true,evidence:'HLS/DASH-Audiospur',languages:langs};
 return {german:false,reason:NOT_GERMAN+' (deutsche Tonspur nicht nachweisbar)',languages:langs};
};
export async function inspectGermanSource(url,{fetcher=safeFetch}={}){
 const target=parseWebUrl(url),path=target.pathname.toLowerCase();
 if(!/\.(?:m3u8|mpd|mp4|m4v)$/.test(path))return {state:'unsupported',reason:'Nur direkte HLS-/DASH-/MP4-Quellen unterstützt'};
 if(/\.(?:mp4|m4v)$/.test(path))return {state:'unverified',reason:'Deutsch erst nach sicherer Tonspurprüfung der MP4-Datei nachweisbar'};
 try{
  const r=await fetcher(target.href,{maxBytes:1024*1024,timeout:12000});
  const text=r.body.toString('utf8');
  if(path.endsWith('.m3u8')){
   const m=parseHls(text,r.url||target.href);
   if(m.kind!=='master')return {state:'unverified',reason:'HLS ohne Sprachkennzeichnung; Prüfung der fertigen Audiospur notwendig'};
   const chosen=m.variants[0],audio=(m.audioGroups||[]).filter(g=>g.group===chosen?.audioGroup);
   if(audio.some(g=>isGermanLanguage(g.language)))return {state:'german',evidence:'HLS LANGUAGE=de'};
   if(audio.length&&audio.every(g=>isKnownNonGerman(g.language)))return {state:'not-german',reason:NOT_GERMAN};
   return {state:'unverified',reason:'HLS-Sprachinformation unvollständig'};
  }
  if(/<ContentProtection\b/i.test(text))return {state:'unsupported',reason:'Geschützter DASH-Stream wird nicht unterstützt'};
  const sets=[...text.matchAll(/<AdaptationSet\b([^>]*)>/gi)];
  const audio=sets.filter(x=>/contentType\s*=\s*["']audio["']|mimeType\s*=\s*["']audio\//i.test(x[1]));
  const langs=audio.map(x=>(x[1].match(/\blang\s*=\s*["']([^"']+)/i)||[])[1]||'');
  if(langs.some(isGermanLanguage))return {state:'german',evidence:'DASH lang=de'};
  if(langs.length&&langs.every(isKnownNonGerman))return {state:'not-german',reason:NOT_GERMAN};
  return {state:'unverified',reason:'DASH ohne eindeutige Sprachkennzeichnung'};
 }catch(error){return {state:'unverified',reason:'Deutsch derzeit nicht prüfbar: '+String(error.message||error).slice(0,100)}}
}
