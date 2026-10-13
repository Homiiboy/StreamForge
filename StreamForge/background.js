import { classifyCandidate, cleanUrl, displayName, makeCandidateKey, safeHostname, extensionFromUrl, safeFilename, hlsProbeContainsVariant } from "./media.js";
import { shouldRetryStatus, describeFetchFailure, failureInfo, formatDiagnostic, backoffMs } from "./network.js";
import { profileFromObservedHeaders, cookieHeaderFromCookies, buildRequestHeaderRule, summarizeRequestProfile } from "./request-profile.js";
import { buildMediaBasename, suggestNaming, validateNaming } from "./naming.js";
import { describeDownloadError, exportStorageKey, isRetainedExportRecord, canonicalMediaMime, normalizeMediaFilename } from "./export.js";
import { QUICK_PROBE_ATTEMPTS, ROBUST_PROBE_ATTEMPTS, PROBE_RETRY_COOLDOWN_MS, probeTimeoutMs, hlsPlaylistType, buildProbeSummary } from "./probe-utils.js";

const MAX_PER_TAB = 80;
const stateKey = tabId => `sf_tab_${tabId}`;
const previewKey = tabId => `sf_preview_${tabId}`;
const pageMetaKey = tabId => `sf_meta_${tabId}`;
const requestContext = new Map();
const OFFSCREEN_PATH = "offscreen.html";
let creatingOffscreen = null;
const downloadJobs = new Map();
const requestBridgeRules = new Map();
const probeInflight = new Map();
const pendingDownloadStatus = new Map();
const progressFlushTimers = new Map();
const PROGRESS_STORAGE_INTERVAL_MS = 900;
let nextRequestRuleId = 900000;


function humanBytes(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
function retainedExportStorage() { return chrome.storage.local || chrome.storage.session; }
async function saveRetainedExport(meta) {
  if (!isRetainedExportRecord(meta)) throw new Error('Ungültige Export-Metadaten.');
  const cleanMime = canonicalMediaMime(meta.mime || 'application/octet-stream');
  const cleanFilename = normalizeMediaFilename(safeFilename(meta.filename || 'StreamForge-Download'), cleanMime);
  const clean = {
    jobId: String(meta.jobId), tabId: Number(meta.tabId), candidateId: String(meta.candidateId || ''),
    tempName: String(meta.tempName), tempNames: Array.isArray(meta.tempNames) && meta.tempNames.length ? meta.tempNames.map(String) : [String(meta.tempName)],
    filename: cleanFilename, bytes: Number(meta.bytes || 0), mime: cleanMime,
    createdAt: Number(meta.createdAt || Date.now()), updatedAt: Date.now()
  };
  await retainedExportStorage().set({ [exportStorageKey(clean.jobId)]: clean });
  return clean;
}
async function readRetainedExport(jobId) {
  const key = exportStorageKey(jobId); const data = await retainedExportStorage().get(key); const record = data?.[key];
  return isRetainedExportRecord(record) ? record : null;
}
async function removeRetainedExport(jobId) { try { await retainedExportStorage().remove(exportStorageKey(jobId)); } catch {} }
async function releaseExportBlob(jobId) {
  try { await ensureOffscreen(); await chrome.runtime.sendMessage({ type: 'sf_export_release', target: 'offscreen', jobId }); } catch {}
}
async function discardRetainedExport(jobId, fallbackTempNames = []) {
  const meta = await readRetainedExport(jobId);
  const tempNames = meta?.tempNames?.length ? meta.tempNames : fallbackTempNames;
  try { await ensureOffscreen(); await chrome.runtime.sendMessage({ type: 'sf_export_discard', target: 'offscreen', jobId, tempNames }); } catch {}
  await removeRetainedExport(jobId);
}
async function exportFailureStatus(meta, rawError) {
  const info = describeDownloadError(rawError);
  await releaseExportBlob(meta.jobId);
  const invalidPreparedFile = ['EXPORT_EMPTY','EXPORT_PLAYLIST_CONTENT','EXPORT_HTML_CONTENT','EXPORT_INVALID_TS','EXPORT_INVALID_MP4','EXPORT_TYPE_MISMATCH'].includes(info.code);
  if (invalidPreparedFile) await discardRetainedExport(meta.jobId, meta.tempNames || []).catch(()=>{});
  await setDownloadStatus(meta.tabId, meta.candidateId, {
    state: 'export_error', phase: 'export', progress: 100, downloadProgress: 100, muxProgress: 100,
    bytes: Number(meta.bytes || 0), outputBytes: Number(meta.bytes || 0), exportBytes: Number(meta.bytes || 0),
    exportRetryAvailable: Boolean(info.retryable), exportJobId: invalidPreparedFile ? '' : meta.jobId, exportErrorCode: info.code,
    exportFilename: meta.filename,
    message: `${info.title}: ${info.text}`,
    diagnostic: { code: info.code, title: info.title, text: info.text, suggestion: info.suggestion, label: `Export · ${humanBytes(meta.bytes)}`, when: Date.now() }
  });
  return info;
}
async function prepareExportUrl(meta) {
  await ensureOffscreen();
  const response = await chrome.runtime.sendMessage({ type: 'sf_export_prepare', target: 'offscreen', export: meta });
  if (!response?.ok || !response?.blobUrl) {
    const e = new Error(response?.error || 'Temporäre Datei konnte nicht für den Export geöffnet werden.');
    e.code = response?.code || 'EXPORT_PREPARE_FAILED'; throw e;
  }
  return response;
}
async function startFinalExport(meta, { blobUrl = '', retry = false } = {}) {
  meta = await saveRetainedExport(meta);
  let prepared = null;
  try {
    prepared = blobUrl ? { ...meta, blobUrl } : await prepareExportUrl(meta);
    const preparedMime = canonicalMediaMime(prepared.mime || meta.mime);
    const preparedFilename = normalizeMediaFilename(safeFilename(prepared.filename || meta.filename), preparedMime);
    if ((prepared.bytes && Number(prepared.bytes) !== Number(meta.bytes)) || preparedMime !== meta.mime || preparedFilename !== meta.filename) {
      meta = await saveRetainedExport({ ...meta, bytes: Number(prepared.bytes || meta.bytes), mime: preparedMime, filename: preparedFilename });
    }
    await setDownloadStatus(meta.tabId, meta.candidateId, {
      state: 'saving', phase: 'export', progress: 100, downloadProgress: 100, muxProgress: 100,
      bytes: meta.bytes, outputBytes: meta.bytes, exportBytes: meta.bytes, exportRetryAvailable: false, exportJobId: meta.jobId,
      exportFilename: meta.filename, message: `${retry ? 'Speichern wird erneut versucht' : 'Speicherort auswählen'} · ${humanBytes(meta.bytes)}`
    });
    const id = await chrome.downloads.download({ url: prepared.blobUrl, filename: meta.filename, saveAs: true });
    if (!Number.isInteger(id) || id < 0) throw Object.assign(new Error('Chrome hat keine gültige Download-ID zurückgegeben.'), { code: 'EXPORT_DOWNLOAD_ID_MISSING' });
    const job = { jobId: meta.jobId, tabId: meta.tabId, candidateId: meta.candidateId, offscreen: true, tempNames: meta.tempNames };
    downloadJobs.set(id, job);
    // Once downloads.download() returned an id, never revoke the Blob merely
    // because persistence of our recovery metadata failed. Chrome may already
    // be reading the URL at this point. The in-memory map still handles the
    // normal completion event.
    try { await chrome.storage.session.set({ [`sf_dl_${id}`]: job }); } catch {}
    return { id, meta };
  } catch (err) {
    if (err?.code === 'EXPORT_TEMP_MISSING') {
      await removeRetainedExport(meta.jobId);
      await setDownloadStatus(meta.tabId, meta.candidateId, {
        state: 'error', phase: 'export', progress: 100, downloadProgress: 100, muxProgress: 100,
        exportRetryAvailable: false, exportJobId: '', exportErrorCode: 'EXPORT_TEMP_MISSING', exportBytes: Number(meta.bytes || 0),
        message: 'Temporäre Datei nicht mehr vorhanden',
        diagnostic: { code: 'EXPORT_TEMP_MISSING', title: 'Temporäre Datei nicht mehr vorhanden', text: 'Die fertig gemuxte OPFS-Datei konnte nicht mehr geöffnet werden.', suggestion: 'Der Film muss leider erneut heruntergeladen werden.', when: Date.now() }
      });
    } else {
      await exportFailureStatus(meta, err?.code || err?.message || err);
    }
    throw err;
  }
}

async function clearStaleRequestBridgeRules() {
  try {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const ids = rules.filter(r => r.id >= 900000 && r.id < 1000000).map(r => r.id);
    if (ids.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
  } catch {}
}
clearStaleRequestBridgeRules();

async function cookieStoreForTab(tabId) {
  if (!Number.isInteger(tabId)) return undefined;
  try {
    const stores = await chrome.cookies.getAllCookieStores();
    return stores.find(s => Array.isArray(s.tabIds) && s.tabIds.includes(tabId))?.id;
  } catch { return undefined; }
}

async function sessionCookiesForUrl(url, job = {}) {
  const storeId = await cookieStoreForTab(job.tabId);
  const base = { url };
  if (storeId) base.storeId = storeId;
  const all = [];
  let partitionKey = null;
  if (chrome.cookies.getPartitionKey && Number.isInteger(job.tabId) && Number.isInteger(job.frameId) && job.frameId >= 0) {
    try { partitionKey = await chrome.cookies.getPartitionKey({ tabId: job.tabId, frameId: job.frameId }); } catch {}
  }
  if (!partitionKey?.topLevelSite && job.pageUrl) {
    try { partitionKey = { topLevelSite: new URL(job.pageUrl).origin }; } catch {}
  }
  // Partitionierte Cookies zuerst: bei eingebetteten Playern sind sie oft die exakt zum Top-Level-Tab gehörende Session.
  if (partitionKey?.topLevelSite) { try { all.push(...await chrome.cookies.getAll({ ...base, partitionKey })); } catch {} }
  try { all.push(...await chrome.cookies.getAll(base)); } catch {}
  const seenNames = new Set();
  return all.filter(c => { if (seenNames.has(c.name)) return false; seenNames.add(c.name); return true; });
}

async function prepareRequestBridge(job, url) {
  const u = new URL(url);
  const hostname = u.hostname;
  if (!hostname || !job?.jobId) return { ok: false, reason: "Kein Host/Job" };
  let entry = requestBridgeRules.get(job.jobId);
  if (!entry) { entry = new Map(); requestBridgeRules.set(job.jobId, entry); }
  if (entry.has(hostname)) return entry.get(hostname).summary;
  const cookies = await sessionCookiesForUrl(url, job);
  const cookieHeader = cookieHeaderFromCookies(cookies);
  const profile = job.requestProfile || { referer: job.referer || "", origin: job.origin || "" };
  const id = nextRequestRuleId++;
  if (nextRequestRuleId >= 1000000) nextRequestRuleId = 900000;
  const rule = buildRequestHeaderRule({ id, hostname, extensionId: chrome.runtime.id, profile, cookieHeader });
  if (rule) {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({ addRules: [rule], removeRuleIds: [] });
      const summary = { ok: true, hostname, ruleId: id, cookieCount: cookies.length, flags: summarizeRequestProfile(profile, cookies.length) };
      entry.set(hostname, { id, summary });
      return summary;
    } catch (e) {
      const summary = { ok: false, hostname, cookieCount: cookies.length, flags: summarizeRequestProfile(profile, cookies.length), reason: String(e?.message || e) };
      entry.set(hostname, { id: null, summary });
      return summary;
    }
  }
  const summary = { ok: true, hostname, ruleId: null, cookieCount: cookies.length, flags: summarizeRequestProfile(profile, cookies.length) };
  entry.set(hostname, { id: null, summary });
  return summary;
}

async function cleanupRequestBridge(jobId) {
  const entry = requestBridgeRules.get(jobId);
  if (!entry) return;
  const ids = [...entry.values()].map(x => x.id).filter(Number.isInteger);
  requestBridgeRules.delete(jobId);
  if (ids.length) { try { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids, addRules: [] }); } catch {} }
}

async function ensureOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (contexts.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["BLOBS"],
      justification: "HLS-/DASH-Spuren lokal zusammenführen, Audio und Video muxen und als Browser-Download bereitstellen."
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function setDownloadStatus(tabId, candidateId, patch) {
  if (!Number.isInteger(tabId) || !candidateId) return;
  if (patch?.reset) discardQueuedDownloadStatus(tabId, candidateId);
  const items = await readTab(tabId);
  const hit = items.find(x => x.id === candidateId);
  if (!hit) return;
  const previous = patch.reset ? {} : (hit.download || {});
  const diagnostics = Array.isArray(previous.diagnostics) ? [...previous.diagnostics] : [];
  if (patch.diagnostic) {
    diagnostics.unshift({ at: Date.now(), ...patch.diagnostic });
    diagnostics.splice(8);
  }
  const cleanPatch = { ...patch };
  delete cleanPatch.diagnostic;
  delete cleanPatch.reset;
  hit.download = { ...previous, ...cleanPatch, diagnostics, updated: Date.now() };
  await writeTab(tabId, items, { updateBadge: false });
}

function downloadStatusKey(tabId, candidateId) { return `${tabId}:${candidateId}`; }

function discardQueuedDownloadStatus(tabId, candidateId) {
  const key = downloadStatusKey(tabId, candidateId);
  const timer = progressFlushTimers.get(key);
  if (timer) clearTimeout(timer);
  progressFlushTimers.delete(key);
  pendingDownloadStatus.delete(key);
}

async function flushQueuedDownloadStatus(tabId, candidateId) {
  const key = downloadStatusKey(tabId, candidateId);
  const timer = progressFlushTimers.get(key);
  if (timer) clearTimeout(timer);
  progressFlushTimers.delete(key);
  const queued = pendingDownloadStatus.get(key);
  pendingDownloadStatus.delete(key);
  if (queued) await setDownloadStatus(tabId, candidateId, queued);
}

function queueDownloadStatus(tabId, candidateId, patch) {
  const key = downloadStatusKey(tabId, candidateId);
  const previous = pendingDownloadStatus.get(key) || {};
  pendingDownloadStatus.set(key, { ...previous, ...patch });
  if (!progressFlushTimers.has(key)) {
    const timer = setTimeout(() => {
      progressFlushTimers.delete(key);
      const queued = pendingDownloadStatus.get(key);
      pendingDownloadStatus.delete(key);
      if (queued) setDownloadStatus(tabId, candidateId, queued).catch(() => {});
    }, PROGRESS_STORAGE_INTERVAL_MS);
    progressFlushTimers.set(key, timer);
  }
}

function ensureMediaExtension(filename, mime='') {
  return normalizeMediaFilename(safeFilename(filename || 'StreamForge-Download'), canonicalMediaMime(mime));
}
function extensionFromMime(mime='') {
  const m=String(mime||'').toLowerCase().split(';',1)[0].trim();
  return ({'video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov','audio/mpeg':'.mp3','audio/mp4':'.m4a','audio/aac':'.aac','audio/ogg':'.ogg','audio/opus':'.opus','audio/wav':'.wav','audio/x-wav':'.wav'})[m]||'';
}

function getHeader(headers, name) {
  const n = String(name).toLowerCase();
  const h = (headers || []).find(x => String(x.name || "").toLowerCase() === n);
  return h?.value || "";
}
async function readTab(tabId) { const key = stateKey(tabId); const data = await chrome.storage.session.get(key); return Array.isArray(data[key]) ? data[key] : []; }
async function writeTab(tabId, items, { updateBadge: shouldUpdateBadge = true } = {}) { const key = stateKey(tabId); await chrome.storage.session.set({ [key]: items.slice(0, MAX_PER_TAB) }); if (shouldUpdateBadge) await updateBadge(tabId, items.length); }
async function readPreviews(tabId) { const key = previewKey(tabId); const data = await chrome.storage.session.get(key); return Array.isArray(data[key]) ? data[key] : []; }
async function writePreviews(tabId, items) { await chrome.storage.session.set({ [previewKey(tabId)]: items.slice(0, 12) }); }
async function readPageMeta(tabId) { const key = pageMetaKey(tabId); const data = await chrome.storage.session.get(key); return Array.isArray(data[key]) ? data[key] : []; }
async function writePageMeta(tabId, items) { await chrome.storage.session.set({ [pageMetaKey(tabId)]: items.slice(0, 20) }); }
function mediaMetaScore(m={}) { return [m.type,m.title||m.seriesTitle,m.year,m.season,m.episode].filter(x=>x!==undefined&&x!==null&&String(x)!=='').length; }
async function rememberPageMeta(tabId, meta={}) {
  const frameUrl=cleanUrl(meta.frameUrl)||''; const mediaMeta=meta.mediaMeta&&typeof meta.mediaMeta==='object'?meta.mediaMeta:{};
  if(!frameUrl&&!Object.keys(mediaMeta).length)return;
  const list=await readPageMeta(tabId); const idx=list.findIndex(x=>x.frameUrl===frameUrl);
  const entry={frameUrl,isTop:Boolean(meta.isTop),mediaMeta,seen:Date.now()}; if(idx>=0)list.splice(idx,1); list.unshift(entry); await writePageMeta(tabId,list);
  const items=await readTab(tabId); let changed=false;
  for(const item of items){
    const relevant=entry.isTop||item.pageUrl===frameUrl||item.frameUrl===frameUrl; if(!relevant)continue;
    const incomingScore=mediaMetaScore(mediaMeta), currentScore=mediaMetaScore(item.mediaMeta||{}); if(incomingScore>currentScore||(entry.isTop&&incomingScore>=currentScore)){item.mediaMeta=mediaMeta; if(item.namingAuto!==false) item.naming=suggestNaming({mediaMeta,title:item.title}); changed=true;}
  }
  if(changed) await writeTab(tabId,items,{updateBadge:false});
}
async function choosePageMeta(tabId, partial={}) {
  const list=await readPageMeta(tabId); const page=cleanUrl(partial.pageUrl),frame=cleanUrl(partial.frameUrl); const direct=partial.mediaMeta&&Object.keys(partial.mediaMeta).length?partial.mediaMeta:null;
  const top=(list.find(x=>page&&x.frameUrl===page)||list.find(x=>x.isTop))?.mediaMeta||null;
  // For iframe/player candidates prefer equally rich top-level metadata; generic player titles should not win ties.
  if(top&&(!direct||page!==frame)&&mediaMetaScore(top)>=mediaMetaScore(direct||{}))return top;
  if(direct)return direct;
  return top || list.find(x=>frame&&x.frameUrl===frame)?.mediaMeta || list[0]?.mediaMeta || {};
}

async function updateBadge(tabId, count = null) {
  if (tabId < 0) return;
  if (count === null) count = (await readTab(tabId)).length;
  await chrome.action.setBadgeText({ tabId, text: count ? String(Math.min(count, 99)) : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#ff8a00" });
}

async function rememberPreview(tabId, preview) {
  const url = cleanUrl(preview?.previewUrl); if (!url) return;
  const frameUrl = cleanUrl(preview?.frameUrl) || "";
  const previews = await readPreviews(tabId);
  const idx = previews.findIndex(p => p.frameUrl === frameUrl);
  const entry = { previewUrl: url, frameUrl, title: preview?.title || "", mediaMeta: preview?.mediaMeta || {}, seen: Date.now() };
  if (idx >= 0) previews.splice(idx, 1);
  previews.unshift(entry); await writePreviews(tabId, previews);
  const items = await readTab(tabId);
  let changed = false;
  for (const item of items) {
    if (!item.previewUrl && (!frameUrl || item.frameUrl === frameUrl || item.pageUrl === frameUrl)) { item.previewUrl = url; changed = true; }
  }
  if (changed) await writeTab(tabId, items);
}

async function choosePreview(tabId, partial) {
  const direct = cleanUrl(partial.previewUrl); if (direct) return direct;
  const previews = await readPreviews(tabId);
  const frame = cleanUrl(partial.frameUrl);
  return previews.find(p => p.frameUrl === frame)?.previewUrl || previews[0]?.previewUrl || "";
}

async function addCandidate(tabId, partial) {
  if (tabId < 0) return;
  const url = cleanUrl(partial.url); if (!url) return;
  const kind = partial.kind || classifyCandidate({ url, contentType: partial.contentType, resourceType: partial.resourceType });
  if (!kind) return;
  const mediaMeta = await choosePageMeta(tabId, partial);
  const candidate = {
    id: crypto.randomUUID(), url, kind,
    title: partial.title || displayName(url), host: safeHostname(url),
    pageUrl: cleanUrl(partial.pageUrl) || "", frameUrl: cleanUrl(partial.frameUrl) || "",
    referer: cleanUrl(partial.referer) || cleanUrl(partial.frameUrl) || cleanUrl(partial.pageUrl) || "",
    origin: partial.origin || "", requestProfile: partial.requestProfile || { referer: cleanUrl(partial.referer) || "", origin: partial.origin || "", accept: "", acceptLanguage: "" },
    frameId: Number.isInteger(partial.frameId) ? partial.frameId : -1, source: partial.source || "network",
    contentType: partial.contentType || "", contentLength: Number(partial.contentLength || 0),
    previewUrl: await choosePreview(tabId, partial), probe: partial.probe || null, mediaMeta,
    naming: partial.naming || suggestNaming({ mediaMeta, title: partial.title || displayName(url) }), namingAuto: partial.namingAuto !== false,
    firstSeen: partial.firstSeen || Date.now(), lastSeen: Date.now(), hits: 1
  };
  const key = makeCandidateKey(candidate); const items = await readTab(tabId);
  const oldIndex = items.findIndex(x => makeCandidateKey(x) === key);
  if (oldIndex >= 0) {
    const old = items[oldIndex]; items.splice(oldIndex, 1);
    const score = p => [p?.referer,p?.origin,p?.accept,p?.acceptLanguage].filter(Boolean).length;
    const requestProfile = score(old.requestProfile) >= score(candidate.requestProfile) ? old.requestProfile : candidate.requestProfile;
    const frameId = candidate.frameId >= 0 ? candidate.frameId : (old.frameId ?? -1);
    const mergedMeta = mediaMetaScore(candidate.mediaMeta||{}) >= mediaMetaScore(old.mediaMeta||{}) ? candidate.mediaMeta : old.mediaMeta;
    const namingAuto = old.namingAuto === false ? false : true;
    const mergedNaming = namingAuto ? suggestNaming({mediaMeta:mergedMeta,title:candidate.title||old.title}) : old.naming;
    items.unshift({ ...old, ...candidate, id: old.id, firstSeen: old.firstSeen, hits: (old.hits || 1) + 1, previewUrl: candidate.previewUrl || old.previewUrl || "", probe: old.probe || candidate.probe || null, mediaMeta: mergedMeta || {}, naming: mergedNaming, namingAuto, requestProfile, frameId, referer: requestProfile?.referer || candidate.referer || old.referer || "", origin: requestProfile?.origin || candidate.origin || old.origin || "" });
  } else items.unshift(candidate);
  await writeTab(tabId, items);
}

function parseAttrs(line) {
  const out = {}; const raw = line.includes(":") ? line.slice(line.indexOf(":") + 1) : line;
  const re = /([A-Z0-9-]+)=((?:"[^"]*")|[^,]*)/gi; let m;
  while ((m = re.exec(raw))) out[m[1].toUpperCase()] = m[2].replace(/^"|"$/g, "");
  return out;
}
function fmtMbps(bps) { return bps ? `${(bps / 1_000_000).toFixed(bps >= 10_000_000 ? 0 : 1)} Mbps` : ""; }
function parseHls(text, baseUrl = "") {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean); const variants = []; const audioTracks=[];
  const absolute=(raw)=>{try{return new URL(String(raw||'').trim(),baseUrl).href}catch{return ''}};
  for (const line of lines) if (line.startsWith("#EXT-X-MEDIA:")) {
    const a=parseAttrs(line); if(String(a.TYPE||'').toUpperCase()!=='AUDIO'||!a['GROUP-ID']) continue;
    audioTracks.push({
      key:[a['GROUP-ID']||'',a.LANGUAGE||'',a.NAME||'Audio'].join('|'), groupId:a['GROUP-ID']||'', language:a.LANGUAGE||'', name:a.NAME||'Audio', channels:a.CHANNELS||'', isDefault:String(a.DEFAULT||'').toUpperCase()==='YES', isAutoSelect:String(a.AUTOSELECT||'').toUpperCase()==='YES', uri:absolute(a.URI)
    });
  }
  for (let i = 0; i < lines.length; i++) if (lines[i].startsWith("#EXT-X-STREAM-INF:")) {
    const a = parseAttrs(lines[i]); const res = (a.RESOLUTION || "").match(/(\d+)x(\d+)/i); const bandwidth = Number(a["AVERAGE-BANDWIDTH"] || a.BANDWIDTH || 0);
    let uri=''; for(let j=i+1;j<lines.length;j++){if(!lines[j]||lines[j].startsWith('#'))continue;uri=absolute(lines[j]);break;}
    if(!uri)continue;
    variants.push({ key:uri, uri, width: Number(res?.[1] || 0), height: Number(res?.[2] || 0), bandwidth, codecs: a.CODECS || "", frameRate:Number(a['FRAME-RATE']||0), audioGroup:a.AUDIO||"" });
  }
  const encrypted = lines.some(l => l.startsWith("#EXT-X-KEY:") && !/METHOD=NONE/i.test(l));
  variants.sort((a,b) => (b.height - a.height) || (b.bandwidth - a.bandwidth)); const best = variants[0] || {};
  const relevantAudio=best.audioGroup?audioTracks.filter(x=>x.groupId===best.audioGroup):audioTracks;
  return { variants: variants.length, variantOptions:variants, width: best.width || 0, height: best.height || 0, bandwidth: best.bandwidth || 0, codecs: best.codecs || "", encrypted, audioTracks:relevantAudio, allAudioTracks:audioTracks, playlistType: hlsPlaylistType(text) };
}
function parseDash(text) {
  const reps = []; const re = /<Representation\b([^>]*)>/gi; let m;
  while ((m = re.exec(text))) {
    const s = m[1]; const val = name => (s.match(new RegExp(`${name}=["']([^"']+)["']`, "i")) || [])[1] || "";
    reps.push({ width: Number(val("width") || 0), height: Number(val("height") || 0), bandwidth: Number(val("bandwidth") || 0), codecs: val("codecs") });
  }
  reps.sort((a,b) => (b.height - a.height) || (b.bandwidth - a.bandwidth)); const best = reps[0] || {};
  const drm = /ContentProtection/i.test(text) && /(widevine|playready|fairplay|cenc:default_KID)/i.test(text);
  return { variants: reps.length, width: best.width || 0, height: best.height || 0, bandwidth: best.bandwidth || 0, codecs: best.codecs || "", encrypted: drm };
}
async function probeManifestText(url, c, { mode = 'quick', label = 'Manifest' } = {}) {
  const attempts = mode === 'download' ? ROBUST_PROBE_ATTEMPTS : QUICK_PROBE_ATTEMPTS;
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeoutMs = probeTimeoutMs(attempt, mode);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response = null;
    try {
      response = await fetch(url, {
        credentials: 'include',
        cache: attempt === 1 ? 'default' : 'reload',
        signal: controller.signal,
        referrer: c.referer || undefined
      });
      if (!response.ok) { const err = new Error(`HTTP ${response.status}`); err.status = response.status; throw err; }
      // Keep the abort timer alive until the MANIFEST BODY has arrived. 1.6.2
      // cleared it after headers, so response.text() could hang indefinitely.
      const text = await response.text();
      clearTimeout(timer);
      return text;
    } catch (e) {
      clearTimeout(timer); last = e;
      const timedOut = controller.signal.aborted || e?.name === 'AbortError';
      const status = Number(e?.status || response?.status || 0);
      let permission = true;
      try { const u = new URL(url); permission = await chrome.permissions.contains({ origins: [`${u.protocol}//${u.host}/*`] }); } catch {}
      const info = failureInfo({ url, status, timedOut, permission, message: String(e?.message || e), online: true });
      const retryable = info.retryable && (timedOut || shouldRetryStatus(status) || (!status && e instanceof TypeError));
      if (!retryable || attempt >= attempts) {
        const err = new Error(formatDiagnostic(info, { label, attempt, attempts }));
        err.code = info.code; err.status = status; err.url = url; err.info = info; throw err;
      }
      await new Promise(r => setTimeout(r, backoffMs(attempt) + Math.floor(Math.random() * 120)));
    }
  }
  throw last || new Error(`${label}: Analyse fehlgeschlagen`);
}

async function runProbeCandidate(c, tabId = null, mode = 'quick') {
  if (c.probe) return c.probe;
  if (c.kind === 'media') return { contentLength: c.contentLength || 0, contentType: c.contentType || '', summary: c.contentLength ? humanBytes(c.contentLength) : 'Direktes Medium' };
  const probeJobId = `probe-${crypto.randomUUID()}`;
  const probeJob = { jobId: probeJobId, tabId, frameId: c.frameId, referer: c.referer || '', origin: c.origin || '', requestProfile: c.requestProfile || {}, pageUrl: c.pageUrl || '' };
  let bridge = null;
  try {
    bridge = await prepareRequestBridge(probeJob, c.url);
    const text = await probeManifestText(c.url, c, { mode, label: c.kind === 'hls' ? 'HLS-Manifest' : 'DASH-Manifest' });
    const probe = c.kind === 'hls' ? parseHls(text, c.url) : parseDash(text);
    const summary = buildProbeSummary(c.kind, probe);
    return { ...probe, requestContext: bridge ? { cookieCount: bridge.cookieCount || 0, flags: bridge.flags || [], active: Boolean(bridge.ok) } : null, summary };
  } finally { await cleanupRequestBridge(probeJobId); }
}

async function probeCandidate(c, tabId = null, { mode = 'quick' } = {}) {
  if (c.probe) return c.probe;
  const key = `${mode}|${Number.isInteger(tabId) ? tabId : -1}|${makeCandidateKey(c)}`;
  if (probeInflight.has(key)) return probeInflight.get(key);
  const task = runProbeCandidate(c, tabId, mode).finally(() => probeInflight.delete(key));
  probeInflight.set(key, task);
  return task;
}

function profileScore(p) { return [p?.referer,p?.origin,p?.accept,p?.acceptLanguage].filter(Boolean).length; }
function mergeHlsCandidate(master, child) {
  const requestProfile = profileScore(master.requestProfile) >= profileScore(child.requestProfile) ? master.requestProfile : child.requestProfile;
  return {
    ...child,
    ...master,
    id: master.id,
    url: master.url,
    kind: 'hls',
    host: master.host,
    probe: master.probe,
    firstSeen: Math.min(master.firstSeen || Date.now(), child.firstSeen || Date.now()),
    lastSeen: Math.max(master.lastSeen || 0, child.lastSeen || 0),
    hits: (master.hits || 1) + (child.hits || 1),
    previewUrl: master.previewUrl || child.previewUrl || '',
    mediaMeta: mediaMetaScore(master.mediaMeta||{}) >= mediaMetaScore(child.mediaMeta||{}) ? master.mediaMeta : child.mediaMeta,
    naming: master.namingAuto===false?master.naming:(child.namingAuto===false?child.naming:(master.naming||child.naming||null)),
    namingAuto: !(master.namingAuto===false||child.namingAuto===false),
    requestProfile,
    frameId: master.frameId >= 0 ? master.frameId : (child.frameId ?? -1),
    referer: requestProfile?.referer || master.referer || child.referer || '',
    origin: requestProfile?.origin || master.origin || child.origin || ''
  };
}
async function reconcileHlsDuplicates(tabId) {
  if (!Number.isInteger(tabId)) return;
  let items = await readTab(tabId);
  let changed = false;
  for (let m = 0; m < items.length; m++) {
    let master = items[m];
    if (master.kind !== 'hls' || !master.probe?.variantOptions?.length) continue;
    for (let i = items.length - 1; i >= 0; i--) {
      if (i === m) continue;
      const child = items[i];
      if (child.kind !== 'hls' || !hlsProbeContainsVariant(master.probe, child.url)) continue;
      master = mergeHlsCandidate(master, child);
      items[m] = master;
      items.splice(i, 1);
      if (i < m) m--;
      changed = true;
    }
  }
  if (changed) await writeTab(tabId, items);
}

chrome.webRequest.onBeforeSendHeaders.addListener(details => {
  if (details.tabId < 0) return;
  const requestProfile = profileFromObservedHeaders(details.requestHeaders, { referer: details.documentUrl || "", origin: details.initiator || "" });
  requestContext.set(details.requestId, { requestProfile, referer: requestProfile.referer, origin: requestProfile.origin, frameId: details.frameId });
  setTimeout(() => requestContext.delete(details.requestId), 45_000);
}, { urls: ["<all_urls>"] }, ["requestHeaders", "extraHeaders"]);

chrome.webRequest.onHeadersReceived.addListener(details => {
  if (details.tabId < 0) return;
  const contentType = getHeader(details.responseHeaders, "content-type");
  const kind = classifyCandidate({ url: details.url, contentType, resourceType: details.type }); if (!kind) return;
  const ctx = requestContext.get(details.requestId) || {}; const contentLength = Number(getHeader(details.responseHeaders, "content-length") || 0);
  chrome.tabs.get(details.tabId).then(tab => addCandidate(details.tabId, {
    url: details.url, kind, contentType, contentLength, resourceType: details.type,
    pageUrl: tab.url || "", frameUrl: details.documentUrl || details.initiator || "",
    referer: ctx.referer || details.documentUrl || tab.url || "", origin: ctx.origin || "", requestProfile: ctx.requestProfile || {}, frameId: Number.isInteger(ctx.frameId) ? ctx.frameId : details.frameId,
    title: tab.title || "", source: "network"
  })).catch(() => {});
}, { urls: ["<all_urls>"] }, ["responseHeaders", "extraHeaders"]);

function launchStreamForge(c, action = "analyze") {
  const params = new URLSearchParams({ url: c.url, kind: c.kind || "" });
  if (c.referer) params.set("referer", c.referer); if (c.origin) params.set("origin", c.origin); if (c.title) params.set("title", c.title);
  return chrome.tabs.create({ url: `streamforge://${action}?${params.toString()}`, active: true });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "sf_candidate" && sender.tab?.id >= 0) { addCandidate(sender.tab.id, { ...message.candidate, pageUrl: sender.tab.url || message.candidate?.pageUrl || "", frameUrl: message.candidate?.frameUrl || sender.url || "", source: "dom" }).then(() => sendResponse({ ok: true })); return true; }
  if (message?.type === "sf_preview" && sender.tab?.id >= 0) { rememberPreview(sender.tab.id, { ...message.preview, frameUrl: message.preview?.frameUrl || sender.url || "" }).then(() => sendResponse({ ok: true })); return true; }
  if (message?.type === "sf_page_meta" && sender.tab?.id >= 0) { rememberPageMeta(sender.tab.id, { ...message.meta, frameUrl: message.meta?.frameUrl || sender.url || "", isTop: sender.frameId === 0 || Boolean(message.meta?.isTop) }).then(() => sendResponse({ ok: true })); return true; }
  if (message?.type === "sf_set_naming" && Number.isInteger(message.tabId) && message.id) { (async()=>{ const items=await readTab(message.tabId); const hit=items.find(x=>x.id===message.id); if(!hit){sendResponse({ok:false,error:"Treffer nicht gefunden"});return;} hit.naming=message.naming||null; hit.namingAuto=false; await writeTab(message.tabId,items,{updateBadge:false}); sendResponse({ok:true}); })().catch(e=>sendResponse({ok:false,error:String(e?.message||e)})); return true; }
  if (message?.type === "sf_get" && Number.isInteger(message.tabId)) { readTab(message.tabId).then(items => sendResponse({ ok: true, items })); return true; }
  if (message?.type === "sf_clear" && Number.isInteger(message.tabId)) { (async()=>{const items=await readTab(message.tabId);for(const item of items){const jobId=item.download?.exportJobId;if(jobId)await discardRetainedExport(jobId).catch(()=>{});}await writeTab(message.tabId, []);sendResponse({ok:true});})().catch(e=>sendResponse({ok:false,error:String(e?.message||e)})); return true; }
  if (message?.type === "sf_remove" && Number.isInteger(message.tabId) && message.id) { (async()=>{const items=await readTab(message.tabId);const hit=items.find(x=>x.id===message.id);const jobId=hit?.download?.exportJobId;if(jobId)await discardRetainedExport(jobId).catch(()=>{});await writeTab(message.tabId, items.filter(x => x.id !== message.id));sendResponse({ok:true});})().catch(e=>sendResponse({ok:false,error:String(e?.message||e)})); return true; }
  if (message?.type === "sf_open" && message.candidate?.url) { launchStreamForge(message.candidate, "analyze").then(() => sendResponse({ ok: true })).catch(err => sendResponse({ ok: false, error: String(err) })); return true; }
  if (message?.type === "sf_prepare_request_context" && message.target === "background" && message.job?.jobId && message.url) { prepareRequestBridge(message.job, message.url).then(x => sendResponse({ ok: true, context: x })).catch(e => sendResponse({ ok: false, error: String(e?.message || e) })); return true; }
  if (message?.type === "sf_cleanup_request_context" && message.target === "background" && message.jobId) { cleanupRequestBridge(message.jobId).then(() => sendResponse({ ok: true })); return true; }
  if (message?.type === "sf_probe" && message.candidate?.url) {
    probeCandidate(message.candidate, message.tabId, { mode: message.mode === 'download' ? 'download' : 'quick' }).then(async probe => {
      if (Number.isInteger(message.tabId) && message.candidate?.id) {
        const current = await readTab(message.tabId);
        const hit = current.find(x => x.id === message.candidate.id);
        if (hit) { hit.probe = probe; hit.probeError = ""; hit.probeDiagnostic = null; hit.probeRetryAfter = 0; await writeTab(message.tabId, current); await reconcileHlsDuplicates(message.tabId); }
      }
      sendResponse({ ok: true, probe });
    }).catch(async err => {
      const detail = { code: err?.code || 'PROBE_FAILED', title: 'Manifest-Analyse fehlgeschlagen', text: String(err?.message || err), suggestion: 'Download kann trotzdem mit der robusteren Retry-Logik versucht werden.' };
      if (Number.isInteger(message.tabId) && message.candidate?.id) {
        const current = await readTab(message.tabId);
        const hit = current.find(x => x.id === message.candidate.id);
        if (hit) { hit.probeError = detail.text; hit.probeDiagnostic = detail; hit.probeRetryAfter = Date.now() + PROBE_RETRY_COOLDOWN_MS; await writeTab(message.tabId, current, { updateBadge: false }); }
      }
      sendResponse({ ok: false, error: detail.text, diagnostic: detail });
    }); return true;
  }
  if (message?.type === "sf_download_progress" && message.target === "background") {
    if (message.state === "error" && message.jobId) cleanupRequestBridge(message.jobId).catch(()=>{});
    const patch = { state: message.state, progress: Number(message.progress || 0), message: message.message || "" };
    const numeric = ["bytes","downloadedBytes","outputBytes","speedBps","etaSeconds","downloadProgress","muxProgress","segmentDone","segmentTotal","muxSegmentDone","muxSegmentTotal","concurrency","retries","prefetchRequests","activeRequests","queuedRequests","bufferPairs","bufferCapacity","bufferedBytes","bufferMaxBytes"];
    for (const key of numeric) if (message[key] !== undefined) patch[key] = Number(message[key] || 0);
    if (message.retry !== undefined && message.retries === undefined) patch.retries = Number(message.retry || 0);
    for (const key of ["phase","bottleneck","host"]) if (message[key] !== undefined) patch[key] = message[key] || "";
    if (message.prefetch !== undefined) patch.prefetch = Boolean(message.prefetch);
    if (message.etaPending !== undefined) patch.etaPending = Boolean(message.etaPending);
    if (message.requestContext !== undefined) patch.requestContext = message.requestContext || null;
    if (message.diagnostic) patch.diagnostic = message.diagnostic;
    const immediate = message.state === "error" || message.state === "ready" || Boolean(message.diagnostic);
    if (immediate) {
      flushQueuedDownloadStatus(message.tabId, message.candidateId)
        .then(() => setDownloadStatus(message.tabId, message.candidateId, patch))
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
    } else {
      queueDownloadStatus(message.tabId, message.candidateId, patch);
      // Resolve immediately: the hot download/mux path never waits on
      // chrome.storage.session or badge rendering. The latest snapshot is
      // persisted at most about once per second.
      sendResponse({ ok: true, queued: true });
    }
    return true;
  }
  if (message?.type === "sf_blob_ready" && message.target === "background") {
    (async()=>{
      const { jobId, tabId, candidateId, blobUrl, filename, mime, tempName, tempNames, bytes } = message;
      const finalMime = canonicalMediaMime(mime);
      const finalFilename = ensureMediaExtension(filename, finalMime);
      await cleanupRequestBridge(jobId).catch(()=>{});
      // Flush the last queued transfer snapshot before entering the export
      // state. Otherwise a delayed 900 ms progress write could overwrite
      // `saving` with an old `downloading` state.
      await flushQueuedDownloadStatus(tabId, candidateId).catch(()=>{});
      const meta = { jobId, tabId, candidateId, tempName: tempName || (Array.isArray(tempNames) ? tempNames[tempNames.length - 1] : ''), tempNames, filename: finalFilename, mime: finalMime, bytes: Number(bytes || 0), createdAt: Date.now() };
      const {id}=await startFinalExport(meta, { blobUrl });
      sendResponse({ ok: true, downloadId: id });
    })().catch(err => sendResponse({ ok: false, error: String(err?.message || err), code: err?.code || '' }));
    return true;
  }
  if (message?.type === 'sf_retry_export' && message.jobId) {
    (async()=>{
      const meta = await readRetainedExport(message.jobId);
      if (!meta) { sendResponse({ ok: false, error: 'Die fertig gemuxte temporäre Datei ist nicht mehr als wiederholbarer Export registriert.' }); return; }
      const { id } = await startFinalExport(meta, { retry: true });
      sendResponse({ ok: true, downloadId: id });
    })().catch(err => sendResponse({ ok: false, error: String(err?.message || err), code: err?.code || '' }));
    return true;
  }
  if (message?.type === 'sf_queue_cancel' && Number.isInteger(message.tabId) && message.candidateId) {
    (async()=>{
      await ensureOffscreen();
      const response=await chrome.runtime.sendMessage({type:'sf_queue_cancel',target:'offscreen',tabId:message.tabId,candidateId:message.candidateId});
      if(!response?.ok){sendResponse({ok:false,error:'Auftrag wird bereits ausgeführt oder ist nicht mehr in der Warteschlange.'});return;}
      await flushQueuedDownloadStatus(message.tabId,message.candidateId);
      await setDownloadStatus(message.tabId,message.candidateId,{state:'cancelled',phase:'queued',progress:0,message:'Wartender Download abgebrochen'});
      sendResponse({ok:true});
    })().catch(error=>sendResponse({ok:false,error:String(error?.message||error)}));
    return true;
  }
  if (message?.type === "sf_download" && message.candidate?.url) {
    const c = message.candidate;
    if (c.kind === "media") {
      (async()=>{
        const namingCheck=validateNaming(c.naming||{}); if(!namingCheck.ok) throw new Error(namingCheck.error); const outputBaseName=buildMediaBasename(namingCheck.value,c.title||"StreamForge-Download");
        const ext = extensionFromUrl(c.url) || extensionFromMime(c.contentType); const filename = `${safeFilename(outputBaseName)}${ext || ""}`;
        const jobId = crypto.randomUUID();
        const job = { jobId, tabId: message.tabId, frameId: Number.isInteger(c.frameId) ? c.frameId : -1, pageUrl: c.pageUrl || "", referer: c.referer || "", origin: c.origin || "", requestProfile: c.requestProfile || {} };
        const bridge = await prepareRequestBridge(job, c.url);
        const id = await chrome.downloads.download({ url: c.url, filename, saveAs: true });
        downloadJobs.set(id, { jobId, tabId: message.tabId, candidateId: c.id, offscreen: false });
        await chrome.storage.session.set({ [`sf_dl_${id}`]: { jobId, tabId: message.tabId, candidateId: c.id, offscreen: false } });
        if (bridge?.flags?.length) await setDownloadStatus(message.tabId, c.id, { state: "saving", progress: 100, message: `Browser-Kontext aktiv: ${bridge.flags.join(" · ")}` });
        sendResponse({ ok: true, mode: "browser", downloadId: id });
      })().catch(async err => { sendResponse({ ok: false, error: String(err?.message || err) }); });
    } else if (c.kind === "hls") {
      (async()=>{
        let probe=null, probeWarning="";
        try{probe=await probeCandidate(c,message.tabId,{mode:'download'});}catch(err){probeWarning=String(err?.message||err);}
        if (probe?.encrypted) throw new Error("Verschlüsselter/geschützter HLS-Stream wird nicht verarbeitet.");
        const namingCheck=validateNaming(c.naming||{}); if(!namingCheck.ok) throw new Error(namingCheck.error); const outputBaseName=buildMediaBasename(namingCheck.value,c.title||"StreamForge-Download");
        await ensureOffscreen();
        const jobId = crypto.randomUUID();
        await setDownloadStatus(message.tabId, c.id, { reset: true, state: "preparing", phase: "preparing", progress: 0, downloadProgress: 0, muxProgress: 0, speedBps: 0, etaSeconds: 0, etaPending: true, segmentDone: 0, segmentTotal: 0, muxSegmentDone: 0, muxSegmentTotal: 0, retries: 0, concurrency: 0, activeRequests: 0, queuedRequests: 0, bufferPairs: 0, bufferCapacity: 0, bottleneck: "", downloadedBytes: 0, outputBytes: 0, message: probeWarning ? `Analysewarnung: ${probeWarning} – Download versucht es erneut …` : "HLS wird vorbereitet …" });
        chrome.runtime.sendMessage({
          type: "sf_hls_start", target: "offscreen",
          job: (()=>{ const selected=(probe?.variantOptions||[]).find(v=>v.uri===String(c.selectedVariant||''))||null; return { jobId, tabId: message.tabId, candidateId: c.id, url: c.url, referer: c.referer || "", origin: c.origin || "", requestProfile: c.requestProfile || {}, frameId: Number.isInteger(c.frameId) ? c.frameId : -1, pageUrl: c.pageUrl || "", title: c.title || "StreamForge-Download", outputBaseName, naming:namingCheck.value, height: Number(selected?.height || probe?.height || 0), selectedHeight: Number(selected?.height || 0), selectedBandwidth: Number(selected?.bandwidth || 0), selectedVariant: String(c.selectedVariant || ""), selectedAudio: String(c.selectedAudio || "") }; })()
        }).catch(async err => setDownloadStatus(message.tabId, c.id, { state: "error", progress: 0, message: String(err?.message||err) }));
        sendResponse({ ok: true, mode: "browser-hls", jobId });
      })().catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    } else if (c.kind === "dash") {
      (async()=>{
        let probe=null, probeWarning="";
        try{probe=await probeCandidate(c,message.tabId,{mode:'download'});}catch(err){probeWarning=String(err?.message||err);}
        if (probe?.encrypted) throw new Error("Verschlüsseltes/DRM-geschütztes DASH wird nicht verarbeitet.");
        const namingCheck=validateNaming(c.naming||{}); if(!namingCheck.ok) throw new Error(namingCheck.error); const outputBaseName=buildMediaBasename(namingCheck.value,c.title||"StreamForge-Download");
        await ensureOffscreen();
        const jobId = crypto.randomUUID();
        await setDownloadStatus(message.tabId, c.id, { reset: true, state: "preparing", phase: "preparing", progress: 0, downloadProgress: 0, muxProgress: 0, speedBps: 0, etaSeconds: 0, etaPending: true, segmentDone: 0, segmentTotal: 0, muxSegmentDone: 0, muxSegmentTotal: 0, retries: 0, concurrency: 0, activeRequests: 0, queuedRequests: 0, bufferPairs: 0, bufferCapacity: 0, bottleneck: "", downloadedBytes: 0, outputBytes: 0, message: probeWarning ? `Analysewarnung: ${probeWarning} – Download versucht es erneut …` : "DASH wird vorbereitet …" });
        chrome.runtime.sendMessage({
          type: "sf_dash_start", target: "offscreen",
          job: { jobId, tabId: message.tabId, candidateId: c.id, url: c.url, referer: c.referer || "", origin: c.origin || "", requestProfile: c.requestProfile || {}, frameId: Number.isInteger(c.frameId) ? c.frameId : -1, pageUrl: c.pageUrl || "", title: c.title || "StreamForge-Download", outputBaseName, naming:namingCheck.value, height: Number(probe?.height || 0), selectedAudio: String(c.selectedAudio || "") }
        }).catch(async err => setDownloadStatus(message.tabId, c.id, { state: "error", progress: 0, message: String(err?.message||err) }));
        sendResponse({ ok: true, mode: "browser-dash", jobId });
      })().catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    } else {
      sendResponse({ ok: false, error: "Dieser Medientyp wird vom Browser-Downloader nicht unterstützt." });
    }
    return true;
  }
});

chrome.downloads.onChanged.addListener(async delta => {
  if (!delta?.id || (!delta.state && !delta.error)) return;
  let job = downloadJobs.get(delta.id);
  if (!job) {
    const key = `sf_dl_${delta.id}`;
    const data = await chrome.storage.session.get(key);
    job = data[key];
  }
  if (!job) return;
  if (delta.state?.current === "complete") {
    const retained = job.offscreen !== false ? await readRetainedExport(job.jobId) : null;
    await setDownloadStatus(job.tabId, job.candidateId, { state: "complete", phase: 'complete', progress: 100, downloadProgress: 100, muxProgress: 100, exportRetryAvailable: false, exportErrorCode: '', message: retained?.bytes ? `Download abgeschlossen · ${humanBytes(retained.bytes)}` : "Download abgeschlossen" });
    await cleanupRequestBridge(job.jobId);
    if (job.offscreen !== false) {
      try { await ensureOffscreen(); await chrome.runtime.sendMessage({ type: "sf_download_cleanup", target: "offscreen", jobId: job.jobId, tempNames: retained?.tempNames || job.tempNames || [] }); } catch {}
      await removeRetainedExport(job.jobId);
    }
    downloadJobs.delete(delta.id); await chrome.storage.session.remove(`sf_dl_${delta.id}`);
  } else if (delta.state?.current === "interrupted" || delta.error?.current) {
    await cleanupRequestBridge(job.jobId);
    if (job.offscreen !== false) {
      const retained = await readRetainedExport(job.jobId);
      if (retained) await exportFailureStatus(retained, delta.error?.current || "Download abgebrochen");
      else await setDownloadStatus(job.tabId, job.candidateId, { state: "error", phase: 'export', progress: 100, message: delta.error?.current || "Download abgebrochen", exportRetryAvailable: false });
    } else {
      const info = describeDownloadError(delta.error?.current || "Download abgebrochen");
      await setDownloadStatus(job.tabId, job.candidateId, { state: "error", progress: 0, message: `${info.title}: ${info.text}`, diagnostic: { code: info.code, title: info.title, text: info.text, suggestion: info.suggestion, when: Date.now() } });
    }
    downloadJobs.delete(delta.id); await chrome.storage.session.remove(`sf_dl_${delta.id}`);
  }
});

chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove([stateKey(tabId), previewKey(tabId), pageMetaKey(tabId)]));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => { if (changeInfo.status === "loading") updateBadge(tabId).catch(() => {}); });
