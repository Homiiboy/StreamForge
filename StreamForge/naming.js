function cleanSpaces(raw='') {
  return String(raw || '').replace(/[\u00a0\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sanitizeBaseName(raw, fallback='StreamForge-Download') {
  const text = cleanSpaces(String(raw || fallback).replace(/[<>:"/\\|?*\x00-\x1f]/g, ' '));
  return (text || fallback).replace(/[. ]+$/g, '').slice(0, 140) || fallback;
}

export function normalizeYear(value) {
  const m = String(value ?? '').match(/\b(18\d{2}|19\d{2}|20\d{2}|21\d{2})\b/);
  return m ? m[1] : '';
}

export function normalizeEpisodeIndex(value, {allowZero=true}={}) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < (allowZero ? 0 : 1) || n > 999) return '';
  return String(n);
}

function stripCommonPageSuffix(raw) {
  let text = cleanSpaces(raw);
  // Only remove clearly site/player-oriented suffixes, never generic movie-title hyphens.
  text = text.replace(/\s+[|·]\s+[^|·]{2,50}$/u, '').trim();
  text = text.replace(/\s+-\s+(?:online\s+(?:stream|schauen)|stream(?:ing)?|watch\s+online|player)\b.*$/iu, '').trim();
  return text;
}

function inferFromTitle(raw='') {
  const source = stripCommonPageSuffix(raw);
  let m = source.match(/^(.*?)(?:[ ._\-–—]+)S(\d{1,3})E(\d{1,3})\b/i);
  if (m) return {type:'series', title:cleanSpaces(m[1].replace(/[._]+/g,' ')), season:String(Number(m[2])), episode:String(Number(m[3]))};
  m = source.match(/^(.*?)(?:[ ._\-–—]+)(\d{1,2})x(\d{1,3})\b/i);
  if (m) return {type:'series', title:cleanSpaces(m[1].replace(/[._]+/g,' ')), season:String(Number(m[2])), episode:String(Number(m[3]))};
  m = source.match(/^(.*?)\bStaffel\s*(\d{1,3})\b.*?\b(?:Folge|Episode)\s*(\d{1,3})\b/i);
  if (m) return {type:'series', title:cleanSpaces(m[1]), season:String(Number(m[2])), episode:String(Number(m[3]))};
  m = source.match(/^(.*?)\s*\((18\d{2}|19\d{2}|20\d{2}|21\d{2})\)/);
  if (m) return {type:'movie', title:cleanSpaces(m[1]), year:m[2]};
  m = source.match(/^(.*?)(?:[ ._\-–—]+)(18\d{2}|19\d{2}|20\d{2}|21\d{2})(?:\b|$)/);
  if (m && cleanSpaces(m[1]).length >= 2) return {type:'movie', title:cleanSpaces(m[1].replace(/[._]+/g,' ')), year:m[2]};
  return {type:'movie', title:source || 'StreamForge-Download', year:''};
}

export function suggestNaming({mediaMeta={}, title=''}={}) {
  const inferred = inferFromTitle(mediaMeta.pageTitle || mediaMeta.displayTitle || title || mediaMeta.title || '');
  const explicitType = mediaMeta.type === 'series' || mediaMeta.type === 'movie' ? mediaMeta.type : '';
  const type = explicitType || (mediaMeta.season !== undefined || mediaMeta.episode !== undefined ? 'series' : inferred.type);
  const metaTitle = cleanSpaces(mediaMeta.seriesTitle || mediaMeta.title || '');
  const chosenTitle = sanitizeBaseName(metaTitle || inferred.title || title || 'StreamForge-Download');
  if (type === 'series') {
    return {
      type:'series',
      title:chosenTitle,
      season:normalizeEpisodeIndex(mediaMeta.season ?? inferred.season ?? '', {allowZero:true}),
      episode:normalizeEpisodeIndex(mediaMeta.episode ?? inferred.episode ?? '', {allowZero:true}),
      year:''
    };
  }
  return {
    type:'movie',
    title:chosenTitle,
    year:normalizeYear(mediaMeta.year || mediaMeta.datePublished || inferred.year || ''),
    season:'', episode:''
  };
}

export function validateNaming(naming={}) {
  const type = naming.type === 'series' ? 'series' : 'movie';
  const title = sanitizeBaseName(naming.title || '', '');
  if (!title) return {ok:false, error:'Bitte einen Titel eingeben.'};
  if (type === 'series') {
    const season = normalizeEpisodeIndex(naming.season, {allowZero:true});
    const episode = normalizeEpisodeIndex(naming.episode, {allowZero:true});
    if (season === '') return {ok:false, error:'Bitte eine gültige Staffel eingeben.'};
    if (episode === '') return {ok:false, error:'Bitte eine gültige Episode eingeben.'};
    return {ok:true, value:{type, title, season, episode, year:''}};
  }
  const year = normalizeYear(naming.year);
  if (!year) return {ok:false, error:'Bitte ein vierstelliges Erscheinungsjahr eingeben.'};
  return {ok:true, value:{type, title, year, season:'', episode:''}};
}

export function buildMediaBasename(naming={}, fallback='StreamForge-Download') {
  const checked = validateNaming(naming);
  if (!checked.ok) return sanitizeBaseName(fallback);
  const n = checked.value;
  if (n.type === 'series') {
    const s = String(Number(n.season)).padStart(2,'0');
    const e = String(Number(n.episode)).padStart(2,'0');
    const suffix = ` S${s}E${e}`;
    const title = sanitizeBaseName(n.title.replace(/\s+S\d{1,3}E\d{1,3}\s*$/i,'').trim(), fallback).slice(0,Math.max(1,140-suffix.length)).trim();
    return sanitizeBaseName(`${title}${suffix}`, fallback);
  }
  const suffix = ` (${n.year})`;
  const title = sanitizeBaseName(n.title.replace(/\s*\((18\d{2}|19\d{2}|20\d{2}|21\d{2})\)\s*$/,'').trim(), fallback).slice(0,Math.max(1,140-suffix.length)).trim();
  return sanitizeBaseName(`${title}${suffix}`, fallback);
}
