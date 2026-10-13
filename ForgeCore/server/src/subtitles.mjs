import {join,relative,sep,resolve} from 'node:path';
import {open,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {safeFetch} from './source-security.mjs';
import {mediaBaseName,previewLibrary,ensureWithin} from './library.mjs';

export function vttToSrt(raw){
 const text=String(raw||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if(!/^WEBVTT(?:\s|$)/.test(text))throw Error('Expected WebVTT subtitles');
 const cues=text.replace(/^WEBVTT[^\n]*\n/,'').split(/\n\s*\n/);
 const blocks=[];
 for(const group of cues){
  const lines=group.split('\n').map(x=>x.trim()).filter(Boolean);
  if(!lines.length||/^(?:NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0]))continue;
  const index=lines.findIndex(x=>x.includes('-->'));
  if(index<0)continue;
  const timing=lines[index].match(/^(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})(?:\s.*)?$/);
  if(!timing)continue;
  const ts=(h,m,s,ms)=>`${h||'00'}:${m}:${s},${ms}`;
  const clean=lines.slice(index+1).join('\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  if(!clean.trim())continue;
  blocks.push(`${blocks.length+1}\n${ts(timing[1],timing[2],timing[3],timing[4])} --> ${ts(timing[5],timing[6],timing[7],timing[8])}\n${clean}`);
 }
 if(!blocks.length)throw Error('No valid subtitle cues');
 return blocks.join('\n\n')+'\n';
}
export function normalizeLanguage(language){
 const normalized=String(language||'').trim().toLowerCase();
 if(!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(normalized))throw Object.assign(Error('Invalid subtitle language'),{status:400});
 return normalized;
}
export async function downloadSubtitle({url,root,media,episode=null,language='de',fetcher=safeFetch}={}){
 if(!root)throw Error('Media root not configured');
 const lang=normalizeLanguage(language);
 const preview=await previewLibrary(root,media,episode);
 const base=mediaBaseName(media,episode);
 const dir=ensureWithin(root,join(root,preview.directory));
 // Export only alongside an existing movie/episode: no writing to arbitrary source folders.
 if(!preview.exists)throw Object.assign(Error('Media file must already exist before subtitle export'),{status:409});
 const output=ensureWithin(root,join(dir,base+'.'+lang+'.srt'));
 const result=await fetcher(url,{maxBytes:4*1024*1024});
 const body=vttToSrt(result.body.toString('utf8'));
 const file=await open(output,'wx',0o600); // exclusive create, refuse existing subtitles
 try{await file.writeFile(body);await file.sync();}finally{await file.close()}
 return {path:relative(resolve(root),output).split(sep).join('/'),bytes:(await stat(output)).size,language:lang};
}
