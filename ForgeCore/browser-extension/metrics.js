export class TransferMetrics {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.startedAt = now();
    this.downloadedBytes = 0;
    this.outputBytes = 0;
    this.samples = [{ t: this.startedAt, bytes: 0 }];
    this.fetchMs = 0;
    this.muxMs = 0;
  }

  addDownloaded(bytes) {
    const n = Number(bytes || 0);
    if (n <= 0) return;
    this.downloadedBytes += n;
    const t = this.now();
    this.samples.push({ t, bytes: this.downloadedBytes });
    // A shorter rolling window reacts to CDN fluctuations while remaining
    // stable enough for HLS chunked reads.
    const cutoff = t - 8000;
    while (this.samples.length > 2 && this.samples[1].t < cutoff) this.samples.shift();
  }

  addOutput(bytes) {
    const n = Number(bytes || 0);
    if (n >= 0) this.outputBytes = n;
  }

  addTiming(fetchMs = 0, muxMs = 0) {
    this.fetchMs += Math.max(0, Number(fetchMs || 0));
    this.muxMs += Math.max(0, Number(muxMs || 0));
  }

  speedBps() {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0], last = this.samples[this.samples.length - 1];
    if ((this.now() - last.t) > 5000) return 0;
    const seconds = (last.t - first.t) / 1000;
    return seconds > 0 ? Math.max(0, (last.bytes - first.bytes) / seconds) : 0;
  }

  bottleneck() {
    const f = this.fetchMs, m = this.muxMs;
    if (!f && !m) return '';
    if (f > m * 1.35) return 'Netzwerk';
    if (m > f * 1.35) return 'Muxing';
    return 'Gemischt';
  }

  etaSeconds(done = 0, total = 0, startedAt = this.startedAt, { minDone = 10, minElapsedSeconds = 6 } = {}) {
    const d = Number(done || 0), t = Number(total || 0);
    if (d < minDone || t <= d) return 0;
    const elapsed = Math.max(0, (this.now() - startedAt) / 1000);
    if (elapsed < minElapsedSeconds) return 0;
    return Math.max(0, elapsed / d * (t - d));
  }

  snapshot(extra = {}) {
    const done = Number(extra.segmentDone || 0), total = Number(extra.segmentTotal || 0);
    const eta = extra.etaSeconds !== undefined
      ? Math.max(0, Number(extra.etaSeconds || 0))
      : this.etaSeconds(done, total, extra.phaseStartedAt || this.startedAt);
    return {
      downloadedBytes: this.downloadedBytes,
      outputBytes: this.outputBytes,
      speedBps: Math.round(this.speedBps()),
      etaSeconds: Math.round(eta),
      etaPending: Boolean(extra.etaPending ?? (total > done && eta <= 0)),
      bottleneck: extra.bottleneck || this.bottleneck(),
      ...extra
    };
  }
}

export function muxEtaSeconds(done, total, startedAt, now = performance.now()) {
  const d = Number(done || 0), t = Number(total || 0);
  if (d <= 0 || t <= d) return 0;
  const start = Number.isFinite(Number(startedAt)) ? Number(startedAt) : Number(now);
  const elapsed = Math.max(0, (Number(now) - start) / 1000);
  return elapsed > 0 ? Math.max(0, Math.round(elapsed / d * (t - d))) : 0;
}
