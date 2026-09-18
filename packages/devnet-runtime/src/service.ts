import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { RegistryManifest } from './types.js';

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

export function createManifestServer(manifest: RegistryManifest): Server {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const result = routeManifestRequest(request.method ?? '', request.url ?? '', manifest);
    json(response, result.status, result.body);
  });
}

export function routeManifestRequest(method: string, url: string, manifest: RegistryManifest): { status: number; body: unknown } {
  if (method === 'GET' && url === '/manifest') return { status: 200, body: manifest };
  if (method === 'POST' && url === '/faucet') return {
    status: 403,
    body: { signatures: [], message: 'Public faucet is disabled; use the reviewed CLI test-funding command.' },
  };
  return { status: 404, body: { error: 'route not found' } };
}

export async function listen(server: Server, host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}
