const MANIFEST_EXTENSIONS = [[".m3u8", "hls"], [".mpd", "dash"]];
const MEDIA_EXTENSIONS = [".mp4", ".m4v", ".webm", ".mov", ".mkv", ".avi", ".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav"];
const SEGMENT_EXTENSIONS = [".ts", ".m4s", ".cmfv", ".cmfa", ".mp2t"];
const VOLATILE_QUERY_KEYS = new Set([
  "token", "auth", "authorization", "expires", "expire", "exp", "signature", "sig",
  "policy", "key-pair-id", "hdnts", "hdnea", "hmac", "st", "e", "hash"
]);

export function cleanUrl(raw) {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (!/^https?:\/\//i.test(value)) return "";
  try { const u = new URL(value); u.hash = ""; return u.href; } catch { return ""; }
}

export function canonicalUrlForDedup(raw) {
  const value = cleanUrl(raw);
  if (!value) return "";
  try {
    const u = new URL(value);
    for (const key of [...u.searchParams.keys()]) {
      if (VOLATILE_QUERY_KEYS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    return u.href;
  } catch { return value; }
}

export function mediaKindFromUrl(raw) {
  const value = cleanUrl(raw); if (!value) return null;
  let path = ""; try { path = new URL(value).pathname.toLowerCase(); } catch { return null; }
  if (SEGMENT_EXTENSIONS.some(ext => path.endsWith(ext))) return null;
  for (const [ext, kind] of MANIFEST_EXTENSIONS) if (path.endsWith(ext)) return kind;
  if (MEDIA_EXTENSIONS.some(ext => path.endsWith(ext))) return "media";
  return null;
}

export function mediaKindFromContentType(raw) {
  const ct = String(raw || "").toLowerCase().split(";", 1)[0].trim();
  if (!ct) return null;
  if (["application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl", "audio/x-mpegurl"].includes(ct)) return "hls";
  if (ct === "application/dash+xml") return "dash";
  if (ct.startsWith("video/") || ct.startsWith("audio/")) {
    if (["video/mp2t", "video/iso.segment"].includes(ct)) return null;
    return "media";
  }
  return null;
}

export function classifyCandidate({url, contentType, resourceType}) {
  return mediaKindFromUrl(url) || mediaKindFromContentType(contentType) || (resourceType === "media" && cleanUrl(url) ? "media" : null);
}

export function safeHostname(raw) { try { return new URL(raw).hostname; } catch { return ""; } }
export function displayName(raw) {
  try { const u = new URL(raw); const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || u.hostname); return last.length > 90 ? last.slice(0, 87) + "…" : last; }
  catch { return "Medienstream"; }
}
export function makeCandidateKey(candidate) { return `${candidate.kind}|${canonicalUrlForDedup(candidate.url)}`; }

export function hlsProbeContainsVariant(probe, rawUrl) {
  const wanted = canonicalUrlForDedup(rawUrl);
  if (!wanted) return false;
  return (probe?.variantOptions || []).some(v => canonicalUrlForDedup(v?.uri || v?.url || "") === wanted);
}

export function extensionFromUrl(raw) {
  try {
    const name = new URL(raw).pathname.split("/").pop() || "";
    const m = name.match(/(\.[a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase() : "";
  } catch { return ""; }
}

export function safeFilename(raw, fallback = "StreamForge-Download") {
  const text = String(raw || fallback).replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, 140);
}
