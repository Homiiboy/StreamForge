// Persistent serial job dispatcher. Only pending jobs are replayed after a restart.
// A job recorded as running is reported as interrupted, never blindly restarted.
export class PersistentDownloadQueue {
  constructor({ storage, key = 'sf_queue_v170', execute, onQueued = async () => {}, onInterrupted = async () => {}, onError = async () => {} }) {
    if (!storage || typeof execute !== 'function') throw new TypeError('storage and execute required');
    this.storage = storage; this.key = key; this.execute = execute;
    this.onQueued = onQueued; this.onInterrupted = onInterrupted; this.onError = onError;
    this.pending = []; this.active = null; this.draining = false;
    this.lock = Promise.resolve();
    this.ready = this.restore();
  }
  get waiting() { return this.pending.length; }
  get busy() { return this.active !== null; }
  serialize() {
    return { version: 1, active: this.active, pending: this.pending.slice() };
  }
  async persist() {
    const snapshot = this.serialize();
    const operation = this.lock.catch(() => {}).then(() => this.storage.set({ [this.key]: snapshot }));
    this.lock = operation;
    return operation;
  }
  async restore() {
    const record = (await this.storage.get(this.key))?.[this.key];
    if (record?.version === 1) {
      this.pending = (Array.isArray(record.pending) ? record.pending : []).filter(validJob);
      if (validJob(record.active)) await this.onInterrupted(record.active);
      this.active = null;
      await this.persist();
    }
    this.drain().catch(() => {});
  }
  async enqueue(job) {
    await this.ready;
    if (!validJob(job)) throw new TypeError('Invalid download job');
    if (this.active?.id === job.id || this.pending.some(j => j.id === job.id)) return { ok: false, reason: 'duplicate' };
    // Enqueue then persist BEFORE scheduling the new download.
    this.pending.push(job);
    try { await this.persist(); }
    catch (error) { this.pending = this.pending.filter(j => j.id !== job.id); throw error; }
    const position = this.pending.findIndex(j => j.id === job.id) + (this.active ? 1 : 0);
    if (position > 0) await this.onQueued(job, position);
    this.drain().catch(() => {});
    return { ok: true, position };
  }
  async cancel(id) {
    await this.ready;
    const index = this.pending.findIndex(j => j.id === id);
    if (index < 0) return false;
    const [job] = this.pending.splice(index, 1);
    try { await this.persist(); }
    catch (error) { this.pending.splice(index, 0, job); throw error; }
    return true;
  }
  async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length) {
        const job = this.pending.shift();
        this.active = job;
        try { await this.persist(); }
        catch (error) {
          this.active = null;
          this.pending.unshift(job);
          throw error;
        }
        try { await this.execute(job); }
        catch (error) { try { await this.onError(job, error); } catch {} }
        this.active = null;
        try { await this.persist(); }
        catch { break; } // Avoid re-running a completed task if storage is unavailable.
      }
    } finally { this.draining = false; }
  }
}
function validJob(j) {
  return !!j && typeof j === 'object' && typeof j.id === 'string' && j.id.length > 0 &&
    (j.type === 'sf_hls_start' || j.type === 'sf_dash_start') &&
    !!j.job && Number.isInteger(j.job.tabId) && typeof j.job.candidateId === 'string' &&
    typeof j.job.jobId === 'string' && /^https?:\/\//.test(j.job.url || '');
}
