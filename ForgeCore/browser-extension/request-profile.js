const OBSERVED_HEADER_ALLOWLIST = new Set([
  'referer', 'origin', 'accept', 'accept-language', 'cache-control', 'pragma'
]);

export function normalizeObservedHeaders(headers = []) {
  const out = {};
  for (const h of headers || []) {
    const name = String(h?.name || '').trim().toLowerCase();
    if (!OBSERVED_HEADER_ALLOWLIST.has(name)) continue;
    const value = String(h?.value || '').trim();
    if (!value || value.length > 2048) continue;
    out[name] = value;
  }
  return out;
}

export function profileFromObservedHeaders(headers = [], fallback = {}) {
  const h = normalizeObservedHeaders(headers);
  return {
    referer: h.referer || fallback.referer || '',
    origin: h.origin || fallback.origin || '',
    accept: h.accept || fallback.accept || '',
    acceptLanguage: h['accept-language'] || fallback.acceptLanguage || '',
    cacheControl: h['cache-control'] || fallback.cacheControl || '',
    pragma: h.pragma || fallback.pragma || ''
  };
}

export function cookieHeaderFromCookies(cookies = []) {
  const seen = new Set();
  const parts = [];
  for (const c of cookies || []) {
    const name = String(c?.name || '');
    if (!name || seen.has(name)) continue;
    seen.add(name);
    parts.push(`${name}=${String(c?.value ?? '')}`);
  }
  return parts.join('; ');
}

export function cacheModeForRequest({ attempt = 1, isManifest = false } = {}) {
  if (isManifest) return attempt <= 1 ? 'default' : 'reload';
  if (attempt <= 1) return 'force-cache';
  if (attempt === 2) return 'default';
  return 'reload';
}

export function buildRequestHeaderRule({ id, hostname, extensionId, profile = {}, cookieHeader = '' }) {
  const requestHeaders = [];
  const push = (header, value) => {
    const v = String(value || '').trim();
    if (v) requestHeaders.push({ header, operation: 'set', value: v });
  };
  push('Referer', profile.referer);
  push('Origin', profile.origin);
  if (/\*\//.test(String(profile.accept || ''))) push('Accept', profile.accept);
  push('Accept-Language', profile.acceptLanguage);
  if (cookieHeader) push('Cookie', cookieHeader);
  if (!requestHeaders.length) return null;
  return {
    id,
    priority: 100,
    action: { type: 'modifyHeaders', requestHeaders },
    condition: {
      requestDomains: [hostname],
      initiatorDomains: extensionId ? [extensionId] : undefined,
      resourceTypes: ['xmlhttprequest', 'other']
    }
  };
}

export function summarizeRequestProfile(profile = {}, cookieCount = 0) {
  const flags = [];
  if (profile.referer) flags.push('Referer');
  if (profile.origin) flags.push('Origin');
  if (profile.acceptLanguage) flags.push('Sprache');
  if (cookieCount > 0) flags.push(`${cookieCount} Session-Cookie${cookieCount === 1 ? '' : 's'}`);
  return flags;
}
