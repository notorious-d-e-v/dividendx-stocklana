// Development-only bridge to our existing bounded public devnet faucet.
// No signer or service secret is loaded. All visitors of this local process
// share one upstream visitor, so public per-visitor/global budgets still apply.
const PUBLIC_ORIGIN = 'https://dividendx.payai.network';
const LOCAL_ORIGIN = 'http://127.0.0.1:4184';
const MAX_BODY = 2_048;

export function createDevnetReviewBridge({ fetchImpl = fetch } = {}) {
  let visitorCookie;
  let visitorRequest;
  let funding = false;
  async function upstream(path, options = {}) {
    const response = await fetchImpl(`${PUBLIC_ORIGIN}${path}`, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(options.method === 'POST' ? 45_000 : 10_000),
      headers: { accept: 'application/json', origin: PUBLIC_ORIGIN,
        ...(visitorCookie ? { cookie: visitorCookie } : {}), ...options.headers },
    });
    const cookie = response.headers.get('set-cookie');
    if (path.endsWith('/manifest') && cookie) {
      const match = cookie.match(/(?:^|,\s*)(__Host-dxv=[^;,\s]+)/);
      if (match) visitorCookie = match[1];
    }
    return response;
  }
  async function manifest() {
    // One first visit even when multiple browser tabs open simultaneously.
    if (!visitorCookie) {
      visitorRequest ??= upstream('/api/devnet/manifest').then(async (response) => ({ status: response.status, text: await response.text() })).finally(() => { visitorRequest = undefined; });
      return visitorRequest;
    }
    const response = await upstream('/api/devnet/manifest');
    return { status: response.status, text: await response.text() };
  }
  function reply(response, status, value) {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(typeof value === 'string' ? value : JSON.stringify(value));
  }
  return async function devnetReviewBridge(request, response, next) {
    if (!request.url?.startsWith('/api/devnet/')) return next();
    const fail = (status, message) => reply(response, status, { status: 'failed', signatures: [], message });
    const origin = request.headers.origin;
    if (request.headers.host !== '127.0.0.1:4184' || (origin && origin !== LOCAL_ORIGIN)
      || request.headers['sec-fetch-site'] === 'cross-site') return fail(403, 'Local review origin required.');
    const isManifest = request.method === 'GET' && request.url === '/api/devnet/manifest';
    const isFaucet = request.method === 'POST' && request.url === '/api/devnet/faucet';
    if (!isManifest && !isFaucet) return fail(404, 'Review route not found.');
    if (isFaucet && origin !== LOCAL_ORIGIN) return fail(403, 'Local review origin required.');
    try {
      if (isManifest) {
        const result = await manifest();
        return reply(response, result.status, result.text);
      }
      if (funding) return fail(429, 'A faucet request is already running. Wait for its result.');
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')) return fail(415, 'JSON required.');
      if (Number(request.headers['content-length'] ?? 0) > MAX_BODY) return fail(413, 'Request too large.');
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY) return fail(413, 'Request too large.');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return fail(400, 'Invalid JSON.'); }
      const wanted = ['assetId', 'genesisHash', 'owner', 'runtimeId'];
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).sort().join(',') !== wanted.join(',')
        || wanted.some((key) => typeof body[key] !== 'string' || body[key].length > 128)) return fail(400, 'Invalid faucet fields.');
      // Reserve synchronously before another request can begin an upstream call.
      funding = true;
      try {
        if (!visitorCookie) await manifest();
        if (!visitorCookie) return fail(503, 'Public faucet session unavailable.');
        const result = await upstream('/api/devnet/faucet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        return reply(response, result.status, await result.text());
      } finally { funding = false; }
    } catch {
      return fail(503, 'Public devnet service unavailable. Refresh balances before retrying a funding request.');
    }
  };
}
