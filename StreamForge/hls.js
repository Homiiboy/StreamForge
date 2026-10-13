export function parseAttributeList(raw = "") {
  const out = {};
  const body = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
  const re = /([A-Z0-9-]+)=((?:"[^"]*")|[^,]*)/gi;
  let m;
  while ((m = re.exec(body))) out[m[1].toUpperCase()] = String(m[2] || "").replace(/^"|"$/g, "");
  return out;
}

export function absoluteUrl(raw, base) {
  try { return new URL(String(raw || "").trim(), base).href; } catch { return ""; }
}

export function parseMasterPlaylist(text, baseUrl) {
  const lines = String(text || "").split(/\r?\n/).map(s => s.trim());
  const variants = [];
  const audioGroups = new Map();

  for (const line of lines) {
    if (!line.startsWith("#EXT-X-MEDIA:")) continue;
    const a = parseAttributeList(line);
    if (String(a.TYPE || "").toUpperCase() !== "AUDIO" || !a["GROUP-ID"]) continue;
    const arr = audioGroups.get(a["GROUP-ID"]) || [];
    arr.push({
      groupId: a["GROUP-ID"],
      name: a.NAME || "Audio",
      language: a.LANGUAGE || "",
      isDefault: String(a.DEFAULT || "").toUpperCase() === "YES",
      isAutoSelect: String(a.AUTOSELECT || "").toUpperCase() === "YES",
      channels: a.CHANNELS || "",
      uri: absoluteUrl(a.URI, baseUrl)
    });
    audioGroups.set(a["GROUP-ID"], arr);
  }

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF:")) continue;
    const a = parseAttributeList(lines[i]);
    let uri = "";
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j] || lines[j].startsWith("#")) continue;
      uri = absoluteUrl(lines[j], baseUrl);
      break;
    }
    if (!uri) continue;
    const res = String(a.RESOLUTION || "").match(/(\d+)x(\d+)/i);
    const audioGroup = a.AUDIO || "";
    variants.push({
      uri,
      width: Number(res?.[1] || 0),
      height: Number(res?.[2] || 0),
      bandwidth: Number(a["AVERAGE-BANDWIDTH"] || a.BANDWIDTH || 0),
      codecs: a.CODECS || "",
      frameRate: Number(a["FRAME-RATE"] || 0),
      audioGroup,
      separateAudio: Boolean(audioGroup && (audioGroups.get(audioGroup) || []).some(x => x.uri))
    });
  }

  variants.sort((a, b) => (b.height - a.height) || (b.bandwidth - a.bandwidth));
  return { variants, audioGroups };
}

function parseByteRange(raw, previousEnd = 0) {
  const m = String(raw || "").trim().match(/^(\d+)(?:@(\d+))?$/);
  if (!m) return null;
  const length = Number(m[1]);
  const start = m[2] !== undefined ? Number(m[2]) : previousEnd;
  return { start, end: start + length - 1, length };
}

export function parseMediaPlaylist(text, baseUrl) {
  if (isMasterPlaylist(text)) throw new Error("Master-Playlist wurde fälschlich als Media-Playlist behandelt.");
  const lines = String(text || "").split(/\r?\n/).map(s => s.trim());
  const segments = [];
  let encrypted = false;
  let currentMap = null;
  let pendingRange = null;
  let pendingDuration = 0;
  let timeline = 0;
  let previousRangeEnd = 0;
  let pendingDiscontinuity = false;
  let discontinuitySequence = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith("#EXT-X-KEY:")) {
      const a = parseAttributeList(line);
      if (String(a.METHOD || "").toUpperCase() !== "NONE") encrypted = true;
      continue;
    }
    if (line.startsWith("#EXT-X-MAP:")) {
      const a = parseAttributeList(line);
      const uri = absoluteUrl(a.URI, baseUrl);
      const range = a.BYTERANGE ? parseByteRange(a.BYTERANGE, 0) : null;
      if (uri) currentMap = { url: uri, range };
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      const raw = line.slice(line.indexOf(":") + 1).split(",", 1)[0];
      pendingDuration = Number(raw || 0) || 0;
      continue;
    }
    if (line.startsWith("#EXT-X-BYTERANGE:")) {
      pendingRange = line.slice(line.indexOf(":") + 1);
      continue;
    }
    if (line.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE:")) {
      discontinuitySequence = Number(line.slice(line.indexOf(":") + 1).trim() || 0) || 0;
      continue;
    }
    if (line === "#EXT-X-DISCONTINUITY") {
      pendingDiscontinuity = true;
      discontinuitySequence += 1;
      continue;
    }
    if (line.startsWith("#")) continue;

    const url = absoluteUrl(line, baseUrl);
    if (!url) continue;
    const range = pendingRange ? parseByteRange(pendingRange, previousRangeEnd) : null;
    if (range) previousRangeEnd = range.end + 1;
    else previousRangeEnd = 0;
    const duration = pendingDuration || 0;
    segments.push({ url, range, map: currentMap, duration, start: timeline, end: timeline + duration, discontinuity: pendingDiscontinuity, discontinuitySequence });
    timeline += duration;
    pendingRange = null;
    pendingDuration = 0;
    pendingDiscontinuity = false;
  }

  const first = segments[0]?.url || "";
  const fmp4 = Boolean(segments.some(s => s.map) || /\.(m4s|mp4|cmfv|cmfa)(?:$|[?#])/i.test(first));
  return { encrypted, segments, fmp4, duration: timeline };
}

export function isHlsPlaylist(text) {
  return /^\s*#EXTM3U(?:\s|$)/m.test(String(text || ""));
}

export function isMasterPlaylist(text) {
  return /#EXT-X-STREAM-INF:/i.test(String(text || ""));
}

export function looksLikeHlsPlaylistBytes(bytes) {
  try {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    const head = new TextDecoder("utf-8", { fatal: false }).decode(view.slice(0, 64)).replace(/^\uFEFF/, "").trimStart();
    return head.startsWith("#EXTM3U");
  } catch { return false; }
}

export function chooseVariant(master, selection = "") {
  const variants = master?.variants || [];
  if (!variants.length) return null;
  const opts = typeof selection === "object" && selection ? selection : { uri: String(selection || "") };
  const wanted = String(opts.uri || "");
  if (wanted) {
    const exact = variants.find(v => v.uri === wanted);
    if (exact) return exact;
    try {
      const normalized = new URL(wanted).href;
      const hit = variants.find(v => {
        try { return new URL(v.uri).href === normalized; } catch { return false; }
      });
      if (hit) return hit;
    } catch {}
  }
  const height = Number(opts.height || 0);
  if (height) {
    const sameHeight = variants.filter(v => Number(v.height || 0) === height);
    if (sameHeight.length) {
      const bandwidth = Number(opts.bandwidth || 0);
      if (bandwidth) sameHeight.sort((a,b) => Math.abs(Number(a.bandwidth||0)-bandwidth) - Math.abs(Number(b.bandwidth||0)-bandwidth));
      return sameHeight[0];
    }
  }
  return variants[0] || null;
}

export function chooseBestVariant(master) {
  return chooseVariant(master, "");
}
