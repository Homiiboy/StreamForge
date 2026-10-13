(() => {
  const sent = new Set();
  let lastPreview = "";
  let lastMetaSignature = "";

  function absolute(raw) {
    if (!raw) return "";
    try { const u = new URL(raw, location.href); return /^https?:$/i.test(u.protocol) ? u.href : ""; } catch { return ""; }
  }

  function textContent(selector) {
    const el = document.querySelector(selector);
    return String(el?.content || el?.getAttribute?.('content') || el?.textContent || '').trim();
  }

  function firstMeta(selectors) {
    for (const selector of selectors) {
      const value = textContent(selector);
      if (value) return value;
    }
    return '';
  }

  function typeList(node) {
    const raw = node?.['@type'];
    return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map(x => String(x).toLowerCase());
  }

  function walkJsonLd(value, out=[]) {
    if (!value) return out;
    if (Array.isArray(value)) { for (const x of value) walkJsonLd(x, out); return out; }
    if (typeof value !== 'object') return out;
    out.push(value);
    if (Array.isArray(value['@graph'])) walkJsonLd(value['@graph'], out);
    return out;
  }

  function readJsonLd() {
    const nodes=[];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { walkJsonLd(JSON.parse(script.textContent || 'null'), nodes); } catch {}
    }
    let movie=null, episode=null, series=null;
    for (const node of nodes) {
      const types=typeList(node);
      if (!movie && types.some(t => t === 'movie')) movie=node;
      if (!episode && types.some(t => t === 'tvepisode' || t === 'episode')) episode=node;
      if (!series && types.some(t => t === 'tvseries' || t === 'series')) series=node;
    }
    return {movie, episode, series};
  }

  function objName(value) {
    if (!value) return '';
    if (Array.isArray(value)) return objName(value[0]);
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') return String(value.name || value.headline || '').trim();
    return '';
  }

  function objNumber(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') value = value.value ?? value.name ?? '';
    const n = Number.parseInt(String(value).match(/\d{1,3}/)?.[0] || '',10);
    return Number.isFinite(n) ? String(n) : '';
  }

  function yearFrom(raw) {
    return String(raw || '').match(/\b(18\d{2}|19\d{2}|20\d{2}|21\d{2})\b/)?.[1] || '';
  }

  function inferFromTitle(raw) {
    const source=String(raw||'').replace(/\s+/g,' ').trim().replace(/\s+[|·]\s+[^|·]{2,50}$/u,'').trim();
    let m=source.match(/^(.*?)(?:[ ._\-–—]+)S(\d{1,3})E(\d{1,3})\b/i);
    if (m) return {type:'series',seriesTitle:m[1].replace(/[._]+/g,' ').trim(),season:String(Number(m[2])),episode:String(Number(m[3]))};
    m=source.match(/^(.*?)(?:[ ._\-–—]+)(\d{1,2})x(\d{1,3})\b/i);
    if (m) return {type:'series',seriesTitle:m[1].replace(/[._]+/g,' ').trim(),season:String(Number(m[2])),episode:String(Number(m[3]))};
    m=source.match(/^(.*?)\bStaffel\s*(\d{1,3})\b.*?\b(?:Folge|Episode)\s*(\d{1,3})\b/i);
    if (m) return {type:'series',seriesTitle:m[1].trim(),season:String(Number(m[2])),episode:String(Number(m[3]))};
    const year=yearFrom(source);
    return {type:'movie',title:source.replace(/\s*\((18\d{2}|19\d{2}|20\d{2}|21\d{2})\).*$/,'').trim(),year};
  }

  function pageMediaMeta() {
    const {movie,episode,series}=readJsonLd();
    const ogTitle=firstMeta(['meta[property="og:title"]','meta[name="twitter:title"]']);
    const fallbackTitle=ogTitle || document.title || '';
    const inferred=inferFromTitle(fallbackTitle);

    if (episode) {
      const seasonNode=episode.partOfSeason || {};
      const parentSeries=episode.partOfSeries || seasonNode.partOfSeries || series || {};
      return {
        type:'series',
        seriesTitle:objName(parentSeries) || objName(series) || inferred.seriesTitle || fallbackTitle,
        title:objName(parentSeries) || objName(series) || inferred.seriesTitle || fallbackTitle,
        episodeTitle:objName(episode),
        season:objNumber(episode.seasonNumber ?? seasonNode.seasonNumber) || inferred.season || '',
        episode:objNumber(episode.episodeNumber) || inferred.episode || '',
        pageTitle:fallbackTitle,
        source:'jsonld'
      };
    }
    if (movie) {
      const date=movie.datePublished || movie.releaseDate || firstMeta(['meta[property="video:release_date"]','meta[property="og:video:release_date"]','meta[itemprop="datePublished"]']);
      return {type:'movie',title:objName(movie) || fallbackTitle,year:yearFrom(date) || inferred.year || '',datePublished:String(date||''),pageTitle:fallbackTitle,source:'jsonld'};
    }
    if (series && (inferred.season || inferred.episode)) {
      return {type:'series',seriesTitle:objName(series) || inferred.seriesTitle || fallbackTitle,title:objName(series) || inferred.seriesTitle || fallbackTitle,season:inferred.season||'',episode:inferred.episode||'',pageTitle:fallbackTitle,source:'jsonld+title'};
    }

    const metaYear=yearFrom(firstMeta(['meta[property="video:release_date"]','meta[property="og:video:release_date"]','meta[itemprop="datePublished"]']));
    if (inferred.type==='series') return {...inferred,title:inferred.seriesTitle,pageTitle:fallbackTitle,source:'title'};
    return {type:'movie',title:inferred.title || fallbackTitle,year:metaYear || inferred.year || '',pageTitle:fallbackTitle,source:ogTitle?'meta':'title'};
  }

  function sendPageMeta(force=false) {
    const mediaMeta=pageMediaMeta();
    const signature=JSON.stringify(mediaMeta);
    if (!force && signature===lastMetaSignature) return;
    lastMetaSignature=signature;
    chrome.runtime.sendMessage({
      type:'sf_page_meta',
      meta:{frameUrl:location.href,isTop:top===self,mediaMeta}
    }).catch(()=>{});
  }

  function bestPreview() {
    const videos = [...document.querySelectorAll("video")];
    for (const video of videos) {
      const poster = absolute(video.poster || video.getAttribute("poster"));
      if (poster) return poster;
    }
    const selectors = [
      'meta[property="og:image"]', 'meta[property="og:image:secure_url"]',
      'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]',
      'link[rel="image_src"]'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const value = absolute(el?.content || el?.href);
      if (value) return value;
    }
    return "";
  }

  function sendPreview() {
    const previewUrl = bestPreview();
    if (!previewUrl || previewUrl === lastPreview) return;
    lastPreview = previewUrl;
    chrome.runtime.sendMessage({
      type: "sf_preview",
      preview: { previewUrl, frameUrl: location.href, title: document.title || "", mediaMeta:pageMediaMeta() }
    }).catch(() => {});
  }

  function emit(raw, elementKind = "media") {
    if (typeof raw !== "string") return;
    const url = absolute(raw); if (!url || sent.has(url)) return;
    sent.add(url);
    chrome.runtime.sendMessage({
      type: "sf_candidate",
      candidate: {
        url, resourceType: elementKind,
        pageUrl: top === self ? location.href : "",
        frameUrl: location.href,
        title: document.title || "",
        mediaMeta:pageMediaMeta(),
        previewUrl: bestPreview()
      }
    }).catch(() => {});
  }

  function scan(root = document) {
    for (const el of root.querySelectorAll?.("video, audio") || []) {
      emit(el.currentSrc || el.src, "media");
      for (const src of el.querySelectorAll("source[src]")) emit(src.src, "media");
    }
    for (const src of root.querySelectorAll?.("source[src]") || []) emit(src.src, "media");
    sendPreview();
    sendPageMeta();
  }

  sendPageMeta(true);
  scan();
  setTimeout(()=>{sendPreview();sendPageMeta(true);},1200);
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        const el = mutation.target;
        if (el instanceof HTMLMediaElement || el instanceof HTMLSourceElement) emit(el.currentSrc || el.src, "media");
      }
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches("video, audio, source")) emit(node.currentSrc || node.src, "media");
        scan(node);
      }
    }
    sendPreview();
    sendPageMeta();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "poster", "content"] });
  document.addEventListener("play", e => {
    const el = e.target;
    if (el instanceof HTMLMediaElement) { emit(el.currentSrc || el.src, "media"); sendPreview(); sendPageMeta(); }
  }, true);
})();
