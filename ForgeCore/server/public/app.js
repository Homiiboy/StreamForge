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
function showView(view){for(const v of ['discover','library','downloads','radar','tasks','settings','system'])$('#'+v+'View').hidden=v!==view;document.querySelectorAll('nav .tab').forEach(t=>t.classList.toggle('selected',t.dataset.view===view));if(view==='discover'){refreshDiscover().catch(e=>notify(e.message,true));refreshDiscoverWatchlist().catch(e=>notify(e.message,true));}if(view==='downloads'){refreshDownloadDashboard().catch(e=>notify(e.message,true));}if(view==='radar'){refreshRadarDashboard().catch(e=>notify(e.message,true));}if(view==='tasks'){refreshJobs().catch(e=>notify(e.message,true));refreshTransfers().catch(e=>notify(e.message,true));refreshNotices().catch(e=>notify(e.message,true));refreshDiagnostics().catch(e=>notify(e.message,true));}if(view==='settings'){refreshSettings().catch(e=>notify(e.message,true));refreshSchedule().catch(e=>notify(e.message,true));refreshJellyfin().catch(e=>notify(e.message,true));}if(view==='system')refreshOperations().catch(e=>notify(e.message,true));}
async function startup(){
 try{const me=await api('/api/me');csrf=me.csrf||'';$('#connection').textContent='Verbunden';
  $('#setup').hidden=me.configured;$('#login').hidden=!me.configured||me.authenticated;$('#app').hidden=!me.authenticated;
  if(me.authenticated){await refreshLibrary();await refreshSiteCatalog();}
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
    const adapterSelector=node('select');adapterSelector.setAttribute('aria-label','Adapter für '+(source.label||'Quelle'));
    const defaults=[{id:'auto',label:'Automatisch erkennen'},...(await api('/api/source-adapters')).items];
    for(const a of defaults){const option=node('option',a.label);option.value=a.id;adapterSelector.append(option);}
    adapterSelector.value=source.adapter_id||'auto';
    row.append(node('small','Quellenadapter','muted'),adapterSelector);
    row.append(action('Adapter wählen',async()=>{
     await api('/api/sources/'+source.id,{method:'PATCH',body:{adapterId:adapterSelector.value}});
     notify('Quellenadapter aktualisiert.');
    }));
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

async function refreshJellyfin(){
 const result=await api('/api/jellyfin');
 $('#jellyfinConnectUrl').value=result.url||'';
 $('#jellyfinConnectKey').value='';
 $('#jellyfinAutoRefresh').checked=!!result.autoRefresh;
 $('#jellyfinInfo').textContent=result.configured?'Jellyfin API-Zugang konfiguriert: '+result.url:'Noch keine Jellyfin API-Verbindung konfiguriert.';
}
$('#jellyfinConnectForm').addEventListener('submit',async e=>{
 e.preventDefault();try{
  const result=await api('/api/jellyfin',{method:'PUT',body:{url:$('#jellyfinConnectUrl').value,apiKey:$('#jellyfinConnectKey').value,autoRefresh:$('#jellyfinAutoRefresh').checked}});
  $('#jellyfinConnectKey').value='';
  notify('Jellyfin-Verbindung gespeichert. Jetzt testen.');
  $('#jellyfinInfo').textContent='Konfiguriert: '+result.url;
 }catch(error){notify(error.message,true)}
});
$('#jellyfinTest').addEventListener('click',async()=>{
 try{const r=await api('/api/jellyfin/test',{method:'POST'});$('#jellyfinInfo').textContent='Verbunden: '+(r.serverName||'Jellyfin')+' · '+r.serverVersion;}
 catch(error){notify('Jellyfin nicht erreichbar: '+error.message,true)}
});
$('#jellyfinRefresh').addEventListener('click',async()=>{
 try{await api('/api/jellyfin/refresh',{method:'POST'});notify('Jellyfin wurde zur Aktualisierung aufgefordert.');}
 catch(error){notify(error.message,true)}
});
let jellyfinPreview=null;
$('#jellyfinPreview').addEventListener('click',async()=>{
 try{
  const r=await api('/api/jellyfin/sync/preview',{method:'POST'});
  jellyfinPreview=r;
  $('#jellyfinPreviewText').textContent='Vorgeschlagen: '+r.availableToMark+' bisher fehlende Episoden als vorhanden markieren; '+r.matched+' Treffer insgesamt, '+r.unmatched+' nicht zuordenbar.';
  notify('Jellyfin-Episodenabgleich geprüft.');
 }catch(error){jellyfinPreview=null;notify(error.message,true)}
});
$('#jellyfinSync').addEventListener('click',async()=>{
 try{
  if(!jellyfinPreview)throw Error('Bitte zuerst den Abgleich prüfen.');
  if(!confirm('Bis zu '+jellyfinPreview.availableToMark+' Episoden anhand des aktuellen Jellyfin-Bestandes als verfügbar markieren?'))return;
  const result=await api('/api/jellyfin/sync/apply',{method:'POST',body:{confirm:'MARK_AVAILABLE'}});
  jellyfinPreview=null;
  $('#jellyfinPreviewText').textContent=result.updated+' Episoden als vorhanden markiert.';
  notify(result.updated+' Episoden aktualisiert.');await refreshLibrary();
 }catch(error){notify(error.message,true)}
});


async function refreshOperations(){
 const [result,errors]=await Promise.all([api('/api/operations'),api('/api/operations/errors')]);
 const root=$('#operationsStatus');root.replaceChildren();
 const values=[
  ['ForgeCore',result.version+' · '+Math.floor(result.uptimeSeconds/60)+' Minuten Laufzeit'],
  ['Arbeitsspeicher',result.memory.rssMiB+' MiB ForgeCore · '+result.memory.systemFreeMiB+' MiB Host frei'],
  ['Medienvolume',result.media.readable?(result.media.writable?'Lesbar & schreibbar':'Schreibrecht fehlt'):'Nicht lesbar'],
  ['Medienplatz',result.media.freeMiB===null?'Unbekannt':result.media.freeMiB+' MiB frei'],
  ['Datenvolume',result.data.freeMiB===null?'Nicht erreichbar':result.data.freeMiB+' MiB frei'],
  ['Datenbank',result.database.integrity+' · Schema '+result.database.schema],
  ['Bibliothek',result.totals.movies+' Filme · '+result.totals.series+' Serien · '+result.totals.episodes+' Episoden'],
  ['Downloads',result.totals.queuedTransfers+' wartend · '+result.totals.runningTransfers+' aktiv · '+result.totals.failedTransfers+' Fehler'],
  ['Quellenmonitore',result.totals.sourceMonitors+' aktiviert']
 ];
 for(const [title,value] of values){
  const div=node('div','','opsMetric');div.append(node('small',title,'muted'),node('strong',String(value)));root.append(div);
 }
 const warnings=$('#operationsWarnings');warnings.replaceChildren();
 if(!result.warnings.length)warnings.append(node('p','Keine Probleme in den verfügbaren Systemchecks erkannt.','muted'));
 for(const msg of result.warnings)warnings.append(node('p','Warnung: '+msg,'opsWarning'));
 const list=$('#operationsErrors');list.replaceChildren();
 const failures=errors.failedTransfers||[],sources=errors.sourceErrors||[];
 for(const item of failures)list.append(node('p','Download '+item.id.slice(0,8)+': '+(item.error||'Unbekannter Fehler'),'muted'));
 for(const item of sources)list.append(node('p','Quellenprüfung '+item.source_id.slice(0,8)+': '+(item.last_error||'Unbekannter Fehler'),'muted'));
 if(!failures.length&&!sources.length)list.append(node('p','Keine offenen Fehler registriert.','muted'));
}
$('#reloadOperations')?.addEventListener('click',()=>refreshOperations().catch(e=>notify(e.message,true)));
async function refreshSettings(){const c=await api('/api/config');const entries=Object.fromEntries(c.items.map(x=>[x.key,x.value]));$('#libraryLabel').value=entries.library_label||'';$('#preferredLanguage').value=entries.preferred_language||'';$('#volumeStatus').textContent=c.mediaRoot.configured?`Medienvolume: ${c.mediaRoot.readable?'lesbar':'nicht lesbar'} · Schreibrecht: ${c.mediaRoot.writeable?'vorhanden':'nicht vorhanden'}`:'Kein Medienvolume eingebunden';}
$('#settingsForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/config',{method:'PUT',body:{library_label:$('#libraryLabel').value,preferred_language:$('#preferredLanguage').value}});notify('Einstellungen gespeichert.');}catch(err){notify(err.message,true);}});
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

async function refreshSiteCatalog(){
 const sites=(await api('/api/search-sites')).items,box=$('#siteList');box.replaceChildren();
 const adapters=[{id:'auto',label:'Automatisch'},...(await api('/api/source-adapters')).items];
 for(const site of sites){
  const row=node('div','','sourceEntry');row.append(node('strong',site.label),node('small',site.url,'muted'));
  const select=node('select');select.setAttribute('aria-label','Websiteadapter '+site.label);
  for(const a of adapters){const opt=node('option',a.label);opt.value=a.id;select.append(opt);}select.value=site.adapter_id;
  const template=node('input');template.value=site.search_template||'';template.maxLength=2048;template.placeholder='https://example.org/search?q={query}';template.setAttribute('aria-label','Suchadresse für '+site.label);
  row.append(template,select,action('Adapter und Suche speichern',async()=>{await api('/api/search-sites/'+site.id,{method:'PATCH',body:{adapterId:select.value,searchTemplate:template.value}});notify('Adapter gespeichert.');}));
  row.append(action(site.enabled?'Deaktivieren':'Aktivieren',async()=>{await api('/api/search-sites/'+site.id,{method:'PATCH',body:{enabled:!site.enabled}});await refreshSiteCatalog();}));
  row.append(action('Entfernen',async()=>{if(!confirm('Diese Website entfernen?'))return;await api('/api/search-sites/'+site.id,{method:'DELETE'});await refreshSiteCatalog();},'danger'));
  box.append(row);
 }
 if(!sites.length)box.append(node('p','Noch keine Websites hinterlegt.','muted'));
}
$('#siteAddForm').addEventListener('submit',async e=>{e.preventDefault();try{
 await api('/api/search-sites',{method:'POST',body:{url:$('#siteUrl').value,label:$('#siteLabel').value,searchTemplate:$('#siteSearchTemplate').value}});
 $('#siteUrl').value='';$('#siteLabel').value='';$('#siteSearchTemplate').value='';await refreshSiteCatalog();notify('Website gespeichert.');
}catch(error){notify(error.message,true);}});

const isDirectMediaUrl=url=>{try{return /\.(?:mp4|m4v|m3u8|mpd)$/i.test(new URL(url).pathname)}catch{return false}};
/** Existing transfer queue only; no external player streams or automatic download. */
function directListingDownload(container,{url,title,season=null,episode=null,mediaType='title'}){
 if(!isDirectMediaUrl(url))return;
 const picker=node('div','','sourceEntry');
 const start=action('Download auswählen',async()=>{
  picker.replaceChildren();
  const projects=(await api('/api/media')).items;
  const type=(season!=null&&episode!=null||mediaType==='series'||mediaType==='episode')?'series':'movie';
  const options=projects.filter(item=>item.kind===type);
  const project=node('select');project.setAttribute('aria-label','Medienprojekt');
  for(const item of options){const opt=node('option',item.title);opt.value=item.id;project.append(opt)}
  const create=node('option','+ Neues '+(type==='series'?'Serien':'Film')+'projekt erstellen');create.value='new';project.append(create);
  const matched=options.find(item=>item.title.toLowerCase().trim()===title.toLowerCase().trim());
  project.value=matched?.id||'new';
  picker.append(node('p','Download zuordnen: '+title+' · nur direkte, ungeschützte Medien-URL','muted'),project);
  const episodeNumber=type==='series'?node('input'):null;
  const seasonNumber=type==='series'?node('input'):null;
  if(type==='series'){
   for(const [input,value,label] of [[seasonNumber,season,'Staffel'],[episodeNumber,episode,'Episode']]){
    input.type='number';input.min='0';input.max=label==='Staffel'?'999':'9999';
    input.placeholder=label;input.value=value==null?'':String(value);
    input.setAttribute('aria-label',label);picker.append(input);
   }
  }
  picker.append(action('Download in Warteschlange',async()=>{
   if(!confirm('Diese direkte Medienadresse zum Download vormerken? Nur bei eigenen oder rechtmäßig zum Download freigegebenen Quellen bestätigen.'))return;
   let mediaId=project.value;
   if(mediaId==='new'){
    const label=prompt('Titel des neuen '+(type==='series'?'Serien':'Film')+'projekts:',title);
    if(!label||!label.trim())return;
    const created=await api('/api/media',{method:'POST',body:{kind:type,title:label.trim()}});
    mediaId=created.item.id;
   }
   let episodeId=null;
   if(type==='series'){
    const sn=Number(seasonNumber.value),en=Number(episodeNumber.value);
    if(!seasonNumber.value||!episodeNumber.value||!Number.isInteger(sn)||sn<0||!Number.isInteger(en)||en<0)throw Error('Gültige Staffel- und Episodennummer erforderlich');
    const current=(await api('/api/media/'+mediaId+'/episodes')).items;
    let ep=current.find(e=>e.season===sn&&e.episode===en);
    if(ep?.status==='available'||ep?.status==='ignored')throw Error('Episode als vorhanden/ignoriert markiert – kein erneuter Download.');
    if(!ep){const created=await api('/api/media/'+mediaId+'/episodes',{method:'POST',body:{season:sn,episode:en,title:'Folge '+en}});ep=created.item}
    episodeId=ep.id;
   }
   const saved=(await api('/api/media/'+mediaId+'/sources')).items;
   let source=saved.find(x=>x.url===url);
   if(!source)source=(await api('/api/media/'+mediaId+'/sources',{method:'POST',body:{url,label:'Direktlink aus der Website-Suche'}})).item;
   const job=await api('/api/transfers',{method:'POST',body:{mediaId,sourceId:source.id,episodeId}});
   notify('Download '+job.item.id.slice(0,8)+' vorgemerkt. Fortschritt unter Aufgaben → Stream-Downloads.');
   await refreshLibrary();
   picker.replaceChildren(node('p','Download vorgemerkt – unter Aufgaben verfolgen.','muted'));
  }));
 });
 container.append(start,picker);
}
function playerInspectionButton(container,siteId,url,{showDirect=false,title='',season=null,episode=null,mediaType='episode'}={}){
 const details=node('div','','items');
 container.append(action('Player prüfen',async()=>{
  details.replaceChildren(node('p','PlayerBridge untersucht die Episodenseite …','muted'));
  const found=await api('/api/playerbridge/inspect',{method:'POST',body:{siteId,url}});
  details.replaceChildren(node('p',found.counts.external+' externe Player · '+found.counts.direct+' direkte Medienlinks','muted'));
  for(const host of found.players){
   const line=node('div','','sourceEntry');
   line.append(node('strong',host.hoster+' · '+(host.kind==='player'?'Externer Player':'Direkte Medienquelle')));
   const link=node('a','Link öffnen');link.href=host.url;link.target='_blank';link.rel='noopener noreferrer';line.append(link);
   if(host.kind==='direct'&&showDirect)directListingDownload(line,{url:host.url,title,season,episode,mediaType});
   details.append(line);
  }
  if(!found.players.length)details.append(node('p','Keine öffentlich im HTML verlinkten Player gefunden. Kein direkter Download verfügbar.','muted'));
  details.append(node('p',found.notice,'muted'));
 }));
 container.append(details);
}

$('#siteSearchForm').addEventListener('submit',async e=>{e.preventDefault();
 const box=$('#siteSearchResults');box.replaceChildren(node('p','Suche läuft …','muted'));
 try{
  const data=await api('/api/site-search',{method:'POST',body:{query:$('#siteQuery').value}});
  box.replaceChildren(node('p',data.results.length+' Treffer · '+data.checked+' Websites geprüft · '+data.errors.length+' Fehler','muted'));
  // Group identical titles without losing individual source links.
  const groups=new Map();
  for(const hit of data.results){
   const key=hit.kind==='catalog'?hit.title.normalize('NFKD').toLowerCase().trim()+'|'+hit.mediaType:hit.url;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(hit);
  }
  for(const hits of groups.values()){
   const hit=hits[0],row=node('div','','sourceEntry');
   row.append(node('strong',hit.title||'Suchtreffer'));
   row.append(node('small',hits.map(h=>h.siteLabel).join(' · ')+' · '+(hit.kind==='catalog'?'Katalogtreffer':'Medienlink')+(hit.mediaType?' · '+({series:'Serie',movie:'Film',episode:'Episode',title:'Titel'}[hit.mediaType]||''):'')+(hit.season!=null&&hit.episode!=null?' · S'+hit.season+'E'+hit.episode:''),'muted'));
   for(const source of hits){
    const link=node('a',hits.length>1?source.siteLabel+' öffnen':(source.kind==='catalog'?'Titelseite öffnen':'Quelle öffnen'));
    link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';row.append(link);
    if(source.kind==='media')directListingDownload(row,{url:source.url,title:hit.title,season:source.season,episode:source.episode,mediaType:hit.mediaType});
   }
   if(hit.kind==='catalog'){
    const details=node('details');const summary=node('summary','Serien-/Filmdetails');details.append(summary);
    if(hit.year)details.append(node('p','Jahr: '+hit.year));
    if(hit.aliases?.length)details.append(node('p','Alternative Titel: '+hit.aliases.join(' · ')));
    details.append(node('p','Quellen: '+[...new Set(hits.map(h=>h.siteLabel))].join(', ')));
    details.append(node('p','Diese Ansicht zeigt erkannte Katalogdaten, noch keine vollständige Staffel- und Episodenliste.','muted'));
    if(hit.mediaType==='movie'||hit.mediaType==='episode')playerInspectionButton(details,hit.siteId,hit.url,{showDirect:true,title:hit.title,season:hit.season,episode:hit.episode,mediaType:hit.mediaType});
    const panel=node('div','','items');
    details.append(action('Staffeln & Episoden auslesen',async()=>{
     panel.replaceChildren(node('p','Katalogseite wird geprüft …','muted'));
     const inspected=await api('/api/catalog/inspect',{method:'POST',body:{siteId:hit.siteId,url:hit.url,title:hit.title}});
     panel.replaceChildren(node('p',inspected.notice,'muted'));
     panel.append(node('p','Erkannte Staffeln: '+(inspected.seasons.join(', ')||'keine')+' · Erkannte Episoden: '+inspected.episodes.length+' · ForgeCore-Projekt: '+(inspected.mediaId?'vorhanden':'nicht angelegt')));
     panel.append(node('p','Geprüfte Seiten: '+inspected.checkedSeasonPages+' · Quellen-Episoden pro Staffel: '+inspected.sourceCounts.map(x=>(x.season===0?'Specials':'Staffel '+x.season)+': '+x.episodes).join(' · '),'muted'));
     panel.append(node('p','Specials auf Quellseite: '+inspected.specialsState+(inspected.truncated?' · ACHTUNG: Quellenliste hat das maximale Ausleselimit erreicht.':''),'muted'));
     for(const item of inspected.seasonErrors)panel.append(node('p','Staffel '+item.season+': '+item.error,'muted'));
     const list=node('div','','items');
     for(const season of [...new Set(inspected.episodes.map(ep=>ep.season))]){
      const group=node('details');group.append(node('summary',(season===0?'Specials':'Staffel '+season)+' · '+inspected.episodes.filter(ep=>ep.season===season).length+' Episoden'));
      // Populate the long lists only on demand, keeping One Piece usable.
      let rendered=false;
      group.addEventListener('toggle',()=>{
       if(!group.open||rendered)return;
       rendered=true;
       for(const ep of inspected.episodes.filter(ep=>ep.season===season)){
        const entry=node('div','','episode');
        entry.append(node('strong','S'+String(ep.season).padStart(2,'0')+'E'+String(ep.episode).padStart(2,'0')));
        entry.append(node('span',(ep.title||'Episode')+' · ForgeCore: '+ep.forgecoreStatus,'muted'));
        playerInspectionButton(entry,hit.siteId,ep.url,{showDirect:true,title:inspected.title,season:ep.season,episode:ep.episode,mediaType:'series'});
        group.append(entry);
       }
      });
      list.append(group);
     }
     panel.append(list);
     panel.append(action('Serienübersicht: Quelle + Jellyfin',async()=>{
      const overview=await api('/api/catalog/series-overview',{method:'POST',body:{title:inspected.title,episodes:inspected.episodes.map(e=>({season:e.season,episode:e.episode,title:e.title})),includeSpecials:false}});
      const display=node('div','','items');display.append(node('h3','Gemeinsame Serienübersicht: '+overview.title));
      const summary=overview.summary;
      display.append(node('p','Episoden (bekannter Ausschnitt): '+summary.total+' · Jellyfin: '+summary.inJellyfin+' · Quelle: '+summary.onSource+' · Beides: '+summary.onBoth+' · Nur Quelle: '+summary.sourceOnly+' · Nur Jellyfin: '+summary.jellyfinOnly));
      const progress=node('progress');progress.max=Math.max(1,summary.total);progress.value=summary.inJellyfin;progress.setAttribute('aria-label','In Jellyfin bestätigte Episoden im bekannten Ausschnitt');display.append(progress);
      display.append(node('p','Specials (Staffel 0) sind ausgeblendet: '+overview.hiddenSpecials+' Einträge der ausgewählten Jellyfin-Serie. Specials anderer Serien werden nicht einbezogen.','muted'));
      display.append(node('p',overview.notice,'muted'));
      for(const season of overview.seasons){
       const section=node('details');section.open=overview.seasons.length===1;
       section.append(node('summary',season===0?'Specials (Staffel 0)':'Staffel '+season));
       for(const ep of overview.episodes.filter(e=>e.season===season)){
        const line=node('div','','episode');
        line.append(node('strong','S'+String(ep.season).padStart(2,'0')+'E'+String(ep.episode).padStart(2,'0')));
        line.append(node('span',(ep.title||'Ohne Titel')+' · '+(ep.jellyfin?'In Jellyfin':'Nicht im geprüften Jellyfin-Inventar')+' · '+(ep.source?'Quelle erkannt':'Nicht auf geprüfter Quellseite')+' · ForgeCore: '+ep.forgecoreStatus,'muted'));
        section.append(line);
       }
       display.append(section);
      }
      display.append(action('Jellyfin-Serie in ForgeCore übernehmen',async()=>{
       if(!confirm('Serie und in Jellyfin bestätigte Episoden als ForgeCore-Projekt übernehmen? Bestehende Einträge bleiben unverändert.'))return;
       const outcome=await api('/api/catalog/import-jellyfin',{method:'POST',body:{title:inspected.title,confirm:'IMPORT_JELLYFIN_SERIES'}});
       notify((outcome.created?'Projekt angelegt. ':'Projekt aktualisiert. ')+outcome.added+' Episoden übernommen.');await refreshLibrary();
      }));
      panel.append(display);
     }));
     panel.append(action('Mit Jellyfin vergleichen (nur Vorschau)',async()=>{
      const data=await api('/api/catalog/jellyfin-preview',{method:'POST',body:{title:inspected.title,episodes:inspected.episodes.map(x=>({season:x.season,episode:x.episode}))}});
      panel.append(node('p','Jellyfin: '+data.matched+' von '+inspected.episodes.length+' erkannten Episoden vorhanden · '+data.foundInJellyfin+' Episoden im geprüften Inventar. Es wurden keine Daten verändert.'));
      for(const item of data.items)panel.append(node('p','S'+String(item.season).padStart(2,'0')+'E'+String(item.episode).padStart(2,'0')+': '+(item.inJellyfin?'in Jellyfin gefunden':'nicht im abgefragten Inventar'),'muted'));
     }));
    }));
    details.append(panel);
    row.append(details);
   }
   box.append(row);
  }
  for(const error of data.errors)box.append(node('p',error.siteLabel+': '+error.error,'muted'));
  for(const warning of data.warnings||[])box.append(node('p',warning.siteLabel+': '+warning.message,'muted'));
  if(!data.results.length)box.append(node('p','Keine passenden Titel oder Medienlinks gefunden. Für eine echte Titelsuche eine Suchadresse mit {query} hinterlegen.','muted'));
 }catch(error){box.replaceChildren();notify(error.message,true);}
});


// StreamRadar-inspired Discover. TMDB calls and credentials remain on the server.
async function refreshDiscover(query=''){
 const container=$('#discoverResults'),status=$('#discoverStatus');
 container.replaceChildren();
 status.textContent='TMDB-Katalog wird geladen …';
 const params=new URLSearchParams({kind:$('#discoverKind').value});
 if(query)params.set('q',query);
 try{
  const result=await api('/api/discover?'+params.toString());
  if(!result.configured){
   status.textContent='Discover benötigt einen TMDB Read Access Token. Trage FORGECORE_TMDB_TOKEN in der ForgeCore-.env ein und starte den Container erneut.';
   return;
  }
  status.textContent=(query?'Suchergebnisse':'Trends dieser Woche')+' · '+result.items.length+' Titel · Quelle: TMDB';
  if(!result.items.length){container.append(node('p','Keine passenden Titel gefunden.'));return;}
  for(const item of result.items){
   const card=node('article','','discoverCard');
   if(item.poster){
    const img=document.createElement('img');
    img.src=item.poster;img.alt='Poster: '+item.title;img.loading='lazy';img.referrerPolicy='no-referrer';
    card.append(img);
   }else card.append(node('div','Kein Poster','discoverNoPoster'));
   const details=node('div','','discoverBody');
   const h=node('h3',item.title);details.append(h);
   details.append(node('p',(item.kind==='tv'?'Serie':'Film')+(item.year?' · '+item.year:'')+(item.rating!==null?' · ★ '+item.rating.toFixed(1):''),'muted'));
   if(item.overview)details.append(node('p',item.overview.slice(0,230)+(item.overview.length>230?' …':''),'discoverSynopsis'));
   const actions=node('div','','actionrow');
   actions.append(action('Details & deutsche Quellen',async()=>showDiscoverDetail(item.kind,item.id)));
   actions.append(action('Zur Bibliothek hinzufügen',async()=>{
    const r=await api('/api/discover/add',{method:'POST',body:{id:item.id,kind:item.kind}});
    notify(r.alreadyAdded?'Bereits in der ForgeCore-Bibliothek.':'Titel zur ForgeCore-Bibliothek hinzugefügt.');
    await refreshLibrary();
   }));
   details.append(actions);card.append(details);container.append(card);
  }
 }catch(error){status.textContent='Katalog konnte nicht geladen werden.';container.append(node('p',error.message,'muted'));}
}
$('#discoverForm').addEventListener('submit',e=>{
 e.preventDefault();refreshDiscover($('#discoverQuery').value.trim()).catch(err=>notify(err.message,true));
});
$('#discoverTrending').addEventListener('click',()=>{
 $('#discoverQuery').value='';
 refreshDiscover().catch(err=>notify(err.message,true));
});
$('#discoverKind').addEventListener('change',()=>{
 const query=$('#discoverQuery').value.trim();
 if(!query||query.length>=2)refreshDiscover(query).catch(err=>notify(err.message,true));
});


// Discover v1.4.1–v1.4.4: title details, Austrian providers, watchlist,
// exact Jellyfin preview and manual episode registration. No stream download.
let discoverSaved=[];
const discoveryParams=(kind,id,extra={})=>{
 const p=new URLSearchParams({kind:String(kind),id:String(id)});
 for(const [key,value] of Object.entries(extra))p.set(key,String(value));
 return p.toString();
};
const discoveryName=x=>x==='tv'?'Serie':'Film';
function discoverStatusText(status){
 return ({
  'in-jellyfin':'In Jellyfin','available':'In ForgeCore vorhanden','ignored':'Ignoriert',
  'queued':'Bereits in Download-Warteschlange','missing':'Als fehlend markiert',
  'not-tracked':'Noch nicht verwaltet'
 })[status]||'Nicht geprüft';
}
function discoverFlag(label,value){
 const p=node('p',label+': '+value,'muted');return p;
}
async function refreshDiscoverWatchlist(){
 const box=$('#discoverWatchlist'),result=await api('/api/discover/watchlist');
 discoverSaved=result.items;
 box.replaceChildren();
 $('#discoverWatchlistStatus').textContent=result.items.length+' gemerkte Titel · '+result.items.filter(x=>x.monitored).length+' überwacht';
 for(const item of result.items){
  const entry=node('article','','entry');
  const head=node('div','','entryhead');
  head.append(node('strong',item.title+(item.year?' ('+item.year+')':'')));
  head.append(node('span',item.monitored?'Überwacht':'Merkliste','muted'));
  entry.append(head);
  const actions=node('div','','actionrow');
  actions.append(action('Details',async()=>{await showDiscoverDetail(item.kind,item.id);document.getElementById('discoverDetails').scrollIntoView({behavior:'smooth',block:'start'});}));
  actions.append(action(item.monitored?'Überwachung ausschalten':'Überwachen',async()=>{
   await api('/api/discover/watchlist/monitor',{method:'PATCH',body:{kind:item.kind,id:item.id,monitored:!item.monitored}});
   await refreshDiscoverWatchlist();notify('Radar-Einstellung gespeichert.');
  }));
  actions.append(action(item.autoQueueGerman?'Deutsche Downloads: Automatik AUS':'Deutsche Downloads automatisch',async()=>{
   if(!item.autoQueueGerman&&!confirm('Nur explizit geprüfte deutsche Direktquellen automatisch herunterladen? Titel und fehlende Episoden müssen zuvor manuell angelegt sein.'))return;
   await api('/api/discover/watchlist/monitor',{method:'PATCH',body:{kind:item.kind,id:item.id,monitored:item.autoQueueGerman?!!item.monitored:true,autoQueueGerman:!item.autoQueueGerman}});
   await refreshDiscoverWatchlist();
   notify(item.autoQueueGerman?'Automatik deaktiviert.':'Deutsch-Only-Automatik aktiviert.');
  }));
  actions.append(action('Entfernen',async()=>{
   await api('/api/discover/watchlist',{method:'DELETE',body:{kind:item.kind,id:item.id}});
   await refreshDiscoverWatchlist();notify('Aus Merkliste entfernt.');
  },'outline'));
  entry.append(actions);box.append(entry);
 }
 if(!result.items.length)box.append(node('p','Noch keine Filme oder Serien gemerkt.','muted'));
}
async function showDiscoverDetail(kind,id){
 const box=$('#discoverDetails');box.hidden=false;box.replaceChildren(node('p','Lade TMDB-Details …','muted'));
 try{
  const detail=await api('/api/discover/detail?'+discoveryParams(kind,id));
  box.replaceChildren();
  const head=node('div','','entryhead');
  head.append(node('h2',detail.title+(detail.year?' ('+detail.year+')':'')));
  head.append(action('Schließen',async()=>{box.hidden=true;},'outline'));
  box.append(head);
  box.append(discoverFlag('Kategorie',discoveryName(kind)+' · '+(detail.genres.join(', ')||'Genre unbekannt')));
  box.append(discoverFlag('TMDB-Bewertung',detail.rating===null?'Nicht verfügbar':detail.rating.toFixed(1)+'/10'));
  if(detail.overview)box.append(node('p',detail.overview));
  const prov=node('section','','discoverMetadata');
  prov.append(node('h3','Streaminganbieter in Österreich'));
  prov.append(node('p','Daten von TMDB/JustWatch · Verfügbarkeit ist keine Downloadberechtigung.','hint'));
  if(!detail.providers.items.length)prov.append(node('p','Derzeit keine Anbieterinformationen für Österreich.','muted'));
  else for(const p of detail.providers.items)prov.append(node('span',p.name+' · '+({flatrate:'Abo',free:'kostenlos',ads:'mit Werbung',rent:'Leihe',buy:'Kauf'}[p.type]||p.type),'discoverProvider'));
  box.append(prov);
  if(kind==='tv'){
   const next=detail.nextEpisode;
   box.append(discoverFlag('Nächste angekündigte Folge',next?('S'+String(next.season).padStart(2,'0')+'E'+String(next.episode).padStart(2,'0')+' · '+(next.airDate||'Datum offen')+(next.title?' · '+next.title:'')):'Keine bestätigte nächste Folge'));
   box.append(discoverFlag('TVmaze-Abgleich',detail.tvmaze.matched?'Eindeutig über IMDb-ID verknüpft':(detail.tvmaze.notice||'Nicht verknüpft')));
  }
  const actions=node('div','','actionrow');
  const saved=discoverSaved.find(x=>x.kind===kind&&x.id===id);
  actions.append(action(saved?'In Merkliste gespeichert':'Zur Merkliste',async()=>{
   await api('/api/discover/watchlist',{method:'POST',body:{kind,id,monitored:!!saved?.monitored}});
   await refreshDiscoverWatchlist();notify('In Merkliste gespeichert.');
  }));
  actions.append(action('Serie/Film zur Bibliothek',async()=>{
   const r=await api('/api/discover/add',{method:'POST',body:{kind,id}});
   await refreshLibrary();
   notify(r.alreadyAdded?'Bereits in ForgeCore.':'Medienprojekt angelegt.');
  }));
  const jfStatus=node('p','Jellyfin noch nicht geprüft.','muted');
  actions.append(action('Mit Jellyfin vergleichen',async()=>{
   jfStatus.textContent='Jellyfin-Abgleich wird geprüft …';
   try{
    const result=await api('/api/discover/jellyfin?'+discoveryParams(kind,id));
    if(!result.configured)jfStatus.textContent='Jellyfin ist nicht konfiguriert. Bestand unbekannt.';
    else if(result.state==='matched')jfStatus.textContent=kind==='tv'?'Serienidentität bestätigt · '+result.present.filter(x=>x.season!==0).length+' reguläre Folgen und '+result.specials+' Specials in Jellyfin.':'Film in Jellyfin vorhanden.';
    else jfStatus.textContent=result.reason+' · Der Bestand ist möglicherweise unvollständig oder anders benannt.';
   }catch(e){jfStatus.textContent='Jellyfin-Abgleich fehlgeschlagen: '+e.message;throw e;}
  }));
  if(kind==='movie')actions.append(action('Deutsche Downloadquelle suchen',async()=>renderDiscoverSources(box,{kind,id})));
  box.append(actions,jfStatus);
  if(kind==='tv')renderDiscoverSeasons(box,detail);
 }catch(e){box.replaceChildren(node('p','Detailansicht fehlgeschlagen: '+e.message,'muted'));throw e;}
}
function renderDiscoverSeasons(box,detail){
 const group=node('section','','discoverMetadata');
 group.append(node('h3','Staffeln & Episoden'));
 group.append(node('p','Staffeln aus TMDB. Specials (Staffel 0) werden nur angezeigt, wenn TMDB eine entsprechende Staffel meldet.','hint'));
 const choices=node('select');choices.setAttribute('aria-label','Staffel auswählen');
 for(const s of detail.seasons){
  const opt=node('option',s.season===0?'Specials / Staffel 0':'Staffel '+s.season+(s.episodes!==null?' · '+s.episodes+' Folgen':''));
  opt.value=String(s.season);choices.append(opt);
 }
 if(detail.seasons.some(s=>s.season===1))choices.value='1';
 else if(detail.seasons.length)choices.value=String(detail.seasons[0].season);
 const load=action('Folgen anzeigen',async()=>loadDiscoverSeason(detail.id,Number(choices.value),list));
 const list=node('div','','discoverEpisodeList');
 group.append(choices,load,list);
 if(!detail.seasons.length)group.append(node('p','TMDB meldet noch keine Staffeln.','muted'));
 box.append(group);
}
async function loadDiscoverSeason(id,season,root){
 root.replaceChildren(node('p','Lade Staffelinventar und Jellyfin-Abgleich …','muted'));
 try{
  const data=await api('/api/discover/plan?'+discoveryParams('tv',id,{season}));
  root.replaceChildren();
  root.append(node('p',data.episodes.length+' Folgen · Jellyfin: '+(data.jellyfin.configured?data.jellyfin.reason:'nicht konfiguriert'),'hint'));
  root.append(node('p',data.notice,'hint'));
  const selected=[];
  const rows=node('div','','discoverEpisodeRows');
  for(const ep of data.episodes){
   const label=node('label','','discoverEpisodeRow');
   const checkbox=node('input');
   checkbox.type='checkbox';checkbox.value=String(ep.episode);
   checkbox.disabled=!ep.selectable;
   if(ep.selectable)selected.push(checkbox);
   const title=node('span','S'+String(season).padStart(2,'0')+'E'+String(ep.episode).padStart(2,'0')+' · '+(ep.title||'Ohne Titel'),'discoverEpisodeTitle');
   label.append(checkbox,title,node('small',discoverStatusText(ep.state),'muted'));
   const line=node('div','','discoverEpisodeAction');line.append(label);
   if(ep.selectable)line.append(action('Deutsche Quelle suchen',async()=>renderDiscoverSources(root,{kind:'tv',id,season,episode:ep.episode})));
   rows.append(line);
  }
  root.append(rows);
  if(selected.length){
   const act=node('div','','actionrow');
   act.append(action('Alle geeigneten markieren',async()=>{selected.forEach(ch=>ch.checked=true);}));
   act.append(action('Auswahl zurücksetzen',async()=>{selected.forEach(ch=>ch.checked=false);}));
   act.append(action('Ausgewählte Episoden vormerken',async()=>{
    const chosen=selected.filter(c=>c.checked).map(c=>Number(c.value));
    if(!chosen.length)throw Error('Bitte Episoden auswählen.');
    if(!confirm(chosen.length+' Episoden in ForgeCore registrieren? Dies startet keine Downloads.'))return;
    const result=await api('/api/discover/plan/apply',{method:'POST',body:{id,season,episodes:chosen,confirm:'ADD_MISSING'}});
    notify(result.added+' neue Episoden registriert · 0 Downloads gestartet.');
    await loadDiscoverSeason(id,season,root);
   }));
   root.append(act);
  }
  if(!data.episodes.length)root.append(node('p','Keine Episoden in dieser TMDB-Staffel gefunden.','muted'));
 }catch(e){root.replaceChildren(node('p','Staffelprüfung fehlgeschlagen: '+e.message,'muted'));throw e;}
}
$('#discoverWatchlistReload').addEventListener('click',()=>refreshDiscoverWatchlist().catch(e=>notify(e.message,true)));
$('#discoverRadarCheck').addEventListener('click',async()=>{
 try{
  const r=await api('/api/discover/radar/check',{method:'POST',body:{}});
  await refreshDiscoverWatchlist();
  notify(r.checked+' Termine geprüft · '+r.notified+' Hinweise · '+(r.german?.confirmed||0)+' deutsche Quellen bestätigt · '+(r.german?.queued||0)+' Downloads geplant');
 }catch(e){notify(e.message,true);}
});


// v1.5.2–v1.6.0: audited, authenticated saved-site results only.
async function renderDiscoverSources(host,request){
 let area=host.querySelector('.discoverSourcePicker');
 if(!area){area=node('section','','discoverSourcePicker');host.append(area);}
 area.replaceChildren(node('p','Durchsuche aktivierte Quellen und prüfe deutsche Tonspuren …','muted'));
 const params=discoveryParams(request.kind,request.id,request.kind==='tv'?{season:request.season,episode:request.episode}:{});
 try{
  const data=await api('/api/discover/download-sources?'+params);
  area.replaceChildren(node('h3','Deutsche Downloadquellen'));
  area.append(node('p','Von '+data.checkedSites+' gespeicherten Websites geprüft · '+data.results.length+' direkte Mediendateien','hint'));
  for(const result of data.results){
   const card=node('div','','discoverSourceResult');
   const status=result.language==='german'?'Deutsch laut Playlist':result.language==='not-german'?'Gibt es noch nicht auf Deutsch':
      result.language==='unverified'?'Deutsch nicht bestätigt':'Nicht unterstützt';
   card.append(node('strong',result.siteLabel),node('span',status,'discoverLanguageStatus '+result.language));
   card.append(node('small',result.languageReason||'', 'muted'));
   const actionRow=node('div','','actionrow');
   if(result.canAttempt){
    actionRow.append(action(result.language==='german'?'Deutschen Download planen':'Deutsch prüfen & Download versuchen',async()=>{
     const unknown=result.language!=='german';
     const question=unknown?'Deutsche Tonspur ist noch nicht nachgewiesen. Datei prüfen und nur bei deutscher Audiospur in Jellyfin importieren?':
      'Download der deutschen Quelle planen? Der Import erfolgt nur bei bestätigter deutscher Audiospur.';
     if(!confirm(question))return;
     if(request.kind==='tv'){
      await api('/api/discover/add',{method:'POST',body:{kind:'tv',id:request.id}});
      await api('/api/discover/plan/apply',{method:'POST',body:{id:request.id,season:request.season,episodes:[request.episode],confirm:'ADD_MISSING'}});
     }else await api('/api/discover/add',{method:'POST',body:{kind:'movie',id:request.id}});
     const saved=await api('/api/discover/download',{method:'POST',body:{...request,siteId:result.siteId,url:result.url,confirm:'DOWNLOAD_GERMAN',confirmUnknownGerman:unknown}});
     notify('Downloadauftrag angelegt · '+(saved.language==='german'?'Deutsch laut Playlist':'Deutsch wird vor Import überprüft'));
     await refreshDownloadDashboard();
    }));
   }
   card.append(actionRow);
   area.append(card);
  }
  area.append(node('p',data.notice||'Verfügbarkeit nicht nachweisbar.','discoverSourceNotice'));
  const catalogs=data.catalogHits||[];
  if(catalogs.length){
   const titles=node('section','','discoverCatalogueMatches');
   titles.append(node('h4','Website- und Episodentreffer ('+catalogs.length+')'));
   titles.append(node('p','Diese Treffer sind Katalog-/Wiedergabeseiten, keine Download-Dateien. Sie beweisen weder eine deutsche Tonspur noch die Downloadberechtigung.','hint'));
   const relevant=catalogs.filter(x=>x.exactEpisode||x.exactMovie||x.mediaType==='title'||x.mediaType==='series');
   let firstExactRow=null,firstExactHit=null;
   for(const hit of relevant.slice(0,12)){
    const row=node('article','','discoverSourceResult');
    if(!firstExactRow&&(hit.exactEpisode||hit.exactMovie)){firstExactRow=row;firstExactHit=hit;}
    const name=hit.exactEpisode?'Genau diese Episode im Katalog':hit.exactMovie?'Filmseite gefunden':'Titel-/Serienseite gefunden · Episode nicht bestätigt';
    row.append(node('strong',hit.siteLabel),node('span',name,'discoverLanguageStatus'));
    row.append(node('small',hit.title||'', 'muted'));
    const actions=node('div','','actionrow');
    const link=node('a','Seite öffnen','outline');link.href=hit.url;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);
    if(hit.exactEpisode||hit.exactMovie){
     actions.append(action('Browser-Agent: Stream selbst erkennen',async()=>{
      await showBrowserAgentResults(row,request,hit);
     }));
     actions.append(action('Externe Player prüfen',async()=>{
      const checked=await api('/api/playerbridge/inspect',{method:'POST',body:{siteId:hit.siteId,url:hit.url}});
      row.querySelector('.discoverPlayerCheck')?.remove();
      const panel=node('div','','discoverPlayerCheck');
      panel.append(node('p',checked.counts.external+' externe Player · '+checked.counts.direct+' direkte Mediendateien','muted'));
      for(const player of checked.players){
       const a=node('a',(player.hoster||'Player')+' · '+(player.kind==='direct'?'Direktlink':'Externer Wiedergabelink'));
       a.href=player.url;a.target='_blank';a.rel='noopener noreferrer';panel.append(a);
      }
      if(!checked.players.length)panel.append(node('p','Keine unterstützten Player-Links im statischen HTML gefunden.','hint'));
      row.append(panel);
     }));
    }
    row.append(actions);titles.append(row);
   }
   if(!relevant.length)titles.append(node('p','Treffer vorhanden, aber nicht eindeutig dieser Episode zugeordnet.','hint'));
   area.append(titles);
   // A deliberate Discover source search is permission to run one bounded browser
   // observation for one exact catalogue episode. No automatic download/queueing.
   if(!data.results.length&&firstExactRow&&firstExactHit){
    try{
     const agentStatus=await api('/api/browser-agent/status');
     if(agentStatus.online&&!agentStatus.busy){
      await showBrowserAgentResults(firstExactRow,request,firstExactHit);
     }else if(!agentStatus.online){
      titles.append(node('p','Chromium-Agent nicht aktiviert. Bei Bedarf auf ZimaOS das Compose-Profil browser starten.','hint'));
     }
    }catch(error){titles.append(node('p','Automatische Browseranalyse: '+error.message,'hint'));}
   }
  }
  if(!data.results.length){
   area.append(node('p','Keine direkte Downloadquelle nachgewiesen. Die deutsche Verfügbarkeit ist unbekannt.','discoverSourceNotice'));
  }
  for(const error of (data.errors||[]).slice(0,10))
   area.append(node('p',error.siteLabel+': '+error.error,'discoverSourceNotice'));
  for(const warning of (data.warnings||[]).slice(0,10))
   area.append(node('p',warning.siteLabel+': '+warning.message,'hint'));
  area.scrollIntoView({behavior:'smooth',block:'nearest'});
 }catch(e){area.replaceChildren(node('p','Quellensuche fehlgeschlagen: '+e.message,'discoverMissing'));throw e}
}
// v1.5.5: a separate download workbench; no duplicate queue implementation.
async function refreshDownloadDashboard(){
 const root=$('#downloadDashboard'),metrics=$('#downloadMetrics');
 if(!root||!metrics)return;
 const data=await api('/api/transfers');
 const items=data.items||[];
 root.replaceChildren();metrics.replaceChildren();
 for(const [name,state] of [['Geplant','queued'],['Aktiv','running'],['Abgeschlossen','complete'],['Fehlgeschlagen','failed']]){
  const tile=node('div','','opsMetric');tile.append(node('small',name),node('strong',String(items.filter(i=>i.state===state).length)));
  metrics.append(tile);
 }
 for(const item of items){
  const box=node('article','','entry downloadEntry'),top=node('div','','entryhead');
  top.append(node('strong',item.url.split('/').pop()||'Medien-Download'));
  top.append(node('span',({queued:'Geplant',running:'Läuft',complete:'Fertig',failed:'Fehler',cancelled:'Abgebrochen'}[item.state]||item.state),'muted'));
  box.append(top);
  const progress=node('progress');progress.value=Math.max(0,Math.min(100,Number(item.progress)||0));progress.max=100;
  progress.setAttribute('aria-label','Downloadfortschritt in Prozent');box.append(progress);
  box.append(node('p',String(item.progress||0)+'% · '+(Number(item.downloaded_bytes||0)/1048576).toFixed(1)+' MiB','muted'));
  if(item.error)box.append(node('p',item.error.includes('Deutsch')?item.error:'Fehler: '+item.error,'discoverMissing'));
  const controls=node('div','','actionrow');
  if(['queued','running'].includes(item.state))controls.append(action('Abbrechen',async()=>{await api('/api/transfers/'+item.id+'/cancel',{method:'POST'});await refreshDownloadDashboard();}));
  if(['failed','cancelled'].includes(item.state))controls.append(action('Wiederholen',async()=>{if(!confirm('Download erneut prüfen und versuchen?'))return;await api('/api/transfers/'+item.id+'/retry',{method:'POST'});await refreshDownloadDashboard();}));
  controls.append(action('Ereignisse',async()=>{
   const result=await api('/api/transfers/'+item.id+'/events');
   box.querySelector('pre')?.remove();box.append(node('pre',result.items.map(e=>e.created_at+' · '+e.category+': '+e.description).join('\n'),'downloadEvents'));
  }));
  box.append(controls);root.append(box);
 }
 if(!items.length)root.append(node('p','Noch keine deutschen Downloadaufträge.','muted'));
}
$('#downloadRefresh')?.addEventListener('click',()=>refreshDownloadDashboard().catch(e=>notify(e.message,true)));
async function refreshRadarDashboard(){
 const summary=$('#radarSummary'),list=$('#radarWatchlist');
 if(!summary||!list)return;
 const data=await api('/api/discover/watchlist');
 list.replaceChildren();summary.replaceChildren();
 for(const [label,value] of [['Merkliste',data.items.length],['Aktiv überwacht',data.items.filter(x=>x.monitored).length]]){
  const tile=node('div','','opsMetric');tile.append(node('small',label),node('strong',String(value)));summary.append(tile);
 }
 for(const item of data.items){
  const row=node('article','','entry');row.append(node('strong',item.title+' · '+(item.monitored?'Überwacht':'Nicht überwacht')));
  if(item.lastCheckedAt)row.append(node('small','Letzte Terminprüfung: '+item.lastCheckedAt,'muted'));
  row.append(node('p','Termine aus TMDB/TVmaze sind nicht automatisch deutsche Veröffentlichungen. Deutsche Quellen separat prüfen.','hint'));
  row.append(action('Titel in Discover öffnen',async()=>{showView('discover');await showDiscoverDetail(item.kind,item.id);}));
  list.append(row);
 }
 if(!data.items.length)list.append(node('p','Noch keine überwachten Titel.','muted'));
}


// v1.7.0 – Independent Chromium observation on the ZimaOS host (no connector required).
async function showBrowserAgentResults(row,request,hit){
 let root=row.querySelector('.browserAgentResults');
 if(!root){root=node('section','','browserAgentResults');row.append(root);}
 root.replaceChildren(node('p','Chromium lädt die passende Seite und beobachtet Medienanfragen …','muted'));
 try{
  const status=await api('/api/browser-agent/status');
  if(!status.online)throw Error('Browser-Agent ist nicht gestartet. Auf ZimaOS: sudo docker compose --profile browser up -d --build');
  if(status.busy)throw Error('Browser-Agent bearbeitet noch eine andere Medienanalyse.');
  const result=await api('/api/discover/browser-scan',{method:'POST',body:{
   ...request,siteId:hit.siteId,url:hit.url,confirm:'SCAN_MEDIA'
  }});
  root.replaceChildren(node('h4','Browser-Agent – '+result.sources.length+' Medienanfragen erkannt'));
  const d=result.diagnostics||{};
  root.append(node('p','HTML5-Startversuche: '+result.playAttempts+
   ' · Wiedergabe tatsächlich bestätigt: '+(d.playingVideos??'unbekannt')+
   ' · Video-Elemente: '+(d.videoElements??'unbekannt'),'hint'));
  root.append(node('p','Gezielter HTML5-Klick: '+(d.videoGestureClicks??'unbekannt')+
   ' · Klickfehler: '+(d.videoGestureClickFailures??'unbekannt')+
   ' · Pausierte Videos: '+(d.pausedVideos??'unbekannt')+
   ' · Noch nicht abspielbereit: '+(d.unreadyVideos??'unbekannt'),'hint'));
  root.append(node('p','Startversuch ohne Videodaten: '+(d.videoGestureStalled??'unbekannt')+
   ' · Kein sichtbares HTML5-Video: '+(d.videoGestureHidden??'unbekannt')+
   ' · HTML5 ohne Quelladresse: '+(d.videoGestureNoSource??'unbekannt')+
   ' · Video bereits laufend: '+(d.videoGestureAlreadyPlaying??'unbekannt'),'hint'));
  root.append(node('p','Netzwerkantworten: '+(d.responses??'unbekannt')+
   ' · Medienantworten: '+(d.mediaResponses??'unbekannt')+
   ' · Ohne unterstützte Dateiendung: '+(d.mediaWithoutExtension??'unbekannt')+
   ' · Gesperrte Anfragen: '+result.blockedRequests,'hint'));
  if(d.videoErrors)root.append(node('p','Chromium meldet Fehler bei '+d.videoErrors+' Video-Element(en).','discoverSourceNotice'));
  root.append(node('p',result.notice||'', 'muted'));
  for(const warning of result.warning||[])root.append(node('p',warning,'hint'));
  for(const candidate of result.sources){
   const card=node('article','','discoverSourceResult');
   const language=candidate.language==='german'?'Deutsch laut Manifest':
     candidate.language==='not-german'?'Nicht Deutsch':
     candidate.language==='unverified'?'Audiosprache nicht bestätigt':'Nicht unterstützt';
   card.append(node('strong',candidate.host+' · '+candidate.format.toUpperCase()));
   card.append(node('span',language,'discoverLanguageStatus '+candidate.language));
   card.append(node('small',candidate.reason||'','muted'));
   if(candidate.canQueue)card.append(action(candidate.language==='german'?'Download planen':'Download mit Deutschprüfung versuchen',async()=>{
    const unknown=candidate.language==='unverified';
    const question=unknown?'Der Browser hat eine Medienadresse beobachtet, aber Deutsch ist noch nicht bestätigt. Nur nach erfolgreicher deutscher Sprachprüfung nach Jellyfin übernehmen?':
       'Deutsche Audiospur in Playlist ausgewiesen. Download verbindlich planen?';
    if(!confirm(question))return;
    if(request.kind==='tv'){
     await api('/api/discover/add',{method:'POST',body:{kind:'tv',id:request.id}});
     await api('/api/discover/plan/apply',{method:'POST',body:{id:request.id,season:request.season,episodes:[request.episode],confirm:'ADD_MISSING'}});
    }else await api('/api/discover/add',{method:'POST',body:{kind:'movie',id:request.id}});
    const queued=await api('/api/discover/browser-download',{method:'POST',body:{
     scanId:result.scanId,candidateId:candidate.id,confirm:'DOWNLOAD_GERMAN',confirmUnknownGerman:unknown
    }});
    notify('Browser-Agent: Download geplant · '+(queued.notice||'Deutsch wird vor Jellyfin-Import geprüft'));
   }));
   root.append(card);
  }
  if(!result.sources.length)root.append(node('p',d.playingVideos===0?
   'Kein direkter Mediastream erkannt und keine tatsächliche Videowiedergabe nachgewiesen. Der Browser-Agent kann notwendige Klicks, Captchas oder Zugriffsschutz nicht automatisch überwinden.':
   'Kein unterstützter direkter Mediastream erkennbar. Die zusätzlichen Netzwerkzahlen zeigen, ob andere Medienantworten beobachtet wurden.',
   'discoverSourceNotice'));
 }catch(e){root.replaceChildren(node('p','Browser-Agent: '+e.message,'discoverSourceNotice'));throw e}
}
