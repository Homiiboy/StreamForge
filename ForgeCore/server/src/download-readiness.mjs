// Read-only preflight: is the ForgeCore container ready to SAVE a legitimate
// German media source once one is found? Never downloads, probes or opens URLs.
import {spawn} from 'node:child_process';
import {checkMediaRoot} from './library.mjs';
export async function commandReady(binary,{spawnCommand=spawn}={}){
 return new Promise(resolve=>{
  let finished=false;
  const done=value=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value)};
  let child;
  const timer=setTimeout(()=>{try{child?.kill('SIGKILL')}catch{}done(false)},2800);
  try{
   child=spawnCommand(binary,['-version'],{stdio:'ignore',shell:false});
   child.on('error',()=>done(false));
   child.on('exit',code=>done(code===0));
  }catch{done(false)}
 });
}
export async function downloadReadiness({mediaRoot=process.env.FORGECORE_MEDIA_ROOT||'',
 inspectRoot=checkMediaRoot,probe=commandReady}={}){
 const [root,ffmpeg,ffprobe]=await Promise.all([
  inspectRoot(mediaRoot),probe('ffmpeg'),probe('ffprobe')
 ]);
 const storage=!!root.configured&&!!root.readable&&!!root.writeable;
 const ready=storage&&ffmpeg&&ffprobe;
 const checks={storage,ffmpeg,ffprobe};
 const notices=[];
 if(!root.configured)notices.push('Kein Medienordner konfiguriert.');
 else if(!storage)notices.push('Jellyfin-Medienordner ist im ForgeCore-Container nicht beschreibbar.');
 if(!ffmpeg||!ffprobe)notices.push('FFmpeg oder FFprobe fehlen im ForgeCore-Container.');
 if(ready)notices.push('Speicher und Medienwerkzeuge sind bereit. Es wird weiterhin eine zulässige direkte Medienquelle mit deutscher Tonspur benötigt.');
 return {ready,checks,notices};
}
