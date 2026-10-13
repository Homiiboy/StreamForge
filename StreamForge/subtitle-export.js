// Conservative subtitle conversion: only unencrypted HLS WebVTT or direct WebVTT.
export function subtitleSegments(playlist,baseUrl){
  const text=String(playlist||'');
  if(!/^\s*#EXTM3U/m.test(text))throw Error('Keine gültige HLS-Untertitelplaylist');
  if(/#EXT-X-KEY:\s*METHOD=(?!NONE)/i.test(text))throw Error('Verschlüsselte Untertitel werden nicht verarbeitet');
  const segments=[];let duration=0,offset=0;
  for(const line of text.split(/\r?\n/)){
    const x=line.trim();if(x.startsWith('#EXTINF:')){duration=Number(x.slice(8).split(',')[0])||0;continue;}
    if(!x||x.startsWith('#'))continue;
    const url=new URL(x,baseUrl);
    if(!/^https?:$/.test(url.protocol))throw Error('Ungültiges Untertitelsegment');
    segments.push({url:url.href,start:offset,duration});
    offset+=duration;duration=0;
    if(segments.length>2000)throw Error('Zu viele Untertitelsegmente');
  }
  if(!segments.length)throw Error('Keine Untertitelsegmente gefunden');
  return segments;
}
function seconds(raw){
  const parts=String(raw).replace(',','.').split(':').map(Number);
  if(parts.some(x=>!Number.isFinite(x)) || parts.length<2 || parts.length>3)return NaN;
  return parts.reduce((n,x)=>n*60+x,0);
}
function stamp(value){
  let ms=Math.max(0,Math.round(value*1000));
  const hours=Math.floor(ms/3600000);ms%=3600000;
  const mins=Math.floor(ms/60000);ms%=60000;
  const secs=Math.floor(ms/1000);ms%=1000;
  return [hours,mins,secs].map(n=>String(n).padStart(2,'0')).join(':')+','+String(ms).padStart(3,'0');
}
export function parseWebVtt(vtt){
  if(!/^\uFEFF?\s*WEBVTT(?:[ \t].*)?(?:\r?\n|$)/.test(String(vtt||'')))throw Error('Keine gültige WebVTT-Untertiteldatei');
  if(/X-TIMESTAMP-MAP/i.test(vtt))throw Error('WebVTT mit MPEGTS-Zeitbasis wird nicht automatisch umgerechnet');
  const cues=[];
  for(const block of String(vtt).replace(/\r/g,'').split(/\n\s*\n/)){
    const lines=block.trim().split('\n');
    const idx=lines.findIndex(line=>/-->/.test(line));
    if(idx<0)continue;
    const m=lines[idx].match(/^\s*((?:\d+:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}\.\d{3})/);
    if(!m)continue;
    const start=seconds(m[1]),end=seconds(m[2]),content=lines.slice(idx+1).join('\n').trim();
    if(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&content)cues.push({start,end,text:content});
  }
  return cues;
}
export function mergeWebVttToSrt(fragments){
  const all=[];
  for(const frag of fragments){
    const cues=parseWebVtt(frag.text);
    const first=cues[0]?.start??0;
    const shift=frag.start>0 && first<frag.start-0.5?frag.start:0;
    for(const c of cues)all.push({start:c.start+shift,end:c.end+shift,text:c.text});
  }
  all.sort((a,b)=>a.start-b.start||a.end-b.end);
  const seen=new Set(),dedup=[];
  for(const c of all){const key=c.start.toFixed(3)+'|'+c.end.toFixed(3)+'|'+c.text;if(!seen.has(key)){seen.add(key);dedup.push(c);}}
  if(!dedup.length)throw Error('Keine gültigen WebVTT-Zeitstempel gefunden');
  return dedup.map((c,i)=>String(i+1)+'\n'+stamp(c.start)+' --> '+stamp(c.end)+'\n'+c.text).join('\n\n')+'\n';
}
