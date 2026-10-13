/**
 * Runtime helpers for StreamForge's bounded HLS download/mux pipeline.
 * No Chrome APIs are used here so the concurrency behaviour can be tested in Node.
 */

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

export function recommendedBufferPairs(concurrency, { min = 12, max = 32, multiplier = 3 } = {}) {
  return Math.round(clamp(Math.max(min, Number(concurrency || 1) * multiplier), min, max));
}

export function recommendedBufferLimits(concurrency, { minPairs = 12, maxPairs = 32, multiplier = 3, maxBytes = 160 * 1024 * 1024 } = {}) {
  return {
    maxPairs: recommendedBufferPairs(concurrency, { min: minPairs, max: maxPairs, multiplier }),
    maxBytes: Math.max(16 * 1024 * 1024, Number(maxBytes || 0))
  };
}

export function effectiveBufferPairs(concurrency, averagePairBytes = 8 * 1024 * 1024, limits = recommendedBufferLimits(concurrency)) {
  const c = Math.max(1, Math.floor(Number(concurrency || 1)));
  const avg = Math.max(1, Number(averagePairBytes || 1));
  const maxPairs = Math.max(c, Math.floor(Number(limits?.maxPairs || c)));
  const maxBytes = Math.max(avg, Number(limits?.maxBytes || avg));
  const byteLimitedPairs = Math.max(c, Math.floor(maxBytes / avg));
  return Math.max(c, Math.min(maxPairs, byteLimitedPairs));
}

/**
 * A semaphore whose limit is read dynamically. If adaptive networking lowers
 * the limit while requests are active, existing requests are allowed to finish
 * but no new request is started until the active count is below the new limit.
 */
export function createDynamicLimiter(getLimit = () => 1) {
  let active = 0;
  const queue = [];

  const currentLimit = () => Math.max(1, Math.floor(Number(getLimit?.() || 1)));

  const pump = () => {
    const limit = currentLimit();
    while (active < limit && queue.length) {
      const item = queue.shift();
      active++;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          active--;
          pump();
        });
    }
  };

  return {
    run(task) {
      return new Promise((resolve, reject) => {
        queue.push({ task, resolve, reject });
        pump();
      });
    },
    refresh: pump,
    cancelPending(reason = new Error('Pipeline abgebrochen')) {
      while (queue.length) {
        const item = queue.shift();
        item.reject(reason);
      }
    },
    active: () => active,
    queued: () => queue.length,
    limit: currentLimit
  };
}

/**
 * Occupancy-based bottleneck detection for the streaming mux path. This avoids
 * classifying parallel fetch wall-clock time as CPU/mux time, which made older
 * releases incorrectly report "Muxing" while the buffer was actually empty.
 */
export function pipelineBottleneck({
  downloadDone = 0,
  muxDone = 0,
  total = 0,
  bufferPairs = 0,
  bufferCapacity = 1,
  activeRequests = 0,
  queuedRequests = 0,
  headReady = true
} = {}) {
  const totalN = Math.max(0, Number(total || 0));
  const dl = Math.max(0, Number(downloadDone || 0));
  const mx = Math.max(0, Number(muxDone || 0));
  const buf = Math.max(0, Number(bufferPairs || 0));
  const cap = Math.max(1, Number(bufferCapacity || 1));
  const active = Math.max(0, Number(activeRequests || 0));
  const queued = Math.max(0, Number(queuedRequests || 0));

  if (totalN && dl >= totalN && mx < totalN) return 'Muxing';
  if (!headReady && (active > 0 || queued > 0)) return 'Netzwerk';
  if (buf >= Math.max(2, Math.ceil(cap * 0.7))) return 'Muxing';
  if ((active > 0 || queued > 0) && buf <= 1) return 'Netzwerk';
  if ((active > 0 || queued > 0) && buf > 1) return 'Gemischt';
  return '';
}
