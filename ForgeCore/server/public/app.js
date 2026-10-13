const $=s=>document.querySelector(s);
let csrf='';
let noticeTimeout;
function notify(message,error=false){const el=$('#notice');el.textContent=message;el.style.background=error?'#692f40':'#1f3b5e';el.classList.add('visible');clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>el.classList.remove('visible'),4500);}
async function api(path,{method='GET',body}={}){
 const headers={'x-forgecore-request':'1'};
 if(body!==undefined)headers['content-type']='application/json';
 if(method!=='GET'&&csrf)headers['x-forgecore-csrf']=csrf;
 const response=await fetch(path,{method,headers,credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body)});
 let data;try{data=await response.json();}catch{data={error:'Ungültige Serverantwort'};}
 if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);
 return data;
}
function node(tag,text='',klass=''){const element=document.createElement(tag);element.textContent=text;if(klass)element.className=klass;return element;}
function action(text,fn,klass='outline'){const b=node('button',text,klass);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(error){notify(error.message,true);}finally{b.disabled=false;}});return b;}
function showView(view){for(const v of ['library','tasks','settings'])$('#'+v+'View').hidden=v!==view;document.querySelectorAll('nav .tab').forEach(t=>t.classList.toggle('selected',t.dataset.view===view));if(view==='tasks')refreshJobs().catch(e=>notify(e.message,true));if(view==='settings')refreshSettings().catch(e=>notify(e.message,true));}
async function startup(){
 try{const me=await api('/api/me');csrf=me.csrf||'';$('#connection').textContent='Verbunden';
  $('#setup').hidden=me.configured;$('#login').hidden=!me.configured||me.authenticated;$('#app').hidden=!me.authenticated;
  if(me.authenticated)await refreshLibrary();
 }catch(e){$('#connection').textContent='Server nicht erreichbar';notify(e.message,true);}
}
$('#setupForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/setup',{method:'POST',body:{password:$('#setupPassword').value}});$('#setupPassword').value='';notify('Einrichtung abgeschlossen. Bitte anmelden.');await startup();}catch(err){notify(err.message,true);}});
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const result=await api('/api/auth/login',{method:'POST',body:{password:$('#loginPassword').value}});csrf=result.csrf;$('#loginPassword').value='';await startup();}catch(err){notify(err.message,true);}});
$('#logout').addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST'});csrf='';await startup();}catch(e){notify(e.message,true);}});
document.querySelectorAll('nav .tab').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('#mediaForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/media',{method:'POST',body:{kind:$('#mediaKind').value,title:$('#mediaTitle').value,year:$('#mediaYear').value||null}});$('#mediaTitle').value='';$('#mediaYear').value='';await refreshLibrary();notify('Medienprojekt angelegt.');}catch(err){notify(err.message,true);}});
$('#reloadLibrary').addEventListener('click',()=>refreshLibrary().catch(e=>notify(e.message,true)));
async function refreshLibrary(){const data=await api('/api/media');const root=$('#mediaList');root.replaceChildren();if(!data.items.length){root.append(node('p','Noch keine Filme oder Serien angelegt.'));return;}
 for(const item of data.items){const article=node('article','','entry'),top=node('div','','entryhead');top.append(node('strong',item.title+(item.year?` (${item.year})`:'')));top.append(node('span',item.kind==='series'?'Serie':'Film','muted'));article.append(top);
  const actions=node('div','','actionrow');actions.append(action('Pfadvorschau',async()=>{const info=await api(`/api/media/${item.id}/preview`);notify(info.items.map(x=>`${x.directory}: ${x.exists?'bereits vorhanden':'noch nicht vorhanden'}`).join(' · ')||'Keine Episoden');}));actions.append(action('Löschen',async()=>{if(!confirm(`„${item.title}“ samt Episoden aus ForgeCore entfernen?`))return;await api(`/api/media/${item.id}`,{method:'DELETE'});await refreshLibrary();},'danger'));actions.append(action('Metadaten prüfen',async()=>{await api('/api/jobs',{method:'POST',body:{type:'metadata_check',mediaId:item.id}});notify('Prüfung zur Warteschlange hinzugefügt.');}));article.append(actions);
  if(item.kind==='series'){
   const section=node('div','','episodes'),list=node('div');section.append(node('h3','Episoden'));
   const eps=await api(`/api/media/${item.id}/episodes`);
   for(const ep of eps.items){const row=node('div','','episode');row.append(node('strong',`S${String(ep.season).padStart(2,'0')}E${String(ep.episode).padStart(2,'0')}`));row.append(node('span',`${ep.title||'Unbenannt'} · ${ep.status}`,'muted'));row.append(action('Status',async()=>{const next=ep.status==='missing'?'available':ep.status==='available'?'ignored':'missing';await api(`/api/episodes/${ep.id}`,{method:'PATCH',body:{status:next}});await refreshLibrary();}));row.append(action('×',async()=>{if(!confirm('Episode entfernen?'))return;await api(`/api/episodes/${ep.id}`,{method:'DELETE'});await refreshLibrary();},'danger'));list.append(row);}section.append(list);
   const form=node('form','','episodeform');const season=node('label','Staffel'),episode=node('label','Episode'),title=node('label','Titel (optional)','title-field');const sn=node('input'),en=node('input'),tn=node('input');sn.type='number';sn.min='0';sn.max='999';sn.required=true;en.type='number';en.min='0';en.max='9999';en.required=true;tn.maxLength=140;season.append(sn);episode.append(en);title.append(tn);const submit=node('button','Episode hinzufügen');form.append(season,episode,title,submit);form.addEventListener('submit',async e=>{e.preventDefault();try{await api(`/api/media/${item.id}/episodes`,{method:'POST',body:{season:Number(sn.value),episode:Number(en.value),title:tn.value}});await refreshLibrary();}catch(err){notify(err.message,true);}});section.append(form);article.append(section);
  }
  root.append(article);
 }
}
$('#scanLibrary').addEventListener('click',async()=>{try{await api('/api/jobs',{method:'POST',body:{type:'library_scan'}});await refreshJobs();notify('Bibliotheksprüfung vorgemerkt.');}catch(e){notify(e.message,true);}});
$('#reloadJobs').addEventListener('click',()=>refreshJobs().catch(e=>notify(e.message,true)));
async function refreshJobs(){const data=await api('/api/jobs');const root=$('#jobsList');root.replaceChildren();if(!data.items.length){root.append(node('p','Keine Aufgaben vorhanden.'));return;}for(const job of data.items){const article=node('article','','entry');article.append(node('strong',`${job.type} · ${job.state}`));article.append(node('p',job.error||job.result||job.created_at,'muted'));const actions=node('div','','actionrow');if(job.state==='queued')actions.append(action('Abbrechen',async()=>{await api(`/api/jobs/${job.id}/cancel`,{method:'POST'});await refreshJobs();}));if(['failed','cancelled'].includes(job.state))actions.append(action('Erneut versuchen',async()=>{await api(`/api/jobs/${job.id}/retry`,{method:'POST'});await refreshJobs();}));article.append(actions);root.append(article);}}
async function refreshSettings(){const c=await api('/api/config');const entries=Object.fromEntries(c.items.map(x=>[x.key,x.value]));$('#jellyfinUrl').value=entries.jellyfin_url||'';$('#libraryLabel').value=entries.library_label||'';$('#preferredLanguage').value=entries.preferred_language||'';$('#volumeStatus').textContent=c.mediaRoot.configured?`Medienvolume: ${c.mediaRoot.readable?'lesbar':'nicht lesbar'} · Schreibrecht: ${c.mediaRoot.writeable?'vorhanden':'nicht vorhanden'}`:'Kein Medienvolume eingebunden';}
$('#settingsForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/config',{method:'PUT',body:{jellyfin_url:$('#jellyfinUrl').value,library_label:$('#libraryLabel').value,preferred_language:$('#preferredLanguage').value}});notify('Einstellungen gespeichert.');}catch(err){notify(err.message,true);}});
$('#backupDownload').addEventListener('click',async()=>{try{const data=await api('/api/backup/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download='forgecore-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}catch(err){notify(err.message,true);}});
startup();

$('#backupRestore').addEventListener('click',async()=>{
 const file=$('#backupFile').files?.[0];
 if(!file){notify('Bitte zuerst ein ForgeCore-Backup wählen.',true);return;}
 if(file.size>8*1024*1024){notify('Backup zu groß (max. 8 MiB).',true);return;}
 if(!confirm('ACHTUNG: Alle gespeicherten Film-/Serienprojekte und Einstellungen ersetzen?'))return;
 try{
  const content=JSON.parse(await file.text());
  const result=await api('/api/backup/import',{method:'POST',body:{...content,confirm:'REPLACE'}});
  notify(`${result.media} Projekte und ${result.episodes} Episoden wiederhergestellt.`);
  $('#backupFile').value='';await refreshLibrary();
 }catch(err){notify('Backup nicht importiert: '+err.message,true);}
});
