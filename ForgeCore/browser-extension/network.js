export function shouldRetryStatus(status) {
  const s = Number(status || 0);
  return s === 0 || s === 408 || s === 425 || s === 429 || (s >= 500 && s <= 599);
}

export function redactUrl(raw) {
  try {
    const u = new URL(String(raw || ''));
    const path = u.pathname.length > 90 ? `${u.pathname.slice(0, 87)}…` : u.pathname;
    return `${u.host}${path || '/'}`;
  } catch {
    return String(raw || '').replace(/[?#].*$/, '').slice(0, 120);
  }
}

export function tokenHint(raw) {
  try {
    const u = new URL(String(raw || ''));
    const names = [...u.searchParams.keys()].map(x => x.toLowerCase());
    return names.some(n => /^(token|sig|signature|expires?|exp|auth|key|policy|hdnts|hdnea)$/.test(n));
  } catch { return false; }
}

export function failureInfo({ url = '', status = 0, timedOut = false, permission = true, message = '', online = true } = {}) {
  const where = redactUrl(url);
  const s = Number(status || 0);
  const raw = String(message || '');
  if (!permission) return {
    code: 'HOST_PERMISSION', title: 'Host-Berechtigung fehlt', retryable: false,
    text: `StreamForge darf ${where} nicht abrufen. Prüfe unter chrome://extensions die Website-Berechtigung.`,
    suggestion: 'Website-Zugriff für StreamForge erlauben.'
  };
  if (!online) return {
    code: 'OFFLINE', title: 'Keine Netzwerkverbindung', retryable: true,
    text: `Der Browser meldet offline, während ${where} geladen werden sollte.`,
    suggestion: 'Internet/VPN-Verbindung prüfen und erneut versuchen.'
  };
  if (timedOut) return {
    code: 'TIMEOUT', title: 'Zeitüberschreitung', retryable: true,
    text: `Timeout bei ${where}. Der CDN-Server antwortet zu langsam oder die Verbindung wurde unterbrochen.`,
    suggestion: 'StreamForge reduziert automatisch die Parallelität und versucht es erneut.'
  };
  if (s === 401) return {
    code: 'HTTP_401', title: 'HTTP 401 – Sitzung abgelehnt', retryable: false,
    text: `HTTP 401 bei ${where}. Die aktuelle Anmeldung/Session wird nicht akzeptiert oder ist abgelaufen.`,
    suggestion: 'Seite/Player neu laden und mit einer gültigen Sitzung erneut versuchen.'
  };
  if (s === 403) return {
    code: 'HTTP_403', title: 'HTTP 403 – Zugriff abgelehnt', retryable: false,
    text: `HTTP 403 bei ${where}.${tokenHint(url) ? ' Die signierte URL bzw. ihr Token könnte abgelaufen sein.' : ' Session-, Referer- oder CDN-Regeln können die Ursache sein.'}`,
    suggestion: 'Seite/Player neu laden. StreamForge umgeht keine Zugriffssperren.'
  };
  if (s === 404 || s === 410) return {
    code: `HTTP_${s}`, title: `HTTP ${s} – Ressource nicht mehr verfügbar`, retryable: false,
    text: `HTTP ${s} bei ${where}. Playlist/Segment ist nicht mehr verfügbar oder die Stream-URL ist veraltet.`,
    suggestion: 'Player neu laden, damit die Website eine aktuelle Playlist erzeugt.'
  };
  if (s === 429) return {
    code: 'HTTP_429', title: 'HTTP 429 – CDN drosselt', retryable: true,
    text: `HTTP 429 bei ${where}. Der CDN-Server begrenzt die Anzahl/Rate der Anfragen.`,
    suggestion: 'StreamForge reduziert automatisch die Parallelität und wartet vor dem nächsten Versuch.'
  };
  if (s >= 500 && s <= 599) return {
    code: `HTTP_${s}`, title: `HTTP ${s} – Serverfehler`, retryable: true,
    text: `HTTP ${s} bei ${where}. Das ist typischerweise ein temporärer CDN-/Serverfehler.`,
    suggestion: 'Automatische Retries laufen; bei dauerhaftem Fehler später erneut versuchen.'
  };
  if (s) return {
    code: `HTTP_${s}`, title: `HTTP ${s}`, retryable: false,
    text: `HTTP ${s} bei ${where}.`, suggestion: 'Die Ressource ist für den Browser-Downloader derzeit nicht abrufbar.'
  };
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return {
    code: 'FETCH_FAILED', title: 'Netzwerkabruf fehlgeschlagen', retryable: true,
    text: `„Failed to fetch“ bei ${where}. Chrome liefert bei Netzwerk-/CORS-/VPN-/CDN-Abbrüchen häufig keinen genaueren HTTP-Status.`,
    suggestion: 'StreamForge versucht erneut, reduziert die Parallelität und zeigt bei einem späteren HTTP-Status die genauere Ursache.'
  };
  return {
    code: 'NETWORK_ERROR', title: 'Netzwerkfehler', retryable: true,
    text: `Netzwerkfehler bei ${where}${raw ? ` – ${raw}` : ''}.`,
    suggestion: 'Verbindung/VPN prüfen; StreamForge versucht temporäre Fehler automatisch erneut.'
  };
}

export function describeFetchFailure(args = {}) {
  return failureInfo(args).text;
}

export function formatDiagnostic(info, { label = '', attempt = 0, attempts = 0, concurrency = 0 } = {}) {
  const prefix = label ? `${label}: ` : '';
  const retry = attempt && attempts ? ` · Versuch ${attempt}/${attempts}` : '';
  const par = concurrency ? ` · Parallelität ${concurrency}` : '';
  return `${prefix}${info.title}${retry}${par}\n${info.text}${info.suggestion ? `\nHinweis: ${info.suggestion}` : ''}`;
}

export function backoffMs(attempt, retryAfterSeconds = 0) {
  if (Number(retryAfterSeconds) > 0) return Math.min(20000, Number(retryAfterSeconds) * 1000);
  const a = Math.max(1, Number(attempt || 1));
  return Math.min(10000, 500 * (2 ** (a - 1)));
}


export function reduceConcurrencyForFailure(current, { status = 0, timedOut = false, bodyInterrupted = false, min = 1 } = {}) {
  const floor = Math.max(1, Number(min || 1));
  const cur = Math.max(floor, Math.floor(Number(current || floor)));
  const s = Number(status || 0);
  if (cur <= floor) return floor;
  // 429 is explicit server-side rate limiting, so react strongly. Other
  // transient failures back off more gently to avoid a single bad segment
  // collapsing 8 -> 4 -> 2 -> 1 within a burst of concurrent requests.
  if (s === 429) return Math.max(floor, Math.floor(cur / 2));
  if (timedOut) return Math.max(floor, cur - (cur >= 6 ? 2 : 1));
  if (s >= 500 && s <= 599) return Math.max(floor, cur - (cur >= 6 ? 2 : 1));
  if (bodyInterrupted) return Math.max(floor, cur - 1);
  return Math.max(floor, cur - 1);
}

export function shouldApplyConcurrencyDecrease(lastDecreaseAt = 0, { now = Date.now(), status = 0, cooldownMs = 2500 } = {}) {
  // Debounce simultaneous failures from the same in-flight batch. 429 gets a
  // shorter cooldown because it is explicit server-side throttling, but it
  // still cannot collapse 8 -> 4 -> 2 -> 1 from several responses arriving
  // in the same moment.
  const base = Math.max(0, Number(cooldownMs || 0));
  const wait = Number(status || 0) === 429 ? Math.min(base, 750) : base;
  return Number(now) - Number(lastDecreaseAt || 0) >= wait;
}

export function reduceConcurrency(current, min = 1) {
  return Math.max(min, Math.floor(Math.max(min, Number(current || min)) / 2));
}

export function growConcurrency(current, max = 8) {
  return Math.min(max, Math.max(1, Number(current || 1)) + 1);
}

/**
 * Reads one ReadableStream chunk with an inactivity timeout. Fetch timeouts
 * normally stop once HTTP headers arrive; without this guard a CDN that stalls
 * mid-body can otherwise occupy one HLS worker forever.
 */
export function readWithInactivityTimeout(reader, timeoutMs = 20000) {
  const ms = Math.max(250, Number(timeoutMs || 20000));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const err = new Error(`Response body stalled for ${ms} ms`);
      err.name = 'TimeoutError';
      err.code = 'BODY_STALL_TIMEOUT';
      Promise.resolve().then(() => reader?.cancel?.(err)).catch(() => {}).finally(() => reject(err));
    }, ms);
    Promise.resolve().then(() => reader.read()).then(
      value => finish(resolve, value),
      error => finish(reject, error)
    );
  });
}
