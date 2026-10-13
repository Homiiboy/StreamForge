const FRIENDLY = {
  FILE_FAILED: ['Datei konnte nicht gespeichert werden', 'Chrome konnte die Zieldatei nicht schreiben.', 'Wähle einen anderen Speicherort und versuche nur das Speichern erneut.'],
  FILE_ACCESS_DENIED: ['Kein Schreibzugriff', 'Chrome hat keinen Schreibzugriff auf den gewählten Ordner.', 'Wähle einen Ordner, in den Chrome schreiben darf.'],
  FILE_NO_SPACE: ['Nicht genügend Speicherplatz', 'Auf dem Ziellaufwerk ist nicht genug freier Speicherplatz.', 'Gib Speicherplatz frei oder wähle ein anderes Laufwerk und versuche das Speichern erneut.'],
  FILE_NAME_TOO_LONG: ['Dateiname zu lang', 'Der erzeugte Dateiname oder Zielpfad ist für das Dateisystem zu lang.', 'Wähle einen kürzeren Titel oder einen kürzeren Zielpfad.'],
  FILE_TOO_LARGE: ['Datei zu groß', 'Das Ziellaufwerk oder Dateisystem akzeptiert die Dateigröße nicht.', 'Wähle ein Laufwerk mit einem Dateisystem, das große Dateien unterstützt.'],
  FILE_VIRUS_INFECTED: ['Download von Chrome blockiert', 'Chrome hat die Datei aufgrund einer Sicherheitsprüfung blockiert.', 'Prüfe die Chrome-Downloadwarnung. StreamForge umgeht Sicherheitsprüfungen nicht.'],
  FILE_TRANSIENT_ERROR: ['Temporärer Dateifehler', 'Beim Schreiben trat ein vorübergehender Dateisystemfehler auf.', 'Versuche nur das Speichern erneut.'],
  FILE_BLOCKED: ['Download von Chrome blockiert', 'Chrome oder eine Richtlinie hat das Speichern blockiert.', 'Prüfe Chrome-Richtlinien bzw. die Downloadwarnung.'],
  FILE_SECURITY_CHECK_FAILED: ['Sicherheitsprüfung fehlgeschlagen', 'Chrome konnte seine Sicherheitsprüfung für die Zieldatei nicht abschließen.', 'Prüfe die Chrome-Downloadwarnung.'],
  FILE_TOO_SHORT: ['Datei unvollständig', 'Chrome hat beim Export weniger Daten erhalten als erwartet.', 'Versuche nur das Speichern erneut. Die fertig gemuxte Datei bleibt erhalten.'],
  NETWORK_FAILED: ['Export-Verbindung fehlgeschlagen', 'Der interne Blob-Download von Chrome ist fehlgeschlagen.', 'Versuche nur das Speichern erneut; der Film muss nicht neu geladen werden.'],
  NETWORK_TIMEOUT: ['Export-Timeout', 'Chrome hat beim finalen Speichern zu lange gewartet.', 'Versuche nur das Speichern erneut.'],
  NETWORK_DISCONNECTED: ['Export unterbrochen', 'Chromes finaler Dateiexport wurde unterbrochen.', 'Versuche nur das Speichern erneut.'],
  NETWORK_SERVER_DOWN: ['Interner Export nicht erreichbar', 'Chrome konnte die lokale Blob-Quelle vorübergehend nicht erreichen.', 'Versuche nur das Speichern erneut.'],
  NETWORK_INVALID_REQUEST: ['Ungültiger Export-Request', 'Chrome hat den finalen lokalen Download-Request abgelehnt.', 'Versuche das Speichern erneut. Falls es wieder passiert, öffne die Fehlerdetails.'],
  SERVER_FAILED: ['Exportquelle fehlgeschlagen', 'Chrome konnte die lokale Exportquelle nicht lesen.', 'Versuche nur das Speichern erneut.'],
  SERVER_NO_RANGE: ['Exportquelle unterstützt Anfrage nicht', 'Chrome konnte die lokale Datei nicht wie erwartet lesen.', 'Versuche nur das Speichern erneut.'],
  SERVER_BAD_CONTENT: ['Exportdaten abgelehnt', 'Chrome hat beim finalen Speichern unerwartete Daten gemeldet.', 'Versuche nur das Speichern erneut.'],
  SERVER_UNAUTHORIZED: ['Export nicht autorisiert', 'Chrome hat den lokalen Export-Request nicht autorisiert.', 'Versuche das Speichern erneut.'],
  SERVER_CERT_PROBLEM: ['Zertifikatsfehler beim Export', 'Chrome meldet beim finalen Download einen Zertifikatsfehler.', 'Öffne die Fehlerdetails; bei einem lokalen Blob-Export sollte das normalerweise nicht auftreten.'],
  SERVER_FORBIDDEN: ['Export verweigert', 'Chrome hat den finalen lokalen Export verweigert.', 'Versuche nur das Speichern erneut.'],
  SERVER_UNREACHABLE: ['Exportquelle nicht erreichbar', 'Chrome konnte die lokale Blob-Quelle nicht erreichen.', 'Versuche nur das Speichern erneut.'],
  SERVER_CONTENT_LENGTH_MISMATCH: ['Exportgröße stimmt nicht', 'Chrome hat beim Speichern eine andere Dateigröße als erwartet erhalten.', 'Versuche nur das Speichern erneut. Die OPFS-Datei bleibt erhalten.'],
  USER_CANCELED: ['Speichern abgebrochen', 'Der Speichervorgang wurde abgebrochen.', 'Klicke auf „Speichern erneut versuchen“, wenn du die fertige Datei noch speichern möchtest.'],
  USER_SHUTDOWN: ['Browser wurde beendet', 'Chrome wurde während des Speicherns beendet.', 'Nach erneutem Öffnen kann ein neuer Export nötig sein.'],
  CRASH: ['Chrome-Downloadprozess abgestürzt', 'Der Chrome-Downloadprozess wurde während des finalen Speicherns beendet.', 'Versuche nur das Speichern erneut.'],
  EXPORT_EMPTY: ['Fertige Datei ist leer', 'StreamForge hat eine leere temporäre Datei erzeugt und den Export deshalb gestoppt.', 'Starte den Mediendownload erneut und öffne die Fehlerdetails, falls es wieder passiert.'],
  EXPORT_PLAYLIST_CONTENT: ['Playlist statt Videodatei erkannt', 'Die fertige temporäre Datei enthält eine M3U8-Playlist statt Mediendaten. StreamForge speichert sie nicht als Film.', 'Starte den Download erneut. Falls es wieder passiert, sende die Fehlerdetails; der Playlist-als-Segment-Pfad muss dann angepasst werden.'],
  EXPORT_HTML_CONTENT: ['Fehlerseite statt Videodatei erkannt', 'Die fertige temporäre Datei beginnt mit HTML statt Video-/Audiodaten.', 'Der Hoster hat vermutlich eine Fehler- oder Zwischenseite geliefert. Starte den Download erneut.'],
  EXPORT_INVALID_TS: ['Ungültige TS-Ausgabe erkannt', 'Die fertige Datei enthält keine plausible MPEG-TS-Paketstruktur.', 'Starte den Download erneut. StreamForge verhindert bewusst, dass eine falsche Datei als .ts gespeichert wird.'],
  EXPORT_INVALID_MP4: ['Ungültige MP4-Ausgabe erkannt', 'Die fertige Datei enthält keine plausible ISO-BMFF/MP4-Struktur.', 'Starte den Download erneut. StreamForge verhindert bewusst, dass eine falsche Datei als .mp4 gespeichert wird.'],
  EXPORT_TYPE_MISMATCH: ['Dateityp stimmt nicht', 'Der erkannte Inhalt der fertigen Datei passt nicht zum vorgesehenen Container.', 'Starte den Download erneut und öffne die Fehlerdetails, falls der Fehler reproduzierbar ist.']
};

const NON_RETRYABLE = new Set([
  'FILE_VIRUS_INFECTED', 'FILE_BLOCKED', 'FILE_SECURITY_CHECK_FAILED',
  'EXPORT_EMPTY', 'EXPORT_PLAYLIST_CONTENT', 'EXPORT_HTML_CONTENT',
  'EXPORT_INVALID_TS', 'EXPORT_INVALID_MP4', 'EXPORT_TYPE_MISMATCH'
]);

const MIME_TO_EXT = new Map([
  ['video/mp4', '.mp4'],
  ['video/mp2t', '.ts'],
  ['video/mp2t; charset=binary', '.ts'],
  ['video/webm', '.webm']
]);
const REPLACEABLE_FINAL_EXT = /\.(?:txt|text|html?|m3u8?|m3u|json|xml|bin|dat|download|tmp|part|mp4|m4v|mov|webm|ts|mts|m2ts)$/i;

export function canonicalMediaMime(mime = '') {
  const m = String(mime || '').toLowerCase().split(';', 1)[0].trim();
  if (m === 'video/mp2t' || m === 'video/mpegts' || m === 'video/ts') return 'video/mp2t';
  if (m === 'video/mp4' || m === 'application/mp4') return 'video/mp4';
  if (m === 'video/webm') return 'video/webm';
  return m || 'application/octet-stream';
}

export function extensionForMediaMime(mime = '') {
  return MIME_TO_EXT.get(canonicalMediaMime(mime)) || '';
}

export function normalizeMediaFilename(filename, mime = '') {
  let name = String(filename || 'StreamForge-Download').trim() || 'StreamForge-Download';
  const wanted = extensionForMediaMime(mime);
  if (!wanted) return name;
  if (name.toLowerCase().endsWith(wanted)) return name;
  if (REPLACEABLE_FINAL_EXT.test(name)) return name.replace(REPLACEABLE_FINAL_EXT, wanted);
  return `${name}${wanted}`;
}

export function createTypedMediaBlob(blobLike, mime = '') {
  const type = canonicalMediaMime(mime);
  return new Blob([blobLike], { type });
}

function asciiHead(bytes, max = 4096) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const slice = view.subarray(0, Math.min(view.length, max));
  try { return new TextDecoder('utf-8', { fatal: false }).decode(slice).replace(/^\uFEFF/, ''); }
  catch { return ''; }
}

function looksLikeTs(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (view.length < 188 * 3) return false;
  const maxOffset = Math.min(187, view.length - 188 * 3);
  for (let off = 0; off <= maxOffset; off++) {
    if (view[off] === 0x47 && view[off + 188] === 0x47 && view[off + 376] === 0x47) return true;
  }
  return false;
}

function looksLikeMp4(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (view.length < 8) return false;
  const allowed = new Set(['ftyp', 'styp', 'sidx', 'moov', 'moof', 'free', 'skip', 'wide']);
  // ISO-BMFF files start with a box header. Accept the common init/fragment
  // box types StreamForge can legitimately emit.
  const type = String.fromCharCode(view[4], view[5], view[6], view[7]);
  if (!allowed.has(type)) return false;
  const size = ((view[0] << 24) >>> 0) + (view[1] << 16) + (view[2] << 8) + view[3];
  return size === 0 || size === 1 || size >= 8;
}

export function inspectMediaHead(bytes, expectedMime = '') {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (!view.length) return { ok: false, code: 'EXPORT_EMPTY', detectedMime: '', kind: 'empty' };

  const text = asciiHead(view).replace(/^\s+/, '');
  if (/^#EXTM3U(?:\s|$)/i.test(text)) return { ok: false, code: 'EXPORT_PLAYLIST_CONTENT', detectedMime: 'application/vnd.apple.mpegurl', kind: 'playlist' };
  if (/^(?:<!doctype\s+html\b|<html\b|<head\b|<body\b)/i.test(text)) return { ok: false, code: 'EXPORT_HTML_CONTENT', detectedMime: 'text/html', kind: 'html' };

  const ts = looksLikeTs(view);
  const mp4 = looksLikeMp4(view);
  const expected = canonicalMediaMime(expectedMime);
  const detectedMime = ts ? 'video/mp2t' : mp4 ? 'video/mp4' : '';

  if (expected === 'video/mp2t' && !ts) {
    if (mp4) return { ok: false, code: 'EXPORT_TYPE_MISMATCH', detectedMime, kind: 'mp4' };
    return { ok: false, code: 'EXPORT_INVALID_TS', detectedMime: '', kind: 'unknown' };
  }
  if (expected === 'video/mp4' && !mp4) {
    if (ts) return { ok: false, code: 'EXPORT_TYPE_MISMATCH', detectedMime, kind: 'ts' };
    return { ok: false, code: 'EXPORT_INVALID_MP4', detectedMime: '', kind: 'unknown' };
  }
  return { ok: true, code: '', detectedMime: detectedMime || expected, kind: ts ? 'ts' : mp4 ? 'mp4' : 'unknown' };
}

export function normalizeDownloadError(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'UNKNOWN';
  const upper = raw.toUpperCase();
  for (const code of Object.keys(FRIENDLY)) if (upper.includes(code)) return code;
  if (/USER.?CANCEL/.test(upper)) return 'USER_CANCELED';
  if (/NO.?SPACE|DISK.?FULL/.test(upper)) return 'FILE_NO_SPACE';
  if (/ACCESS.?DENIED|PERMISSION/.test(upper)) return 'FILE_ACCESS_DENIED';
  return upper.replace(/^ERROR:\s*/, '').slice(0, 120) || 'UNKNOWN';
}

export function describeDownloadError(value) {
  const code = normalizeDownloadError(value);
  const known = FRIENDLY[code];
  if (known) {
    const [title, text, suggestion] = known;
    return { code, title, text, suggestion, retryable: !NON_RETRYABLE.has(code) };
  }
  const raw = String(value ?? '').trim();
  return {
    code: code === 'UNKNOWN' ? 'EXPORT_FAILED' : code,
    title: 'Speichern fehlgeschlagen',
    text: raw || 'Chrome konnte die fertig vorbereitete Datei nicht in den Download-Ordner exportieren.',
    suggestion: 'Versuche nur das Speichern erneut. Die fertig gemuxte Datei bleibt erhalten.',
    retryable: true
  };
}

export function exportStorageKey(jobId) {
  return `sf_export_${String(jobId || '')}`;
}

export function isRetainedExportRecord(record) {
  return Boolean(record && record.jobId && record.tempName && record.filename && Number(record.bytes) > 0);
}
