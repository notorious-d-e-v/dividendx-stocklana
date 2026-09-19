import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test, type Page, type Route } from '@playwright/test';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { DIVIDENDX_PROGRAM_ID } from '@dividendx/transaction-sdk';
import { submitAndConfirmOverHttp, validateWalletSignedTransaction } from '../src/wallet/chain';
import { DEVNET_GENESIS_HASH, hostedRuntimeConfig, validateManifestShape } from '../src/wallet/runtime';
import { changeHostedSession, SESSION_MUTATION_TIMEOUT_MS, SESSION_READ_TIMEOUT_MS } from '../src/hosted/session';
import { DEMO_ASSETS } from '../../../packages/guided-runtime/src/contract';

// These mocked contracts verify browser enforcement only. They are not custody, provider, or onchain proof.

const port = 4195;
const origin = `http://127.0.0.1:${port}`;
const sessionId = '0123456789abcdef0123456789abcdef';
const replacementId = 'abcdef0123456789abcdef0123456789';
const runtimeId = 'hosted-guided-runtime-test';
const expiresAt = '2099-09-18T12:00:00.000Z';
let server: ChildProcess | undefined;

function session(status: 'none' | 'starting' | 'ready' | 'expired' | 'failed', overrides: Record<string, unknown> = {}) {
  const identified = status !== 'none';
  return {
    schemaVersion: 1,
    kind: 'guided',
    status,
    sessionId: identified ? sessionId : null,
    runtimeId: identified ? runtimeId : null,
    expiresAt: identified ? expiresAt : null,
    runtimeUrl: status === 'ready' ? `/api/sandbox/guided/${sessionId}` : null,
    error: null,
    ...overrides,
  };
}

function guidedState(status: 'idle' | 'ready' | 'complete' = 'idle', id = runtimeId) {
  return {
    schemaVersion: 4,
    runtimeId: id,
    revision: status === 'complete' ? 15 : 1,
    sessionId: status === 'idle' ? null : 'inner-guided-session',
    asset: status === 'idle' ? null : DEMO_ASSETS[0],
    status,
    activeStep: null,
    nextStep: status === 'ready' ? 'core-split' : null,
    completedSteps: status === 'complete' ? ['core-split', 'core-recombine-partial', 'core-recombine-rest', 'dividend-split', 'dividend-quarter-one', 'dividend-quarter-two', 'dividend-recombine', 'create-pool', 'add-liquidity', 'buy-dr', 'remove-liquidity', 'recombine', 'settle-year', 'redeem-buyer', 'redeem-provider'] : [],
    snapshot: null,
    transactions: [],
    error: null,
  };
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server?.exitCode !== null) throw new Error(`Hosted test server exited with ${server?.exitCode}.`);
    try { if ((await fetch(`${origin}/demos/`)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Hosted test server did not start.');
}

test.beforeAll(async () => {
  server = spawn('./node_modules/.bin/vite', ['--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(), env: { ...process.env, VITE_DIVIDENDX_HOSTED: '1' }, stdio: 'ignore',
  });
  await waitForServer();
});

test.afterAll(() => { server?.kill('SIGTERM'); });

test('session mutations use the provisioning deadline while reads stay short', async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const observed: number[] = [];
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: (milliseconds: number) => {
    observed.push(milliseconds);
    return new AbortController().signal;
  } });
  globalThis.fetch = async () => new Response(JSON.stringify(session('starting')), { status: 202, headers: { 'content-type': 'application/json' } });
  try {
    await changeHostedSession('guided', 'start', null);
    expect(observed).toEqual([SESSION_MUTATION_TIMEOUT_MS]);
    expect(SESSION_MUTATION_TIMEOUT_MS).toBeGreaterThan(SESSION_READ_TIMEOUT_MS);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: originalTimeout });
  }
});

test('hosted app route is pinned to the same-origin public devnet service', async ({ page }) => {
  let devnetReads = 0;
  let localhostReads = 0;
  await page.route(`${origin}/api/devnet/manifest`, (route) => { devnetReads += 1; return fulfill(route, { error: 'fixture unavailable' }, 503); });
  await page.route('http://127.0.0.1:4180/manifest', (route) => { localhostReads += 1; return fulfill(route, {}, 500); });
  await page.goto(`${origin}/app/`);
  await expect(page.getByTestId('runtime-error')).toContainText('devnet service');
  expect(devnetReads).toBeGreaterThan(0);
  expect(localhostReads).toBe(0);
});

test('a read-only empty session does not start compute', async ({ page }) => {
  let posts = 0;
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') posts += 1;
    return fulfill(route, session('none'));
  });
  await page.goto(`${origin}/demos/`);
  await expect(page.getByRole('heading', { name: 'Try DividendX in a private sandbox.' })).toBeVisible();
  await page.waitForTimeout(100);
  expect(posts).toBe(0);
});

test('explicit start sends the guarded contract and shows progress', async ({ page }) => {
  let body: unknown;
  let header: string | undefined;
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') {
      body = route.request().postDataJSON();
      header = route.request().headers()['x-dividendx-session'];
      return fulfill(route, session('starting'), 202);
    }
    return fulfill(route, session('none'));
  });
  await page.goto(`${origin}/demos/`);
  await page.getByRole('button', { name: 'Start private sandbox' }).click();
  await expect(page.getByRole('heading', { name: 'Starting your isolated test network…' })).toBeVisible();
  expect(body).toEqual({ action: 'start', expectedSessionId: null });
  expect(header).toBe('1');
});

test('an unknown start outcome is reconciled by a read without repeating the mutation', async ({ page }) => {
  let posts = 0;
  let started = false;
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') {
      posts += 1;
      started = true;
      return route.abort('connectionrefused');
    }
    return fulfill(route, started ? session('ready') : session('none'));
  });
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/state`, (route) => fulfill(route, guidedState()));
  await page.goto(`${origin}/demos/`);
  await page.getByRole('button', { name: 'Start private sandbox' }).click();
  await expect(page.getByTestId('prepare-guided-profile')).toBeVisible();
  expect(posts).toBe(1);
});

test('a delayed old poll cannot overwrite a reconciled replacement session', async ({ page }) => {
  let current = session('none');
  let reads = 0;
  let releaseOld!: () => void;
  const oldPollStarted = new Promise<void>((resolve) => { releaseOld = resolve; });
  let markOldStarted!: () => void;
  const sawOldPoll = new Promise<void>((resolve) => { markOldStarted = resolve; });
  await page.route(`${origin}/api/sandbox/guided/session`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { action: string };
      current = body.action === 'reset'
        ? session('ready', { sessionId: replacementId, runtimeId: 'replacement-runtime', runtimeUrl: `/api/sandbox/guided/${replacementId}` })
        : session('starting');
      return fulfill(route, current, current.status === 'starting' ? 202 : 200);
    }
    reads += 1;
    if (reads === 2) {
      markOldStarted();
      await oldPollStarted;
      return fulfill(route, session('starting'));
    }
    return fulfill(route, current);
  });
  await page.route(`${origin}/api/sandbox/guided/${replacementId}/state`, (route) => fulfill(route, { ...guidedState(), runtimeId: 'replacement-runtime' }));
  await page.goto(`${origin}/demos/`);
  await page.getByRole('button', { name: 'Start private sandbox' }).click();
  await sawOldPoll;
  await page.evaluate(async ({ id }) => {
    await fetch('/api/sandbox/guided/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DividendX-Session': '1' },
      body: JSON.stringify({ action: 'reset', expectedSessionId: id }),
    });
  }, { id: sessionId });
  await page.getByRole('button', { name: 'Check progress' }).click();
  await expect(page.getByTestId('prepare-guided-profile')).toBeVisible();
  releaseOld();
  await page.waitForTimeout(100);
  await expect(page.getByTestId('prepare-guided-profile')).toBeVisible();
});

test('ready session reconnects from its cookie without another broker mutation', async ({ page }) => {
  let posts = 0;
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') posts += 1;
    return fulfill(route, session('ready'));
  });
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/state`, (route) => fulfill(route, guidedState()));
  await page.goto(`${origin}/demos/`);
  await expect(page.getByTestId('prepare-guided-profile')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('prepare-guided-profile')).toBeVisible();
  expect(posts).toBe(0);
});

test('completed hosted journey resets the broker session and remounts on replacement', async ({ page }) => {
  let resetBody: unknown;
  let resets = 0;
  let current = session('ready');
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') {
      resets += 1;
      resetBody = route.request().postDataJSON();
      current = session('starting', { sessionId: replacementId, runtimeId: 'replacement-runtime' });
      return fulfill(route, current, 202);
    }
    return fulfill(route, current);
  });
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/state`, (route) => fulfill(route, guidedState('complete')));
  await page.route(`${origin}/api/sandbox/guided/${replacementId}/state`, (route) => fulfill(route, guidedState('idle', 'replacement-runtime')));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${origin}/demos/`);
  await page.getByRole('button', { name: 'Run the journey again' }).click();
  await expect(page.getByRole('heading', { name: 'Starting your isolated test network…' })).toBeVisible();
  expect(resetBody).toEqual({ action: 'reset', expectedSessionId: sessionId });
  current = session('ready', { sessionId: replacementId, runtimeId: 'replacement-runtime', runtimeUrl: `/api/sandbox/guided/${replacementId}` });
  await page.getByRole('button', { name: 'Check progress' }).click();
  await expect(page.getByTestId('prepare-guided-profile')).toBeVisible();
  await expect(page.locator('#core-heading')).toBeFocused();
  await expect(page.locator('#tour-core')).toBeInViewport();
  expect(await page.locator('#tour-core').evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(50);
  expect(resets).toBe(1);
});

test('expired session needs an explicit reset', async ({ page }) => {
  let posts = 0;
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') { posts += 1; return fulfill(route, session('starting'), 202); }
    return fulfill(route, session('expired'));
  });
  await page.goto(`${origin}/demos/`);
  await expect(page.getByRole('heading', { name: 'This sandbox has expired.' })).toBeVisible();
  expect(posts).toBe(0);
  await page.getByRole('button', { name: 'Start a fresh sandbox' }).click();
  expect(posts).toBe(1);
});

test('410 from a stale tab clears the guided transaction controls', async ({ page }) => {
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => fulfill(route, session('ready')));
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/state`, (route) => fulfill(route, { error: 'stale session' }, 410));
  await page.goto(`${origin}/demos/`);
  await expect(page.getByRole('heading', { name: 'This sandbox has expired.' })).toBeVisible();
  await expect(page.getByTestId('prepare-guided-profile')).toHaveCount(0);
});

test('wrong guided runtime identity is rejected', async ({ page }) => {
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => fulfill(route, session('ready')));
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/state`, (route) => fulfill(route, guidedState('idle', 'wrong-runtime')));
  await page.goto(`${origin}/demos/`);
  await expect(page.getByRole('alert')).toContainText('runtime ID does not match');
});

test('hosted session gate has no mobile overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => fulfill(route, session('none')));
  await page.goto(`${origin}/demos/`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('sandbox manifest binds nonce, runtime, RPC path, expiry, and non-public genesis', () => {
  const config = hostedRuntimeConfig({ sessionId, runtimeId: 'wallet-runtime', runtimeUrl: `/api/sandbox/wallet/${sessionId}`, expiresAt });
  const manifest = {
    schemaVersion: 1 as const, kind: 'surfnet' as const, rpcUrl: `/api/sandbox/wallet/${sessionId}/rpc`, genesisHash: 'private-genesis',
    programId: DIVIDENDX_PROGRAM_ID.toBase58(), deploymentDomainHex: '01'.repeat(32), runtimeId: 'wallet-runtime', clockControl: true,
    hostedSessionId: sessionId, expiresAt, assets: [{}],
  };
  expect(validateManifestShape(manifest, config).hostedSessionId).toBe(sessionId);
  expect(() => validateManifestShape({ ...manifest, hostedSessionId: replacementId }, config)).toThrow('session ID');
  expect(() => validateManifestShape({ ...manifest, rpcUrl: `/api/sandbox/wallet/${replacementId}/rpc` }, config)).toThrow('RPC path');
  expect(() => validateManifestShape({ ...manifest, genesisHash: DEVNET_GENESIS_HASH }, config)).toThrow('public Solana devnet genesis');
  expect(() => validateManifestShape({ ...manifest, wsUrl: 'ws://127.0.0.1:8899' }, config)).toThrow('WebSocket');
});

test('hosted confirmation polls HTTP status, never accepts processed, and never resends', async () => {
  let sends = 0;
  let statusReads = 0;
  const fake = {
    sendRawTransaction: async () => { sends += 1; return 'signature-http-only'; },
    getSignatureStatuses: async () => {
      statusReads += 1;
      return { value: [{ slot: statusReads, err: null, confirmationStatus: statusReads === 1 ? 'processed' : 'confirmed' }] };
    },
    getBlockHeight: async () => 10,
    confirmTransaction: async () => { throw new Error('WebSocket confirmation must not run'); },
  } as unknown as Connection;
  const transaction = new Transaction({ feePayer: PublicKey.default, recentBlockhash: PublicKey.default.toBase58() });
  transaction.lastValidBlockHeight = 20;
  transaction.serialize = (() => new Uint8Array([1, 2, 3])) as typeof transaction.serialize;
  const receipt = await submitAndConfirmOverHttp(fake, transaction, () => true, 2_000);
  expect(receipt.confirmationStatus).toBe('confirmed');
  expect(statusReads).toBe(2);
  expect(sends).toBe(1);
});

test('wallet serialization roundtrip keeps the exact blockhash validity context after message validation', () => {
  const unsigned = new Transaction({ feePayer: PublicKey.default, recentBlockhash: PublicKey.default.toBase58() });
  unsigned.lastValidBlockHeight = 42;
  const roundTripped = Transaction.from(unsigned.serialize({ requireAllSignatures: false, verifySignatures: false }));
  expect(roundTripped.lastValidBlockHeight).toBeUndefined();
  const validated = validateWalletSignedTransaction(unsigned, roundTripped);
  expect(validated.lastValidBlockHeight).toBe(42);
  expect(validated.serializeMessage()).toEqual(unsigned.serializeMessage());
});
