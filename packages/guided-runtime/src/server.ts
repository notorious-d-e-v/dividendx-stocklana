import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { GuidedDemoRuntime } from './runtime.js';
import { DEMO_STEPS, HttpError } from './internal.js';

const HOST = '127.0.0.1';
const PORT = 4181;
const HOSTS = new Set(['127.0.0.1:4181', 'localhost:4181']);
const ORIGINS = new Set([
  'http://127.0.0.1:4174', 'http://localhost:4174',
  'http://127.0.0.1:4184', 'http://localhost:4184',
]);
const MAX_BODY_BYTES = 2_048;

function respond(response: ServerResponse, status: number, value: unknown, origin?: string): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store', vary: 'Origin',
    ...(origin ? { 'access-control-allow-origin': origin } : {}),
  });
  response.end(body);
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw new HttpError(415, 'content-type must be application/json');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'request body is too large');
    chunks.push(buffer);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'request body must be valid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'request body must be an object');
  return parsed as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) throw new HttpError(400, 'request fields do not match the endpoint contract');
}

function mutationHeaders(request: IncomingMessage): string {
  const origin = request.headers.origin;
  if (!origin || !ORIGINS.has(origin)) throw new HttpError(403, 'origin is not allowed');
  if (request.headers['x-dividendx-demo'] !== '1') throw new HttpError(403, 'missing demo mutation header');
  return origin;
}

export async function startGuidedServer(): Promise<{ runtime: GuidedDemoRuntime; close: () => Promise<void> }> {
  const runtime = new GuidedDemoRuntime();
  let mutationTail = Promise.resolve();
  const serialize = async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationTail.then(operation, operation);
    mutationTail = result.then(() => undefined, () => undefined);
    return result;
  };
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    try {
      if (!HOSTS.has(request.headers.host ?? '')) throw new HttpError(403, 'invalid Host header');
      if (origin && !ORIGINS.has(origin)) throw new HttpError(403, 'origin is not allowed');
      const path = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname;
      if (request.method === 'OPTIONS') {
        if (!origin || !ORIGINS.has(origin)) throw new HttpError(403, 'origin is not allowed');
        response.writeHead(204, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, x-dividendx-demo', vary: 'Origin', 'cache-control': 'no-store' });
        response.end();
        return;
      }
      if (request.method === 'GET' && path === '/state') { respond(response, 200, runtime.publicState(), origin); return; }
      if (request.method === 'GET' && path === '/receipt') {
        const receipt = runtime.publicReceipt();
        if (!receipt) throw new HttpError(404, 'no guided demo receipt is available');
        respond(response, 200, receipt, origin);
        return;
      }
      if (request.method === 'POST' && path === '/start') {
        const allowedOrigin = mutationHeaders(request);
        const value = await body(request);
        exactKeys(value, ['runtimeId', 'expectedRevision']);
        if (typeof value.runtimeId !== 'string' || !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 0) throw new HttpError(400, 'invalid start request');
        await serialize(() => runtime.beginStart(value.runtimeId as string, Number(value.expectedRevision)));
        respond(response, 202, runtime.publicState(), allowedOrigin);
        return;
      }
      if (request.method === 'POST' && path === '/step') {
        const allowedOrigin = mutationHeaders(request);
        const value = await body(request);
        exactKeys(value, ['runtimeId', 'sessionId', 'expectedRevision', 'step']);
        if (typeof value.runtimeId !== 'string' || typeof value.sessionId !== 'string'
          || !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 0
          || typeof value.step !== 'string' || !DEMO_STEPS.includes(value.step as never)) throw new HttpError(400, 'invalid step request');
        await serialize(() => runtime.beginStep(value.runtimeId as string, value.sessionId as string,
          Number(value.expectedRevision), value.step as (typeof DEMO_STEPS)[number]));
        respond(response, 202, runtime.publicState(), allowedOrigin);
        return;
      }
      throw new HttpError(404, 'route not found');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : 'internal error';
      respond(response, status, { error: status === 500 ? 'internal runtime error' : message }, origin && ORIGINS.has(origin) ? origin : undefined);
    }
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(PORT, HOST, resolveListen);
  });
  const close = async () => {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    runtime.stop();
  };
  return { runtime, close };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const active = await startGuidedServer();
  process.stdout.write(`DividendX guided runtime ready at http://${HOST}:${PORT} (runtime ${active.runtime.publicState().runtimeId})\n`);
  const shutdown = () => { void active.close().finally(() => process.exit(0)); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
