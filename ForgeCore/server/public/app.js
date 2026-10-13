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
function showView(view){for(const v of ['library','tasks','settings'])$('#'+v+'View').hidden=v!==view;document.querySelectorAll('nav .tab').forEach(t=>t.classList.toggle('selected',t.dataset.view===view));if(view==='tasks'){refreshJobs().catch(e=>notify(e.message,true));refreshTransfers().catch(e=>notify(e.message,true));refreshNotices().catch(e=>notify(e.message,true));refreshDiagnostics().catch(e=>notify(e.message,true));}if(view==='settings'){refreshSettings().catch(e=>notify(e.message,true));refreshSchedule().catch(e=>notify(e.message,true));}}
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
  const sourcesBox=node('section','','sourceManagement');
  sourcesBox.append(node('h3','Quellen & Stream-Downloads'));
  const sourceForm=node('form','','sourceForm');
  const urlInput=node('input');urlInput.type='url';urlInput.required=true;urlInput.placeholder='https://example.org/serie.m3u8 oder Episodenliste';urlInput.maxLength=2048;urlInput.setAttribute('aria-label','Quell-URL');
  const sourceLabel=node('input');sourceLabel.placeholder='Quellenname (optional)';sourceLabel.maxLength=140;sourceLabel.setAttribute('aria-label','Quellenname');
  const sourceSubmit=node('button','Quelle hinzufügen');
  sourceForm.append(urlInput,sourceLabel,sourceSubmit);
  sourceForm.addEventListener('submit',async e=>{e.preventDefault();try{
    await api('/api/media/'+item.id+'/sources',{method:'POST',body:{url:urlInput.value,label:sourceLabel.value}});
    await refreshLibrary();notify('Quelle gespeichert.');
  }catch(err){notify(err.message,true);}});
  sourcesBox.append(sourceForm);
  const sourceData=await api('/api/media/'+item.id+'/sources');
  const episodesForChoice=item.kind==='series'?(await api('/api/media/'+item.id+'/episodes')).items:[];
  const subtitleForm=node('form','','sourceForm');
  const subtitleUrl=node('input');subtitleUrl.type='url';subtitleUrl.required=true;subtitleUrl.placeholder='WebVTT-Untertitel-URL (.vtt)';subtitleUrl.setAttribute('aria-label','WebVTT-Untertiteladresse');
  const subtitleLang=node('input');subtitleLang.value='de';subtitleLang.maxLength=15;subtitleLang.placeholder='Sprache z. B. de';subtitleLang.setAttribute('aria-label','Untertitelsprache');
  const subtitleSelect=node('select');subtitleSelect.setAttribute('aria-label','Episode für Untertitel');
  if(item.kind==='series'){
   const opt=node('option','Episode wählen');opt.value='';subtitleSelect.append(opt);
   for(const ep of episodesForChoice){const op=node('option','S'+String(ep.season).padStart(2,'0')+'E'+String(ep.episode).padStart(2,'0'));op.value=ep.id;subtitleSelect.append(op);}
  }
  subtitleForm.append(subtitleUrl,subtitleLang);
  if(item.kind==='series')subtitleForm.append(subtitleSelect);
  const subtitleSubmit=node('button','SRT-Untertitel herunterladen');subtitleSubmit.type='submit';subtitleForm.append(subtitleSubmit);
  subtitleForm.addEventListener('submit',async e=>{
   e.preventDefault();subtitleSubmit.disabled=true;
   try{
    const result=await api('/api/subtitles',{method:'POST',body:{mediaId:item.id,url:subtitleUrl.value,language:subtitleLang.value,episodeId:item.kind==='series'?subtitleSelect.value||null:null}});
    notify('Untertitel gespeichert: '+result.result.path);subtitleUrl.value='';
   }catch(error){notify(error.message,true);}
   finally{subtitleSubmit.disabled=false;}
  });
  sourcesBox.append(node('h4','Externe WebVTT-Untertitel zur vorhandenen Mediendatei'));
  sourcesBox.append(subtitleForm);

  for(const source of sourceData.items){
    const row=node('div','','sourceEntry');
    row.append(node('strong',source.label||'Quelle'));
    row.append(node('small',source.url,'muted'));
    const controls=node('div','','sourceControls');
    const itemSelect=node('select');itemSelect.setAttribute('aria-label','Entdeckten Stream auswählen');
    itemSelect.append(node('option','Direkte Quell-URL'));itemSelect.options[0].value='';
    const episodesSelect=node('select');episodesSelect.setAttribute('aria-label','Episode auswählen');
    if(item.kind==='series'){
      const p=node('option','Episode auswählen');p.value='';episodesSelect.append(p);
      for(const ep of episodesForChoice){
        const o=node('option','S'+String(ep.season).padStart(2,'0')+'E'+String(ep.episode).padStart(2,'0')+' '+(ep.title||''));o.value=ep.id;episodesSelect.append(o);
      }
    }
    const populateItems=async()=>{
      const d=await api('/api/sources/'+source.id+'/items');
      itemSelect.replaceChildren();const p=node('option','Direkte Quell-URL');p.value='';itemSelect.append(p);
      for(const discovered of d.items){const o=node('option',(discovered.title||discovered.url)+(discovered.season!==null?' · S'+discovered.season+'E'+discovered.episode:''));o.value=discovered.id;itemSelect.append(o);}
      const direct=/\.(m3u8|mpd|mp4|m4v)(?:[?#]|$)/i.test(new URL(source.url).pathname);
      if(!direct&&d.items.length)itemSelect.selectedIndex=1;
    };
    controls.append(action('Analysieren',async()=>{
      const result=await api('/api/sources/'+source.id+'/analyze',{method:'POST'});
      await populateItems();notify('Quelle analysiert: '+result.adapter+' · '+result.kind);
    }));
    controls.append(action('Entdeckte Episoden übernehmen',async()=>{
      const res=await api('/api/sources/'+source.id+'/import-episodes',{method:'POST'});
      notify(res.added+' neue Episoden angelegt.');await refreshLibrary();
    }));
    controls.append(action('Quelle entfernen',async()=>{
      if(!confirm('Quelle entfernen?'))return;
      await api('/api/sources/'+source.id,{method:'DELETE'});await refreshLibrary();
    },'danger'));
    controls.append(itemSelect);
    if(item.kind==='series')controls.append(episodesSelect);
    controls.append(action('Download planen',async()=>{
      const b={mediaId:item.id,sourceId:source.id,itemId:itemSelect.value||null,episodeId:item.kind==='series'?episodesSelect.value:null};
      if(item.kind==='series'&&!b.episodeId)throw Error('Bitte zuerst eine Episode wählen.');
      await api('/api/transfers',{method:'POST',body:b});notify('Download in Warteschlange aufgenommen.');
    }));
    if(item.kind==='series'){
      const monitor=node('details','','sourceMonitor');
      const heading=node('summary','Automatische Quellenprüfung konfigurieren');
      monitor.append(heading);
      const policyResult=await api('/api/sources/'+source.id+'/automation');
      let policy=policyResult.policy;
      const option=(label,type,init)=>{
        const wrapper=node('label');const input=node('input');input.type=type;
        if(type==='checkbox')input.checked=!!init;else input.value=String(init);
        wrapper.append(input,document.createTextNode(' '+label));return {wrapper,input};
      };
      const enabled=option('Regelmäßige Prüfung aktivieren','checkbox',policy.enabled);
      const autoQueue=option('Fehlende Episoden automatisch zur Download-Warteschlange hinzufügen','checkbox',policy.autoQueue);
      const autoAdd=option('Neue Episoden zur Bibliothek hinzufügen','checkbox',policy.autoAddEpisodes);
      const interval=option('Prüfintervall (Minuten; mindestens 30)','number',policy.intervalMinutes);
      interval.input.min='30';interval.input.max='10080';
      const maximum=option('Maximale neue Downloads je Prüfung (1–50)','number',policy.maxPerCheck);
      maximum.input.min='1';maximum.input.max='50';
      const controlsMonitor=node('div','','sourceControls');
      controlsMonitor.append(action('Regeln speichern',async()=>{
        const body={enabled:enabled.input.checked,autoQueue:autoQueue.input.checked,autoAddEpisodes:autoAdd.input.checked,intervalMinutes:Number(interval.input.value),maxPerCheck:Number(maximum.input.value)};
        if(body.enabled&&body.autoQueue&&!confirm('Diese Einstellung darf automatisch neue Downloads starten. Wirklich aktivieren?'))return;
        policy=(await api('/api/sources/'+source.id+'/automation',{method:'PUT',body})).policy;
        monitorStatus.textContent='Gespeichert. Nächste Prüfung: '+(policy.enabled?new Date(policy.nextCheckEpoch).toLocaleString('de-AT'):'deaktiviert');
        notify('Quellenautomatisierung gespeichert.');
      }));
      controlsMonitor.append(action('Jetzt prüfen',async()=>{
        const r=await api('/api/sources/'+source.id+'/automation/check',{method:'POST'});
        monitorStatus.textContent='Gefunden: '+r.discovered+' · Neue Episoden: '+r.newEpisodes+' · Downloads: '+r.queued;
        notify('Quellenprüfung abgeschlossen.');await refreshLibrary();
      }));
      controlsMonitor.append(action('Verlauf anzeigen',async()=>{
        const data=await api('/api/sources/'+source.id+'/automation/history');
        const pre=node('pre',data.items.map(x=>x.checked_at+' · '+x.status+' · Episoden '+x.new_episodes+' · Downloads '+x.queued+' · '+x.message).join('\n')||'Noch keine Prüfungen','muted');
        pre.style.whiteSpace='pre-wrap';pre.style.maxHeight='200px';pre.style.overflow='auto';
        monitor.querySelector('pre')?.remove();monitor.append(pre);
      }));
      const monitorStatus=node('small',policy.lastError?'Letzter Fehler: '+policy.lastError:policy.lastCheckEpoch?'Letzte Prüfung: '+new Date(policy.lastCheckEpoch).toLocaleString('de-AT'):'Noch nicht geprüft','muted');
      monitor.append(enabled.wrapper,autoQueue.wrapper,autoAdd.wrapper,interval.wrapper,maximum.wrapper,controlsMonitor,monitorStatus);
      row.append(monitor);
    }
    row.append(controls);sourcesBox.append(row);
    populateItems().catch(()=>{});
  }
  article.append(sourcesBox);
  root.append(article);
 }
}
$('#scanLibrary').addEventListener('click',async()=>{try{await api('/api/jobs',{method:'POST',body:{type:'library_scan'}});await refreshJobs();notify('Bibliotheksprüfung vorgemerkt.');}catch(e){notify(e.message,true);}});
$('#reloadJobs').addEventListener('click',()=>refreshJobs().catch(e=>notify(e.message,true)));
async function refreshJobs(){const data=await api('/api/jobs');const root=$('#jobsList');root.replaceChildren();if(!data.items.length){root.append(node('p','Keine Aufgaben vorhanden.'));return;}for(const job of data.items){const article=node('article','','entry');article.append(node('strong',`${job.type} · ${job.state}`));article.append(node('p',job.error||job.result||job.created_at,'muted'));const actions=node('div','','actionrow');if(job.state==='queued')actions.append(action('Abbrechen',async()=>{await api(`/api/jobs/${job.id}/cancel`,{method:'POST'});await refreshJobs();}));if(['failed','cancelled'].includes(job.state))actions.append(action('Erneut versuchen',async()=>{await api(`/api/jobs/${job.id}/retry`,{method:'POST'});await refreshJobs();}));article.append(actions);root.append(article);}}
async function refreshTransfers(){
 const root=$('#transferList');if(!root)return;
 const data=await api('/api/transfers');root.replaceChildren();
 if(!data.items.length){root.append(node('p','Noch keine Stream-Downloads angelegt.'));return;}
 for(const item of data.items){
  const box=node('article','','entry');
  box.append(node('strong',item.state+' · '+item.url.split('/').pop()));
  box.append(node('p',(item.progress||0)+'% · '+(item.downloaded_bytes||0)+' Bytes · '+(item.error||item.result_json||''),'muted'));
  if(['queued','running'].includes(item.state))box.append(action('Abbrechen',async()=>{await api('/api/transfers/'+item.id+'/cancel',{method:'POST'});await refreshTransfers();}));
  if(['failed','cancelled'].includes(item.state))box.append(action('Erneut versuchen',async()=>{await api('/api/transfers/'+item.id+'/retry',{method:'POST'});await refreshTransfers();}));
  box.append(action('Ereignisverlauf',async()=>{
   const history=await api('/api/transfers/'+item.id+'/events');
   const region=node('pre',history.items.map(e=>e.created_at+' · '+e.category+': '+e.description).join('\n')||'Keine Ereignisse','muted');
   region.style.whiteSpace='pre-wrap';region.style.maxHeight='180px';region.style.overflow='auto';
   box.querySelector('pre')?.remove();box.append(region);
  }));
  root.append(box);
 }
}
$('#reloadTransfers')?.addEventListener('click',()=>refreshTransfers().catch(e=>notify(e.message,true)));

let wizardCurrent=null;
$('#wizardForm').addEventListener('submit',async event=>{
 event.preventDefault();const submit=$('#wizardForm button[type="submit"]');submit.disabled=true;wizardCurrent=null;
 const display=$('#wizardResult');display.replaceChildren();
 try{
  const kind=$('#wizKind').value,title=$('#wizTitle').value.trim(),year=$('#wizYear').value||null,sourceUrl=$('#wizUrl').value.trim();
  if(!title||!sourceUrl)throw Error('Bitte Titel und Quellen-URL eingeben.');
  display.append(node('p','Medienprojekt wird angelegt …','muted'));
  const existing=(await api('/api/media')).items.find(x=>x.kind===kind&&x.title.toLowerCase()===title.toLowerCase()&&String(x.year||'')===String(year||''));
  const media=existing||(await api('/api/media',{method:'POST',body:{kind,title,year}})).item;
  const sources=(await api('/api/media/'+media.id+'/sources')).items;
  const source=sources.find(x=>x.url===sourceUrl)||(await api('/api/media/'+media.id+'/sources',{method:'POST',body:{url:sourceUrl,label:'Medienassistent'}})).item;
  const analysis=await api('/api/sources/'+source.id+'/analyze',{method:'POST'});
  let imports={added:0};
  if(kind==='series')imports=await api('/api/sources/'+source.id+'/import-episodes',{method:'POST'});
  wizardCurrent={mediaId:media.id,sourceId:source.id,kind};
  await refreshLibrary();
  await showWizardPlan();
  notify('Quelle analysiert: '+analysis.adapter+'; '+imports.added+' neue Episoden.');
 }catch(err){display.replaceChildren(node('p','Analyse fehlgeschlagen: '+err.message,'muted'));notify(err.message,true);}
 finally{submit.disabled=false;}
});
async function showWizardPlan(){
 const display=$('#wizardResult');display.replaceChildren();
 if(!wizardCurrent)return;
 const {mediaId,sourceId,kind}=wizardCurrent;
 const ranking=await api('/api/media/'+mediaId+'/source-ranking');
 if(ranking.items.length){
  const line=node('p','Quellenvorschläge: '+ranking.items.map(x=>x.label+' ('+x.format+', '+x.numbered+' erkannte Episoden)').join(' · '),'muted');
  display.append(line);
 }
 if(kind==='movie'){
  display.append(node('p','Film hinzugefügt. Wähle anschließend in der Bibliothek eine unterstützte direkte HLS-/DASH-/MP4-Datei zum Download.','muted'));return;
 }
 const plan=await api('/api/media/'+mediaId+'/download-plan?sourceId='+sourceId);
 display.append(node('h3','Episodenplan: '+plan.missing+' fehlende von '+plan.total+' erkannten Folgen'));
 const list=node('div','','wizardEpisodes');
 for(const item of plan.items.slice(0,30)){
  const reason=item.reason==='missing'?'fehlt':item.reason==='available'?'vorhanden':item.reason==='ignored'?'ignoriert':item.reason==='already_queued'?'bereits geplant':'nicht zugeordnet';
  list.append(node('p','S'+String(item.season).padStart(2,'0')+'E'+String(item.episode).padStart(2,'0')+' · '+reason,'muted'));
 }
 display.append(list);
 if(plan.total>30)display.append(node('p','Weitere Folgen sind in der Bibliothek verfügbar.','muted'));
 if(plan.missing)display.append(action('Fehlende Folgen zur Warteschlange hinzufügen',async()=>{
  const result=await api('/api/transfers/batch',{method:'POST',body:{mediaId,sourceId}});
  notify(result.queued+' Downloads vorgemerkt. '+result.skipped.length+' übersprungen.');
  await showWizardPlan();
 }));
}
async function refreshNotices(){
 const list=$('#notificationList');if(!list)return;
 const result=await api('/api/notifications');list.replaceChildren();
 if(!result.items.length){list.append(node('p','Keine Benachrichtigungen vorhanden.','muted'));return;}
 for(const item of result.items){
  const row=node('article','','entry');row.append(node('strong',item.category+' · '+(item.read_at?'gelesen':'neu')));
  row.append(node('p',item.message,'muted'));
  if(!item.read_at)row.append(action('Als gelesen markieren',async()=>{
   await api('/api/notifications/'+item.id+'/read',{method:'POST'});await refreshNotices();
  }));
  list.append(row);
 }
}
$('#reloadNotices').addEventListener('click',()=>refreshNotices().catch(e=>notify(e.message,true)));
async function refreshDiagnostics(){
 const e=$('#diagnosticInfo');if(!e)return;
 const d=await api('/api/diagnostics');
 e.textContent='Medien: '+d.mediaCount+' · Quellen: '+d.sourceCount+' · ungelesen: '+d.unreadNotifications+' · Downloads: '+JSON.stringify(d.transferCounts);
}
$('#reloadDiagnostics').addEventListener('click',()=>refreshDiagnostics().catch(e=>notify(e.message,true)));
$('#scheduleForm').addEventListener('submit',async e=>{
 e.preventDefault();try{
  const days=$('#scheduleDays').value.split(',').map(x=>Number(x.trim()));
  const payload={enabled:$('#scheduleEnabled').checked,startHour:Number($('#scheduleStart').value),endHour:Number($('#scheduleEnd').value),bandwidthKbps:Number($('#scheduleBandwidth').value),days};
  await api('/api/automation/schedule',{method:'PUT',body:payload});notify('Zeitplan gespeichert.');await refreshSchedule();
 }catch(err){notify(err.message,true);}
});
async function refreshSchedule(){
 const r=await api('/api/automation/schedule');
 $('#scheduleEnabled').checked=r.schedule.enabled;
 $('#scheduleStart').value=r.schedule.startHour;$('#scheduleEnd').value=r.schedule.endHour;
 $('#scheduleDays').value=r.schedule.days.join(',');$('#scheduleBandwidth').value=r.schedule.bandwidthKbps||0;
 $('#scheduleTimezone').textContent='Server-Zeitzone: '+r.timezone+' (0 = Sonntag, 1 = Montag, …, 6 = Samstag)';
}
async function refreshSettings(){const c=await api('/api/config');const entries=Object.fromEntries(c.items.map(x=>[x.key,x.value]));$('#jellyfinUrl').value=entries.jellyfin_url||'';$('#libraryLabel').value=entries.library_label||'';$('#preferredLanguage').value=entries.preferred_language||'';$('#volumeStatus').textContent=c.mediaRoot.configured?`Medienvolume: ${c.mediaRoot.readable?'lesbar':'nicht lesbar'} · Schreibrecht: ${c.mediaRoot.writeable?'vorhanden':'nicht vorhanden'}`:'Kein Medienvolume eingebunden';}
$('#settingsForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/config',{method:'PUT',body:{jellyfin_url:$('#jellyfinUrl').value,library_label:$('#libraryLabel').value,preferred_language:$('#preferredLanguage').value}});notify('Einstellungen gespeichert.');}catch(err){notify(err.message,true);}});
$('#fullBackupDownload').addEventListener('click',async()=>{
 try{
  const result=await fetch('/api/backup/database',{headers:{'x-forgecore-request':'1'},credentials:'same-origin'});
  if(!result.ok)throw Error('SQLite-Backup fehlgeschlagen: HTTP '+result.status);
  const blob=await result.blob();
  const uri=URL.createObjectURL(blob),link=node('a');
  link.href=uri;link.download='forgecore-complete-'+new Date().toISOString().slice(0,10)+'.sqlite';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(uri),1500);
  notify('Vollständiges Datenbank-Backup erstellt. Bitte sicher aufbewahren.');
 }catch(error){notify(error.message,true)}
});
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
