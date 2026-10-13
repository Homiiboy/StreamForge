// Serializes resource-heavy HLS/DASH muxing jobs inside the offscreen document.
// Independent browser-native downloads are unaffected.
export class DownloadQueue {
  constructor() { this.pending = []; this.running = false; }
  get waiting() { return this.pending.length; }
  get busy() { return this.running; }
  enqueue(task, id = '') {
    if (typeof task !== 'function') throw new TypeError('Queue task must be a function');
    const position = this.pending.length + (this.running ? 1 : 0);
    const promise = new Promise((resolve, reject) => {
      if (id && this.pending.some(item => item.id === id)) { reject(new Error('Auftrag bereits in Warteschlange')); return; }
      this.pending.push({ id, task, resolve, reject });
      this.drain();
    });
    return { position, promise };
  }
  cancel(id) {
    const index = this.pending.findIndex(item => item.id === id);
    if (index === -1) return false;
    const [item] = this.pending.splice(index, 1);
    const error = new Error('Wartender Download abgebrochen');
    error.code = 'QUEUE_CANCELLED';
    item.reject(error);
    return true;
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const item = this.pending.shift();
        try { item.resolve(await item.task()); }
        catch (error) { item.reject(error); }
      }
    } finally { this.running = false; }
  }
}
