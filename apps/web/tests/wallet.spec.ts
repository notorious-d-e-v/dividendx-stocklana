import { expect, test, type Page } from '@playwright/test';
import { PublicKey } from '@solana/web3.js';
import { DIVIDENDX_IDL, DIVIDENDX_PROGRAM_ID, configPda } from '@dividendx/transaction-sdk';
import { formatStock, parseStockAmount } from '../src/wallet/amounts';
import { confirmedRuntimeSignatures } from '../src/wallet/chain';
import { createBoundedRpcFetch, createDevnetRpcFetch, createLocalConnection, RequestScheduler, resolveRuntimeConfig, RuntimeRequestError, runtimePost, validateManifestShape } from '../src/wallet/runtime';
import type { LocalManifest } from '../src/wallet/types';

const domain = new Uint8Array(32).fill(7);
const domainHex = Buffer.from(domain).toString('hex');
const configDiscriminator = Uint8Array.from(DIVIDENDX_IDL.accounts!.find((account) => account.name === 'Config')!.discriminator);
const configData = Buffer.concat([configDiscriminator, Buffer.alloc(32), Buffer.from(domain), Buffer.from([255])]).toString('base64');

function manifest(programId = DIVIDENDX_PROGRAM_ID.toBase58()) {
  return {
    schemaVersion: 1,
    kind: 'surfnet',
    rpcUrl: 'http://127.0.0.1:8899',
    genesisHash: 'local-genesis-test',
    programId,
    deploymentDomainHex: domainHex,
    runtimeId: 'browser-test-runtime',
    clockControl: false,
    assets: [{
      id: 'test-kox', company: 'Coca-Cola', symbol: 'TestKOx', issuerLabel: 'xStocks test profile', issuerIdHex: '01'.repeat(32), decimals: 8,
      collateralMint: PublicKey.default.toBase58(), assetPolicy: PublicKey.default.toBase58(),
      series: [{ year: 2027, address: PublicKey.default.toBase58(), accumulator: PublicKey.default.toBase58(), ptMint: PublicKey.default.toBase58(), drMint: PublicKey.default.toBase58(), vault: PublicKey.default.toBase58() }],
    }],
  };
}

async function mockReadyRpc(page: Page) {
  await page.route('http://127.0.0.1:8899/', async (route) => {
    const request = route.request().postDataJSON() as { id: number; method: string; params?: unknown[] } | { id: number; method: string; params?: unknown[] }[];
    const answer = (entry: { id: number; method: string; params?: unknown[] }) => {
      let result: unknown;
      if (entry.method === 'getGenesisHash') result = 'local-genesis-test';
      else if (entry.method === 'getAccountInfo') result = { context: { slot: 10 }, value: { data: ['', 'base64'], executable: true, lamports: 1, owner: 'BPFLoaderUpgradeab1e11111111111111111111111', rentEpoch: 0, space: 0 } };
      else if (entry.method === 'getMultipleAccounts') {
        const addresses = entry.params?.[0] as string[];
        const isConfig = addresses?.length === 1 && addresses[0] === configPda().address.toBase58();
        result = { context: { slot: 10 }, value: isConfig ? [{ data: [configData, 'base64'], executable: false, lamports: 1, owner: DIVIDENDX_PROGRAM_ID.toBase58(), rentEpoch: 0, space: 73 }] : addresses.map(() => null) };
      } else result = null;
      return { jsonrpc: '2.0', id: entry.id, result };
    };
    await route.fulfill({ json: Array.isArray(request) ? request.map(answer) : answer(request), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
}

async function mockReadyRuntime(page: Page) {
  await page.route('http://127.0.0.1:4180/manifest', (route) => route.fulfill({ json: manifest(), headers: { 'Access-Control-Allow-Origin': '*' } }));
  await mockReadyRpc(page);
}

function installTestWallet(page: Page, reject: boolean) {
  return page.addInitScript(({ rejectConnect }) => {
    window.addEventListener('wallet-standard:app-ready', ((event: Event) => {
      const account = { address: '11111111111111111111111111111111', publicKey: new Uint8Array(32), chains: ['solana:devnet'], features: ['solana:signTransaction'], label: 'Test account' };
      let change: ((properties: { accounts?: typeof account[] }) => void) | undefined;
      const wallet = {
        version: '1.0.0', name: rejectConnect ? 'Rejecting Wallet' : 'Test Wallet', icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains: ['solana:devnet'], accounts: [],
        features: {
          'standard:connect': { version: '1.0.0', connect: async () => { if (rejectConnect) throw new Error('User rejected wallet connection.'); return { accounts: [account] }; } },
          'standard:events': { version: '1.0.0', on: (_name: string, listener: typeof change) => { change = listener; return () => { change = undefined; }; } },
          'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'], signTransaction: async () => [] },
        },
      };
      (event as Event & { detail: { register: (wallet: unknown) => void } }).detail.register(wallet);
      Object.assign(window, {
        disconnectTestWallet: () => change?.({ accounts: [] }),
        mismatchTestWallet: () => change?.({ accounts: [{ ...account, publicKey: Uint8Array.from([...new Uint8Array(31), 1]) }] }),
      });
    }) as EventListener);
  }, { rejectConnect: reject });
}

test('failed runtime retries show progress, preserve feedback, and can recover', async ({ page }) => {
  let requestCount = 0;
  let shouldSucceed = false;
  let blockedRequest: Promise<void> | undefined;
  let finishFailedRetry!: () => void;
  const failedRetry = new Promise<void>((resolve) => { finishFailedRetry = resolve; });
  await mockReadyRpc(page);
  await page.route('http://127.0.0.1:4180/manifest', async (route) => {
    requestCount += 1;
    await blockedRequest;
    if (!shouldSucceed) {
      await route.fulfill({ status: 503, body: 'runtime unavailable', headers: { 'Access-Control-Allow-Origin': '*' } });
      return;
    }
    await route.fulfill({ json: manifest(), headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto('/app/');
  const gate = page.getByTestId('runtime-error');
  await expect(gate).toContainText('could not be verified');
  await expect(gate).toContainText('Runtime check failed');
  await expect(gate).toContainText('Local runtime returned HTTP 503.');
  await expect(gate).toContainText('Retry checks it again; it does not start the service.');
  await expect(gate.getByText('npm --prefix packages/local-runtime start')).toBeVisible();
  await expect(page.getByText('Your annual claims')).toHaveCount(0);

  blockedRequest = failedRetry;
  await gate.getByRole('button', { name: 'Retry localhost runtime' }).click();
  await expect(page.getByRole('heading', { name: 'Connecting to the local runtime…' })).toBeVisible();
  await expect(page.getByText('Verifying genesis, program and deployment identity.')).toBeVisible();
  finishFailedRetry();
  await expect(page.getByTestId('runtime-error')).toContainText('Local runtime returned HTTP 503.');

  blockedRequest = undefined;
  shouldSucceed = true;
  await page.getByRole('button', { name: 'Retry localhost runtime' }).click();
  await expect(page.getByRole('heading', { name: /Connect your wallet or create a test wallet/ })).toBeVisible();
  await expect(page.getByLabel('Verified runtime')).toContainText('Verified Local SBF sandbox');
  expect(requestCount).toBeGreaterThanOrEqual(3);
});

test('program identity mismatch is clear and never reaches a wallet prompt', async ({ page }) => {
  await page.route('http://127.0.0.1:4180/manifest', (route) => route.fulfill({ json: manifest(PublicKey.default.toBase58()), headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('/app/');
  await expect(page.getByTestId('runtime-error')).toContainText('program identity does not match');
  await expect(page.getByTestId('temporary-wallet')).toHaveCount(0);
});

test('Wallet Standard rejection and disconnect remain explicit', async ({ page }) => {
  await mockReadyRuntime(page);
  await installTestWallet(page, true);
  await page.goto('/app/');
  await page.getByRole('button', { name: 'Rejecting Wallet' }).click();
  await expect(page.getByRole('alert')).toContainText('User rejected wallet connection');

  await page.reload();
  await installTestWallet(page, false);
  await page.reload();
  await page.getByRole('button', { name: 'Test Wallet', exact: true }).click();
  await expect(page.getByText('Test Wallet', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as typeof window & { mismatchTestWallet: () => void }).mismatchTestWallet());
  await expect(page.getByRole('status')).toContainText('Wallet disconnected');
});

test('partial faucet errors retain receipt evidence and explain possible completion', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'faucet stopped', partial: true, signatures: ['confirmed-signature'] }), { status: 500, headers: { 'content-type': 'application/json' } });
  try {
    await expect(runtimePost(manifest() as LocalManifest, '/faucet', { owner: PublicKey.default.toBase58(), assetId: 'test-kox' })).rejects.toMatchObject({
      name: RuntimeRequestError.name,
      result: { partial: true, signatures: ['confirmed-signature'] },
      message: expect.stringContaining('Some faucet transactions may have completed'),
    });
  } finally { globalThis.fetch = originalFetch; }
});

test('runtime receipts reject processed-only signature status', async () => {
  const connection = {
    getSignatureStatuses: async () => ({ value: [{ slot: 12, err: null, confirmationStatus: 'processed' }] }),
  } as unknown as import('@solana/web3.js').Connection;
  await expect(confirmedRuntimeSignatures(connection, ['processed-signature'])).rejects.toThrow('not confirmed successfully');
});

test('local RPC transport times out and preserves caller aborts', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) reject(signal.reason);
    else signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  try {
    await expect(createBoundedRpcFetch(5)('http://127.0.0.1:8899', {})).rejects.toThrow('Local RPC request timed out');
    const caller = new AbortController();
    const pending = createBoundedRpcFetch(1_000)('http://127.0.0.1:8899', { signal: caller.signal });
    caller.abort(new Error('caller stopped'));
    await expect(pending).rejects.toThrow('caller stopped');
  } finally { globalThis.fetch = originalFetch; }
});

test('devnet RPC retries only transient responses with the identical request body', async () => {
  const originalFetch = globalThis.fetch;
  const bodies: (BodyInit | null | undefined)[] = [];
  const rejected: Response[] = [];
  let requestCount = 0;
  globalThis.fetch = async (_input, init) => {
    requestCount += 1;
    bodies.push(init?.body);
    if (requestCount < 3) {
      const response = new Response(`limited-${requestCount}`, { status: requestCount === 1 ? 429 : 503 });
      rejected.push(response);
      return response;
    }
    return new Response('{"jsonrpc":"2.0","result":"ok"}', { status: 200 });
  };
  try {
    const body = '{"jsonrpc":"2.0","method":"getGenesisHash"}';
    const recovered = await createDevnetRpcFetch(3_000, new RequestScheduler(2))('https://api.devnet.solana.com', { method: 'POST', body });
    expect(recovered.status).toBe(200);
    expect(requestCount).toBe(3);
    expect(bodies).toEqual([body, body, body]);
    expect(rejected.every((response) => response.bodyUsed)).toBe(true);

    requestCount = 0;
    globalThis.fetch = async () => { requestCount += 1; return new Response('bad request', { status: 400 }); };
    const notRetried = await createDevnetRpcFetch(1_000, new RequestScheduler(2))('https://api.devnet.solana.com', { method: 'POST', body });
    expect(notRetried.status).toBe(400);
    expect(requestCount).toBe(1);
  } finally { globalThis.fetch = originalFetch; }
});

test('devnet RPC bounds retry exhaustion and preserves caller aborts', async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => { requestCount += 1; return new Response('limited', { status: 429, headers: { 'Retry-After': '1' } }); };
  try {
    await expect(createDevnetRpcFetch(20, new RequestScheduler(2))('https://api.devnet.solana.com', { method: 'POST', body: '{}' })).rejects.toThrow('Devnet RPC request timed out');
    expect(requestCount).toBe(1);

    requestCount = 0;
    const caller = new AbortController();
    const pending = createDevnetRpcFetch(2_000, new RequestScheduler(2))('https://api.devnet.solana.com', { method: 'POST', body: '{}', signal: caller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    caller.abort(new Error('caller cancelled devnet request'));
    await expect(pending).rejects.toThrow('caller cancelled devnet request');
    expect(requestCount).toBe(1);

    requestCount = 0;
    globalThis.fetch = async () => { requestCount += 1; return new Response('still limited', { status: 503 }); };
    const exhausted = await createDevnetRpcFetch(5_000, new RequestScheduler(2))('https://api.devnet.solana.com', { method: 'POST', body: '{}' });
    expect(exhausted.status).toBe(503);
    expect(exhausted.bodyUsed).toBe(false);
    expect(requestCount).toBe(4);
  } finally { globalThis.fetch = originalFetch; }
});

test('devnet RPC scheduler paces shared connection starts and limits concurrency to two', async () => {
  const originalFetch = globalThis.fetch;
  let active = 0;
  let maximum = 0;
  const starts: number[] = [];
  globalThis.fetch = async () => {
    starts.push(Date.now());
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 900));
    active -= 1;
    return new Response('{}', { status: 200 });
  };
  try {
    const scheduler = new RequestScheduler(2, 400);
    const firstConnectionFetch = createDevnetRpcFetch(4_000, scheduler);
    const secondConnectionFetch = createDevnetRpcFetch(4_000, scheduler);
    await Promise.all([
      firstConnectionFetch('https://api.devnet.solana.com', {}),
      firstConnectionFetch('https://api.devnet.solana.com', {}),
      secondConnectionFetch('https://api.devnet.solana.com', {}),
      secondConnectionFetch('https://api.devnet.solana.com', {}),
    ]);
    expect(maximum).toBe(2);
    expect(starts).toHaveLength(4);
    for (let index = 1; index < starts.length; index += 1) expect(starts[index]! - starts[index - 1]!).toBeGreaterThanOrEqual(350);
  } finally { globalThis.fetch = originalFetch; }
});

test('devnet RPC scheduler holds queued requests through Retry-After cooldown', async () => {
  const originalFetch = globalThis.fetch;
  const starts: number[] = [];
  let requestCount = 0;
  globalThis.fetch = async () => {
    starts.push(Date.now());
    requestCount += 1;
    if (requestCount === 1) return new Response('limited', { status: 429, headers: { 'Retry-After': '1' } });
    return new Response('{}', { status: 200 });
  };
  try {
    const scheduler = new RequestScheduler(2, 400);
    const fetchRpc = createDevnetRpcFetch(4_000, scheduler);
    const responses = await Promise.all([
      fetchRpc('https://api.devnet.solana.com', { method: 'POST', body: '{}' }),
      fetchRpc('https://api.devnet.solana.com', { method: 'POST', body: '{}' }),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(starts).toHaveLength(3);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(900);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(350);
  } finally { globalThis.fetch = originalFetch; }
});

test('local manifest preserves a nonconsecutive explicit WebSocket endpoint', () => {
  const localConfig = resolveRuntimeConfig({ VITE_DIVIDENDX_NETWORK: 'local' });
  const withWebSocket = { ...manifest(), wsUrl: 'ws://127.0.0.1:54321' };
  expect(validateManifestShape(withWebSocket, localConfig).wsUrl).toBe('ws://127.0.0.1:54321');
  const connection = createLocalConnection(withWebSocket.rpcUrl, withWebSocket.wsUrl);
  expect((connection as unknown as { _rpcWsEndpoint: string })._rpcWsEndpoint).toBe('ws://127.0.0.1:54321/');
  expect(() => validateManifestShape({ ...withWebSocket, wsUrl: 'ws://localhost:54321' }, localConfig)).toThrow('RPC loopback hostname');
  expect(() => validateManifestShape({ ...withWebSocket, wsUrl: 'ws://127.0.0.1' }, localConfig)).toThrow('explicit valid port');
});

test('binary multiplier formatting stays exact for inputs, tiny positives and wide exit scales', () => {
  const bits = (value: number) => { const bytes = new ArrayBuffer(8); new DataView(bytes).setFloat64(0, value, true); return new DataView(bytes).getBigUint64(0, true); };
  expect(parseStockAmount('1', 8, bits(2))).toBe(50_000_000n);
  expect(formatStock(50_000_000n, 8, bits(2))).toBe('1');
  expect(formatStock(1n, 0, bits(2 ** 40))).toBe('1099511627776');
  expect(formatStock(1n, 9, bits(2 ** -40))).toMatch(/^</);
});
