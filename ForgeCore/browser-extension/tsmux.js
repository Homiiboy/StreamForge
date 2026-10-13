// StreamForge MPEG-TS remuxer.
// Re-packetizes existing PES packets from separate HLS video/audio tracks into
// one MPEG-TS without decoding/re-encoding. Supports H.264/HEVC video and
// AAC-in-TS or raw ADTS AAC audio.

const TS_SIZE = 188;
const PID_PAT = 0x0000;
const PID_VIDEO = 0x0100;
const PID_AUDIO = 0x0101;
const PID_PMT = 0x1000;
const PTS_WRAP = 2 ** 33;

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function isMpegTs(bytes) {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (a.length < TS_SIZE * 3) return false;
  for (let off = 0; off < Math.min(TS_SIZE, a.length); off++) {
    if (a[off] === 0x47 && a[off + TS_SIZE] === 0x47 && a[off + TS_SIZE * 2] === 0x47) return true;
  }
  return false;
}

function syncOffset(a) {
  for (let off = 0; off < Math.min(TS_SIZE, a.length); off++) {
    if (a[off] === 0x47 && a[off + TS_SIZE] === 0x47 && a[off + TS_SIZE * 2] === 0x47) return off;
  }
  throw new Error('MPEG-TS Sync-Bytes wurden nicht gefunden.');
}

function payloadInfo(a, p) {
  if (a[p] !== 0x47) return null;
  const pusi = Boolean(a[p + 1] & 0x40);
  const pid = ((a[p + 1] & 0x1f) << 8) | a[p + 2];
  const afc = (a[p + 3] >> 4) & 0x03;
  if (afc === 0 || afc === 2) return { pid, pusi, start: p + TS_SIZE, end: p + TS_SIZE };
  let start = p + 4;
  if (afc === 3) start += 1 + a[start];
  if (start > p + TS_SIZE) start = p + TS_SIZE;
  return { pid, pusi, start, end: p + TS_SIZE };
}

function parseTimestampAt(pes, o) {
  if (pes.length < o + 5) return null;
  // Use arithmetic instead of JS bitwise shifts for the 33-bit clock.
  // Bitwise operators coerce to signed 32-bit integers and can corrupt high
  // PTS/DTS values in long-running streams.
  return ((pes[o] & 0x0e) * 2 ** 29) + (pes[o + 1] * 2 ** 22) + ((pes[o + 2] & 0xfe) * 2 ** 14) + (pes[o + 3] * 2 ** 7) + ((pes[o + 4] & 0xfe) / 2);
}

function parsePtsDts(pes) {
  if (pes.length < 14 || pes[0] !== 0 || pes[1] !== 0 || pes[2] !== 1) return { pts: null, dts: null };
  const flags = (pes[7] >> 6) & 0x03;
  if (flags !== 2 && flags !== 3) return { pts: null, dts: null };
  const pts = parseTimestampAt(pes, 9);
  const dts = flags === 3 ? parseTimestampAt(pes, 14) : pts;
  return { pts, dts };
}

function streamKind(type, streamId) {
  if ([0x01, 0x02, 0x10, 0x1b, 0x24, 0x27, 0x42].includes(type)) return 'video';
  if ([0x03, 0x04, 0x0f, 0x11, 0x81, 0x87].includes(type)) return 'audio';
  if (streamId >= 0xe0 && streamId <= 0xef) return 'video';
  if (streamId >= 0xc0 && streamId <= 0xdf) return 'audio';
  return '';
}

function parsePat(payload) {
  if (!payload.length) return null;
  let o = payload[0] + 1;
  if (o + 8 > payload.length || payload[o] !== 0x00) return null;
  const sectionLength = ((payload[o + 1] & 0x0f) << 8) | payload[o + 2];
  const end = Math.min(payload.length, o + 3 + sectionLength - 4);
  o += 8;
  while (o + 4 <= end) {
    const program = (payload[o] << 8) | payload[o + 1];
    const pid = ((payload[o + 2] & 0x1f) << 8) | payload[o + 3];
    if (program !== 0) return pid;
    o += 4;
  }
  return null;
}

function parsePmt(payload) {
  if (!payload.length) return [];
  let o = payload[0] + 1;
  if (o + 12 > payload.length || payload[o] !== 0x02) return [];
  const sectionLength = ((payload[o + 1] & 0x0f) << 8) | payload[o + 2];
  const sectionEnd = Math.min(payload.length, o + 3 + sectionLength - 4);
  const programInfoLength = ((payload[o + 10] & 0x0f) << 8) | payload[o + 11];
  o += 12 + programInfoLength;
  const streams = [];
  while (o + 5 <= sectionEnd) {
    const type = payload[o];
    const pid = ((payload[o + 1] & 0x1f) << 8) | payload[o + 2];
    const esInfoLength = ((payload[o + 3] & 0x0f) << 8) | payload[o + 4];
    streams.push({ pid, type });
    o += 5 + esInfoLength;
  }
  return streams;
}

export function extractPesFromTs(bytes, wantedKind = '') {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const off = syncOffset(a);
  let pmtPid = -1;
  const streamTypes = new Map();
  const current = new Map();
  const pes = [];

  const finish = pid => {
    const c = current.get(pid); current.delete(pid);
    if (!c || !c.parts.length) return;
    const data = concat(c.parts);
    if (data.length < 9 || data[0] !== 0 || data[1] !== 0 || data[2] !== 1) return;
    const streamId = data[3];
    const type = streamTypes.get(pid) || 0;
    const kind = streamKind(type, streamId);
    if (!kind || (wantedKind && kind !== wantedKind)) return;
    const timing = parsePtsDts(data);
    const declaredLength = (data[4] << 8) | data[5];
    const expectedLength = declaredLength ? declaredLength + 6 : 0;
    pes.push({ pid, type, kind, streamId, pts: timing.pts, dts: timing.dts, truncated: Boolean(expectedLength && data.length < expectedLength), data });
  };

  for (let p = off; p + TS_SIZE <= a.length; p += TS_SIZE) {
    if (a[p] !== 0x47) throw new Error('MPEG-TS Syncverlust innerhalb des Segments.');
    if (a[p + 1] & 0x80) throw new Error('MPEG-TS Transport-Error-Bit gesetzt; Segment ist beschädigt.');
    const info = payloadInfo(a, p); if (!info || info.start >= info.end) continue;
    const payload = a.subarray(info.start, info.end);
    if (info.pid === PID_PAT && info.pusi) { const found = parsePat(payload); if (found !== null) pmtPid = found; continue; }
    if (info.pid === pmtPid && info.pusi) { for (const s of parsePmt(payload)) streamTypes.set(s.pid, s.type); continue; }

    if (info.pusi) {
      finish(info.pid);
      if (payload.length >= 4 && payload[0] === 0 && payload[1] === 0 && payload[2] === 1) current.set(info.pid, { parts: [payload] });
    } else {
      const c = current.get(info.pid); if (c) c.parts.push(payload);
    }
  }
  for (const pid of [...current.keys()]) finish(pid);
  return { pes, streamTypes };
}

export function isAdts(bytes) {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  for (let i = 0; i + 7 <= Math.min(a.length, 4096); i++) if (a[i] === 0xff && (a[i + 1] & 0xf6) === 0xf0) return true;
  return false;
}

const ADTS_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
function adtsFrames(bytes) {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0); const frames = [];
  let p = 0;
  while (p + 7 <= a.length) {
    if (!(a[p] === 0xff && (a[p + 1] & 0xf6) === 0xf0)) { p++; continue; }
    const rateIndex = (a[p + 2] >> 2) & 0x0f; const rate = ADTS_RATES[rateIndex] || 0;
    const len = ((a[p + 3] & 0x03) << 11) | (a[p + 4] << 3) | ((a[p + 5] >> 5) & 0x07);
    if (!rate || len < 7 || p + len > a.length) break;
    const blocks = (a[p + 6] & 0x03) + 1;
    frames.push({ bytes: a.subarray(p, p + len), rate, samples: 1024 * blocks }); p += len;
  }
  return frames;
}

function encodePts(pts) {
  let v = ((Math.round(pts) % PTS_WRAP) + PTS_WRAP) % PTS_WRAP;
  const b = new Uint8Array(5);
  b[0] = 0x20 | (Math.floor(v / 2 ** 29) & 0x0e) | 1;
  b[1] = Math.floor(v / 2 ** 22) & 0xff;
  b[2] = (Math.floor(v / 2 ** 14) & 0xfe) | 1;
  b[3] = Math.floor(v / 2 ** 7) & 0xff;
  b[4] = ((Math.floor(v) & 0x7f) << 1) | 1;
  return b;
}

function encodeTimestamp(value, prefix) {
  let v = ((Math.round(value) % PTS_WRAP) + PTS_WRAP) % PTS_WRAP;
  const b = new Uint8Array(5);
  b[0] = ((prefix & 0x0f) << 4) | (Math.floor(v / 2 ** 29) & 0x0e) | 1;
  b[1] = Math.floor(v / 2 ** 22) & 0xff;
  b[2] = (Math.floor(v / 2 ** 14) & 0xfe) | 1;
  b[3] = Math.floor(v / 2 ** 7) & 0xff;
  b[4] = ((Math.floor(v) & 0x7f) << 1) | 1;
  return b;
}

function rewritePesTimestamps(data, pts, dts) {
  if (!data || data.length < 14) return data;
  const flags = (data[7] >> 6) & 0x03;
  if (flags === 2 && Number.isFinite(pts)) {
    data.set(encodeTimestamp(pts, 0x2), 9);
  } else if (flags === 3 && Number.isFinite(pts) && Number.isFinite(dts)) {
    data.set(encodeTimestamp(pts, 0x3), 9);
    data.set(encodeTimestamp(dts, 0x1), 14);
  }
  return data;
}

function makePes(streamId, payload, pts) {
  const hdr = new Uint8Array(14);
  hdr.set([0x00, 0x00, 0x01, streamId], 0);
  const packetLen = payload.length + 8;
  const len = packetLen <= 0xffff ? packetLen : 0;
  hdr[4] = (len >> 8) & 0xff; hdr[5] = len & 0xff;
  hdr[6] = 0x80; hdr[7] = 0x80; hdr[8] = 0x05; hdr.set(encodePts(pts), 9);
  return concat([hdr, payload]);
}

export function aacPesFromAdts(bytes, startPts = 0) {
  const frames = adtsFrames(bytes); if (!frames.length) throw new Error('AAC/ADTS-Audiospur konnte nicht gelesen werden.');
  const out = []; let i = 0; let samplesBefore = 0; const firstRate = frames[0].rate;
  while (i < frames.length) {
    const group = []; let size = 0; const groupStartSamples = samplesBefore;
    while (i < frames.length && size + frames[i].bytes.length < 48 * 1024 && group.length < 48) {
      group.push(frames[i].bytes); size += frames[i].bytes.length; samplesBefore += frames[i].samples; i++;
    }
    const pts = startPts + groupStartSamples * 90000 / firstRate;
    out.push({ kind: 'audio', type: 0x0f, streamId: 0xc0, pts, dts: pts, truncated: false, data: makePes(0xc0, concat(group), pts) });
  }
  return out;
}

function crc32Mpeg(a) {
  let crc = 0xffffffff;
  for (const byte of a) {
    crc ^= byte << 24;
    for (let i = 0; i < 8; i++) crc = (crc & 0x80000000) ? ((crc << 1) ^ 0x04c11db7) >>> 0 : (crc << 1) >>> 0;
  }
  return crc >>> 0;
}
function appendCrc(section) {
  const crc = crc32Mpeg(section); const out = new Uint8Array(section.length + 4); out.set(section);
  out[section.length] = (crc >>> 24) & 255; out[section.length + 1] = (crc >>> 16) & 255; out[section.length + 2] = (crc >>> 8) & 255; out[section.length + 3] = crc & 255; return out;
}
function patSection() {
  return appendCrc(Uint8Array.from([0x00,0xb0,0x0d, 0x00,0x01, 0xc1,0x00,0x00, 0x00,0x01, 0xe0 | ((PID_PMT>>8)&0x1f),PID_PMT&0xff]));
}
function pmtSection(videoType, audioType) {
  const body = Uint8Array.from([
    0x02,0xb0,0x17, 0x00,0x01, 0xc1,0x00,0x00,
    0xe0 | ((PID_VIDEO>>8)&0x1f),PID_VIDEO&0xff, 0xf0,0x00,
    videoType,0xe0|((PID_VIDEO>>8)&0x1f),PID_VIDEO&0xff,0xf0,0x00,
    audioType,0xe0|((PID_AUDIO>>8)&0x1f),PID_AUDIO&0xff,0xf0,0x00
  ]);
  return appendCrc(body);
}
function psiPacket(pid, section, cc) {
  const out = new Uint8Array(TS_SIZE); out.fill(0xff); out[0] = 0x47; out[1] = 0x40 | ((pid >> 8) & 0x1f); out[2] = pid & 0xff; out[3] = 0x10 | (cc & 0x0f); out[4] = 0; out.set(section, 5); return out;
}
function pcrBytes(pts90k) {
  const base = BigInt(Math.max(0, Math.round(pts90k))) & ((1n << 33n) - 1n); const out = new Uint8Array(6);
  out[0] = Number((base >> 25n) & 255n); out[1] = Number((base >> 17n) & 255n); out[2] = Number((base >> 9n) & 255n); out[3] = Number((base >> 1n) & 255n); out[4] = Number((base & 1n) << 7n) | 0x7e; out[5] = 0; return out;
}

function packetizePes(pes, pid, ccStart, pcrPts = null, discontinuity = false) {
  const packets = []; let pos = 0, cc = ccStart & 15, first = true;
  while (pos < pes.length) {
    const needPcr = first && pcrPts !== null && Number.isFinite(pcrPts);
    const needDiscontinuity = first && Boolean(discontinuity);
    const maxPayload = needPcr ? 176 : (needDiscontinuity ? 182 : 184);
    const remaining = pes.length - pos;
    const payloadLen = Math.min(remaining, maxPayload);
    let adaptationLen = null;
    if (needPcr || needDiscontinuity) adaptationLen = 183 - payloadLen;
    else if (payloadLen < 184) adaptationLen = 183 - payloadLen;

    const out = new Uint8Array(TS_SIZE); out.fill(0xff);
    out[0] = 0x47; out[1] = (first ? 0x40 : 0) | ((pid >> 8) & 0x1f); out[2] = pid & 0xff;
    const afc = adaptationLen === null ? 1 : 3; out[3] = (afc << 4) | cc; cc = (cc + 1) & 15;
    let o = 4;
    if (adaptationLen !== null) {
      out[o++] = adaptationLen;
      if (adaptationLen > 0) {
        out[o++] = (needPcr ? 0x10 : 0x00) | (needDiscontinuity ? 0x80 : 0x00);
        if (needPcr) { out.set(pcrBytes(pcrPts), o); o += 6; }
        while (o < 4 + 1 + adaptationLen) out[o++] = 0xff;
      }
    }
    out.set(pes.subarray(pos, pos + payloadLen), o); pos += payloadLen; first = false; packets.push(out);
  }
  return { packets, cc };
}

function normalizedPts(v, base) {
  if (!Number.isFinite(v)) return Number.MAX_SAFE_INTEGER;
  let x = v; while (x + PTS_WRAP / 2 < base) x += PTS_WRAP; while (x - PTS_WRAP / 2 > base) x -= PTS_WRAP; return x;
}

export class TsMuxer {
  constructor(writable, { flushBytes = 2 * 1024 * 1024 } = {}) {
    this.writable = writable;
    this.cc = new Map([[PID_PAT,0],[PID_PMT,0],[PID_VIDEO,0],[PID_AUDIO,0]]);
    this.videoType = 0x1b;
    this.audioType = 0x0f;
    this.initialized = false;
    this.pesCount = 0;
    this.basePts = null;
    this.discontinuityPending = false;
    this.discontinuityPidsPending = new Set();
    this.pendingEpochRebase = false;
    this.timestampOffset = 0;
    this.lastVideoDts = null;
    this.lastVideoStep = null;
    this.lastAudioDts = null;
    this.lastAudioStep = null;
    // Logical output size, including bytes still waiting in the persistent
    // output buffer. This keeps progress accurate without forcing disk I/O.
    this.bytesWritten = 0;
    this.physicalBytesWritten = 0;
    this.writerCalls = 0;
    this.flushBytes = Math.max(256 * 1024, Number(flushBytes || 0));
    this.pending = [];
    this.pendingBytes = 0;
  }

  queueBytes(bytes) {
    if (!bytes?.length) return;
    this.pending.push(bytes);
    this.pendingBytes += bytes.length;
    this.bytesWritten += bytes.length;
  }

  async flush(force = true) {
    if (!this.pendingBytes) return;
    if (!force && this.pendingBytes < this.flushBytes) return;
    const block = concat(this.pending);
    this.pending.length = 0;
    this.pendingBytes = 0;
    await this.writable.write(block);
    this.physicalBytesWritten += block.length;
    this.writerCalls++;
  }

  queuePacket(packet) {
    this.queueBytes(packet);
    return this.pendingBytes >= this.flushBytes;
  }

  async tables() {
    let cc = this.cc.get(PID_PAT) || 0;
    this.queuePacket(psiPacket(PID_PAT, patSection(), cc));
    this.cc.set(PID_PAT,(cc+1)&15);
    cc = this.cc.get(PID_PMT) || 0;
    this.queuePacket(psiPacket(PID_PMT, pmtSection(this.videoType,this.audioType), cc));
    this.cc.set(PID_PMT,(cc+1)&15);
    if (this.pendingBytes >= this.flushBytes) await this.flush(true);
  }

  async init(videoType=0x1b,audioType=0x0f) {
    this.videoType = videoType || 0x1b;
    this.audioType = audioType || 0x0f;
    if (!this.initialized) {
      this.initialized = true;
      await this.tables();
    }
  }

  async writeEntries(entries = []) {
    const all = [...entries];
    // Decode order matters for AVC/HEVC with B-frames. PTS is presentation
    // order and can move backwards relative to the bitstream; DTS is the
    // correct clock for packet ordering and PCR generation. Audio generally
    // has DTS == PTS. Modern JS sort is stable, preserving source order when
    // timestamps are equal or unavailable.
    const rawClock = e => Number.isFinite(e.dts) ? e.dts : e.pts;

    // EXT-X-DISCONTINUITY often resets source PTS/DTS. Merely setting the TS
    // discontinuity flag is not enough for files: some demuxers then report a
    // shortened duration or jump backwards. Rebase the new epoch onto the
    // previous decode timeline and rewrite the PES header timestamps. One
    // shared offset preserves the real audio/video encoder delay.
    if (this.pendingEpochRebase && all.length) {
      const firstVideo = all.find(e => e.kind === 'video' && Number.isFinite(rawClock(e)));
      const firstAudio = all.find(e => e.kind === 'audio' && Number.isFinite(rawClock(e)));
      const deltas = [];
      if (firstVideo && Number.isFinite(this.lastVideoDts)) {
        const source = rawClock(firstVideo) + this.timestampOffset;
        const step = Number.isFinite(this.lastVideoStep) && this.lastVideoStep > 0 ? this.lastVideoStep : 1;
        deltas.push((this.lastVideoDts + step) - source);
      }
      if (firstAudio && Number.isFinite(this.lastAudioDts)) {
        const source = rawClock(firstAudio) + this.timestampOffset;
        const step = Number.isFinite(this.lastAudioStep) && this.lastAudioStep > 0 ? this.lastAudioStep : 1;
        deltas.push((this.lastAudioDts + step) - source);
      }
      if (deltas.length) this.timestampOffset += Math.max(...deltas);
      this.pendingEpochRebase = false;
    }

    if (this.timestampOffset) {
      for (const e of all) {
        if (Number.isFinite(e.pts)) e.pts += this.timestampOffset;
        if (Number.isFinite(e.dts)) e.dts += this.timestampOffset;
        rewritePesTimestamps(e.data, e.pts, Number.isFinite(e.dts) ? e.dts : e.pts);
      }
    }

    const firstClock = all.find(x => Number.isFinite(x.dts) || Number.isFinite(x.pts));
    const firstDts = Number.isFinite(firstClock?.dts) ? firstClock.dts : (firstClock?.pts ?? 0);
    if (this.basePts === null) this.basePts = firstDts;
    const clock = e => Number.isFinite(e.dts) ? e.dts : e.pts;
    all.sort((a,b) => normalizedPts(clock(a),this.basePts) - normalizedPts(clock(b),this.basePts) || (a.kind==='video'?-1:1));

    // Keep one persistent output buffer across PES and HLS segment boundaries.
    // PAT/PMT packets are queued in-order too; they no longer force a flush.
    // This turns tens of thousands of ~50 KiB OPFS writes into a much smaller
    // number of ~2 MiB writes while preserving every MPEG-TS byte unchanged.
    for (const e of all) {
      if (this.pesCount && this.pesCount % 80 === 0) await this.tables();
      const pid = e.kind === 'video' ? PID_VIDEO : PID_AUDIO;
      const cc = this.cc.get(pid) || 0;
      const markDisc = this.discontinuityPidsPending.has(pid);
      const pcrClock = e.kind === 'video' ? (Number.isFinite(e.dts) ? e.dts : e.pts) : null;
      const pk = packetizePes(e.data, pid, cc, pcrClock, markDisc);
      if (markDisc) this.discontinuityPidsPending.delete(pid);
      this.cc.set(pid, pk.cc);
      for (const packet of pk.packets) {
        this.queueBytes(packet);
        if (this.pendingBytes >= this.flushBytes) await this.flush(true);
      }
      const dts = Number.isFinite(e.dts) ? e.dts : e.pts;
      if (Number.isFinite(dts) && e.kind === 'video') {
        if (Number.isFinite(this.lastVideoDts)) {
          const step = dts - this.lastVideoDts;
          if (step > 0 && step < 90000) this.lastVideoStep = step;
        }
        this.lastVideoDts = dts;
      } else if (Number.isFinite(dts) && e.kind === 'audio') {
        if (Number.isFinite(this.lastAudioDts)) {
          const step = dts - this.lastAudioDts;
          if (step > 0 && step < 90000) this.lastAudioStep = step;
        }
        this.lastAudioDts = dts;
      }
      this.pesCount++;
    }
  }

  async markDiscontinuity() {
    // HLS DISCONTINUITY may reset the source timestamp timeline. Reset the
    // normalization base and mark the next output PES with the MPEG-TS
    // discontinuity_indicator so downstream demuxers do not interpret the
    // jump as corruption.
    this.pendingEpochRebase = true;
    this.discontinuityPending = true;
    this.discontinuityPidsPending = new Set([PID_VIDEO, PID_AUDIO]);
    await this.tables();
  }

  async writeVideo(videoBytes, { videoExtract = null } = {}) {
    const v = videoExtract || extractPesFromTs(videoBytes, 'video');
    if (!v.pes.length) throw new Error('Keine Video-PES-Pakete im MPEG-TS-Segment gefunden.');
    const videoType = v.pes[0]?.type || this.videoType || 0x1b;
    await this.init(videoType, this.audioType || 0x0f);
    await this.writeEntries(v.pes);
    return { videoPes: v.pes.length, audioPes: 0, bytesWritten: this.bytesWritten, videoType, audioType: this.audioType };
  }

  async writePair(videoBytes, audioBytes, { audioStartPts = null, videoExtract = null } = {}) {
    const v = videoExtract || extractPesFromTs(videoBytes, 'video');
    if (!v.pes.length) throw new Error('Keine Video-PES-Pakete im MPEG-TS-Segment gefunden.');
    let audioPes, audioType = 0x0f;
    if (isMpegTs(audioBytes)) {
      const a = extractPesFromTs(audioBytes, 'audio');
      audioPes = a.pes;
      audioType = audioPes[0]?.type || 0x0f;
      if (!audioPes.length) throw new Error('Keine Audio-PES-Pakete im separaten MPEG-TS-Audiosegment gefunden.');
    } else if (isAdts(audioBytes)) {
      const start = Number.isFinite(audioStartPts) ? audioStartPts : (v.pes.find(x=>Number.isFinite(x.pts))?.pts || 0);
      audioPes = aacPesFromAdts(audioBytes, start);
      audioType = 0x0f;
    } else throw new Error('Separate Audiospur ist weder MPEG-TS noch AAC/ADTS.');

    const videoType = v.pes[0]?.type || 0x1b;
    await this.init(videoType, audioType);
    await this.writeEntries([...v.pes, ...audioPes]);
    return { videoPes: v.pes.length, audioPes: audioPes.length, bytesWritten: this.bytesWritten, videoType, audioType };
  }
}

export async function muxTsBuffers(videoBytes, audioBytes, { audioStartPts = null } = {}) {
  const chunks = []; const writer = { write: async b => chunks.push(b.slice ? b.slice() : new Uint8Array(b)) };
  const muxer = new TsMuxer(writer); await muxer.writePair(videoBytes,audioBytes,{audioStartPts}); await muxer.flush(); return concat(chunks);
}
