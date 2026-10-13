export const QUICK_PROBE_ATTEMPTS = 2;
export const ROBUST_PROBE_ATTEMPTS = 5;
export const PROBE_RETRY_COOLDOWN_MS = 30_000;

export function probeTimeoutMs(attempt = 1, mode = 'quick') {
  const n = Math.max(1, Number(attempt || 1));
  if (mode === 'download') return n <= 2 ? 12_000 : 18_000;
  return n <= 1 ? 7_000 : 10_000;
}

export function hlsPlaylistType(text = '') {
  const raw = String(text || '');
  if (/#EXT-X-STREAM-INF:/i.test(raw)) return 'master';
  if (/#EXTINF:/i.test(raw) || /#EXT-X-TARGETDURATION:/i.test(raw)) return 'media';
  return 'unknown';
}

function fmtMbps(bps) {
  const n = Number(bps || 0);
  return n ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} Mbps` : '';
}

export function buildProbeSummary(kind, probe = {}) {
  const parts = [];
  if (probe.height) parts.push(`${probe.height}p`);
  if (probe.bandwidth) parts.push(fmtMbps(probe.bandwidth));
  if (Number(probe.variants || 0) > 1) parts.push(`${probe.variants} Varianten`);
  if (Number(probe.audioTracks?.length || 0) > 1) parts.push(`${probe.audioTracks.length} Audiospuren`);
  if (parts.length) return parts.join(' · ');
  if (kind === 'hls') {
    if (probe.playlistType === 'master') return 'HLS · Master-Playlist';
    if (probe.playlistType === 'media') return 'HLS · bereit';
    return 'HLS · analysiert';
  }
  if (kind === 'dash') return 'DASH · analysiert';
  return '';
}

export function shouldProbeNow(item = {}, now = Date.now()) {
  if (item.probe) return false;
  const retryAt = Number(item.probeRetryAfter || 0);
  return !retryAt || retryAt <= now;
}
