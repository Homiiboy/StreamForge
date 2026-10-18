// Verify that the offscreen module has registered its message listener.
// Chrome can report an offscreen context before its module scripts are ready.
export async function waitForOffscreenReceiver(sendMessage, {attempts=12,delayMs=150,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  let lastError=null;
  for (let attempt=0;attempt<attempts;attempt++) {
    try {
      const reply=await sendMessage({type:'sf_offscreen_ping',target:'offscreen'});
      if(reply?.ok===true&&reply?.ready===true)return true;
      lastError=new Error('Offscreen-Dokument antwortet nicht mit Bereitschaftsbestätigung.');
    } catch(error) { lastError=error; }
    if(attempt<attempts-1)await sleep(delayMs);
  }
  const error=new Error('Der interne Video-Downloader ist nicht erreichbar. Öffne chrome://extensions, klicke bei StreamForge auf „Neu laden“ und versuche es erneut. Technische Ursache: '+String(lastError?.message||lastError||'Keine Antwort'));
  error.code='OFFSCREEN_NOT_READY';
  throw error;
}
