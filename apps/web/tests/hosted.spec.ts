import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test, type Page, type Route } from '@playwright/test';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { DIVIDENDX_PROGRAM_ID } from '@dividendx/transaction-sdk';
import { submitAndConfirmOverHttp, validateWalletSignedTransaction } from '../src/wallet/chain';
import { DEVNET_GENESIS_HASH, hostedRuntimeConfig, validateManifestShape } from '../src/wallet/runtime';
import { changeHostedSession, SESSION_MUTATION_TIMEOUT_MS, SESSION_READ_TIMEOUT_MS } from '../src/hosted/session';
import { DEMO_ASSETS, type DemoState } from '../../../packages/guided-runtime/src/contract';

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

function guidedState(status: 'idle' | 'ready' | 'complete' = 'idle', id = runtimeId): DemoState {
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
  await expect(page.getByTestId('wallet-trigger')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Connect a wallet' })).toHaveCount(0);
  expect(devnetReads).toBeGreaterThan(0);
  expect(localhostReads).toBe(0);
});

test('root and demos show the tour and selector without starting compute or reading a runtime', async ({ page }) => {
  let posts = 0;
  let runtimeReads = 0;
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') posts += 1;
    return fulfill(route, session('none'));
  });
  await page.route('**/api/sandbox/guided/*/state', (route) => { runtimeReads += 1; return fulfill(route, guidedState()); });
  for (const path of ['/', '/demos/']) {
    await page.goto(`${origin}${path}`);
    await expect(page.getByRole('heading', { name: 'One stock. Two separate tokens.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choose a tokenized stock to follow.' })).toBeVisible();
    await expect(page.getByTestId('guided-sandbox-status')).toContainText('Private test sandbox');
    await expect(page.getByTestId('prepare-guided-profile')).toBeDisabled();
    await page.getByRole('button', { name: /MU Micron Backpack\/Trek/ }).click();
    await expect(page.getByTestId('prepare-guided-profile')).toHaveText('Get 100 tokenized Micron');
  }
  expect(posts).toBe(0);
  expect(runtimeReads).toBe(0);
});

test('hero starts one sandbox in the background and preserves a selected company', async ({ page }) => {
  let posts = 0;
  let starts = 0;
  let selected: unknown;
  let current = guidedState();
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') { posts += 1; return fulfill(route, session('ready'), 200); }
    return fulfill(route, posts ? session('ready') : session('none'));
  });
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/state')) return fulfill(route, current);
    if (path.endsWith('/start')) {
      starts += 1;
      selected = route.request().postDataJSON();
      current = { ...guidedState('ready'), revision: 2, asset: DEMO_ASSETS[1] };
      return fulfill(route, { accepted: true }, 202);
    }
    return fulfill(route, { error: 'not found' }, 404);
  });
  await page.goto(`${origin}/demos/`);
  await page.getByRole('button', { name: /MU Micron Backpack\/Trek/ }).click();
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  await expect(page.locator('#tour-core')).toBeInViewport();
  await expect(page.getByTestId('guided-sandbox-status')).toContainText('Sandbox ready.');
  expect(posts).toBe(1);
  expect(starts).toBe(0);
  await page.getByTestId('prepare-guided-profile').click();
  await expect(page.locator('[data-demo-step="core-split"]')).toBeVisible();
  expect(posts).toBe(1);
  expect(starts).toBe(1);
  expect(selected).toMatchObject({ assetId: 'backpack-test-mu', runtimeId });
});

test('direct Get 100 creates one sandbox and starts the selected IBM profile', async ({ page }) => {
  let posts = 0;
  let starts = 0;
  let submitted: unknown;
  let current = guidedState();
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') { posts += 1; return fulfill(route, session('ready')); }
    return fulfill(route, posts ? session('ready') : session('none'));
  });
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/**`, (route) => {
    if (route.request().url().endsWith('/state')) return fulfill(route, current);
    if (route.request().url().endsWith('/start')) {
      starts += 1;
      submitted = route.request().postDataJSON();
      current = { ...guidedState('ready'), revision: 2, asset: DEMO_ASSETS[2] };
      return fulfill(route, { accepted: true }, 202);
    }
    return fulfill(route, {}, 404);
  });
  await page.goto(`${origin}/demos/`);
  await page.getByRole('button', { name: /IBMon IBM Ondo/ }).click();
  expect(posts).toBe(0);
  await page.getByTestId('prepare-guided-profile').click();
  await expect(page.locator('[data-demo-step="core-split"]')).toBeVisible();
  expect(posts).toBe(1);
  expect(starts).toBe(1);
  expect(submitted).toMatchObject({ assetId: 'ondo-test-ibm', runtimeId });
});

test('a starting sandbox keeps one poll owner across both CTAs', async ({ page }) => {
  let posts = 0;
  let reads = 0;
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') { posts += 1; return fulfill(route, session('starting'), 202); }
    reads += 1;
    return fulfill(route, reads >= 4 ? session('ready') : posts ? session('starting') : session('none'));
  });
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/state`, (route) => fulfill(route, guidedState()));
  await page.goto(`${origin}/demos/`);
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  await expect(page.getByTestId('guided-sandbox-status')).toContainText('Starting your sandbox');
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  await expect(page.getByTestId('guided-sandbox-status')).toContainText('Sandbox ready.', { timeout: 15_000 });
  expect(posts).toBe(1);
  expect(reads).toBe(4);
});

test('direct Get 100 and rapid hero clicks singleflight sandbox and profile mutations', async ({ page }) => {
  let posts = 0;
  let starts = 0;
  let current = guidedState();
  await page.route(`${origin}/api/sandbox/guided/session`, async (route) => {
    if (route.request().method() === 'POST') {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 120));
      return fulfill(route, session('ready'));
    }
    return fulfill(route, posts ? session('ready') : session('none'));
  });
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/**`, (route) => {
    if (route.request().url().endsWith('/state')) return fulfill(route, current);
    if (route.request().url().endsWith('/start')) {
      starts += 1;
      current = { ...guidedState('ready'), revision: 2 };
      return fulfill(route, { accepted: true }, 202);
    }
    return fulfill(route, {}, 404);
  });
  await page.goto(`${origin}/demos/`);
  await page.getByRole('button', { name: /KOx Coca-Cola xStocks/ }).click();
  await page.evaluate(() => {
    const hero = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Start guided tour'));
    const profile = document.querySelector<HTMLButtonElement>('[data-testid="prepare-guided-profile"]');
    hero?.click(); hero?.click(); profile?.click(); profile?.click();
  });
  await expect(page.locator('[data-demo-step="core-split"]')).toBeVisible();
  expect(posts).toBe(1);
  expect(starts).toBe(1);
});

test('ready cookie resumes without broker POST and reload does not replay profile start', async ({ page }) => {
  let posts = 0;
  let starts = 0;
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') posts += 1;
    return fulfill(route, session('ready'));
  });
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/**`, (route) => {
    if (route.request().url().endsWith('/state')) return fulfill(route, guidedState('ready'));
    if (route.request().url().endsWith('/start')) starts += 1;
    return fulfill(route, {}, 404);
  });
  await page.goto(`${origin}/demos/`);
  await expect(page.locator('[data-demo-step="core-split"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-demo-step="core-split"]')).toBeVisible();
  expect(posts).toBe(0);
  expect(starts).toBe(0);
});

test('expired session offers inline reset and returns to Part One without profile replay', async ({ page }) => {
  let posts = 0;
  let starts = 0;
  let current = session('expired');
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') {
      posts += 1;
      expect(route.request().postDataJSON()).toEqual({ action: 'reset', expectedSessionId: sessionId });
      current = session('ready', { sessionId: replacementId, runtimeId: 'replacement-runtime', runtimeUrl: `/api/sandbox/guided/${replacementId}` });
    }
    return fulfill(route, current);
  });
  await page.route(`${origin}/api/sandbox/guided/${replacementId}/**`, (route) => {
    if (route.request().url().endsWith('/state')) return fulfill(route, guidedState('idle', 'replacement-runtime'));
    if (route.request().url().endsWith('/start')) starts += 1;
    return fulfill(route, {}, 404);
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${origin}/demos/`);
  await expect(page.getByRole('heading', { name: 'One stock. Two separate tokens.' })).toBeVisible();
  await expect(page.getByTestId('guided-sandbox-status')).toContainText('This sandbox expired.');
  expect(posts).toBe(0);
  await page.getByRole('button', { name: 'Start a fresh guided demo' }).click();
  await expect(page.getByTestId('guided-sandbox-status')).toContainText('Sandbox ready.');
  await expect(page.locator('#tour-core')).toBeInViewport();
  await expect(page.getByTestId('prepare-guided-profile')).toBeVisible();
  expect(posts).toBe(1);
  expect(starts).toBe(0);
});

test('capacity 429 stays inline and a later explicit click can retry', async ({ page }) => {
  let posts = 0;
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') {
      posts += 1;
      return posts === 1 ? fulfill(route, { error: 'All private sandboxes are busy.' }, 429) : fulfill(route, session('ready'));
    }
    return fulfill(route, posts > 1 ? session('ready') : session('none'));
  });
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/state`, (route) => fulfill(route, guidedState()));
  await page.goto(`${origin}/demos/`);
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  await expect(page.getByTestId('guided-sandbox-status')).toContainText('All private sandboxes are busy.');
  await expect(page.getByRole('heading', { name: 'Choose a tokenized stock to follow.' })).toBeVisible();
  expect(posts).toBe(1);
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  await expect(page.getByTestId('guided-sandbox-status')).toContainText('Sandbox ready.');
  expect(posts).toBe(2);
});

test('ambiguous start reconciles with GET and never repeats the POST', async ({ page }) => {
  let posts = 0;
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') { posts += 1; return route.abort('connectionrefused'); }
    return fulfill(route, posts ? session('ready') : session('none'));
  });
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/state`, (route) => fulfill(route, guidedState()));
  await page.goto(`${origin}/demos/`);
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  await expect(page.getByTestId('guided-sandbox-status')).toContainText('Sandbox ready.');
  expect(posts).toBe(1);
});

test('unreadable status after an ambiguous POST blocks another mutation until GET succeeds', async ({ page }) => {
  let posts = 0;
  let readable = false;
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') { posts += 1; return route.abort('connectionrefused'); }
    if (posts && !readable) return route.abort('connectionrefused');
    return fulfill(route, session('none'));
  });
  await page.goto(`${origin}/demos/`);
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  await expect(page.getByTestId('guided-sandbox-status')).toContainText('outcome is unknown');
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  expect(posts).toBe(1);
  readable = true;
  await page.getByRole('button', { name: 'Check sandbox status' }).click();
  await expect(page.getByTestId('guided-sandbox-status')).toContainText('Choose a company below');
});

test('stale 410 clears runtime controls but keeps the hero and reset inline', async ({ page }) => {
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => fulfill(route, session('ready')));
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/state`, (route) => fulfill(route, { error: 'stale session' }, 410));
  await page.goto(`${origin}/demos/`);
  await expect(page.getByRole('heading', { name: 'One stock. Two separate tokens.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a fresh guided demo' })).toBeVisible();
  await expect(page.locator('[data-demo-step]')).toHaveCount(0);
});

test('a delayed 410 from an old receipt cannot expire the replacement sandbox', async ({ page }) => {
  let current = session('ready');
  let release!: () => void;
  let sawOldReceipt!: () => void;
  const oldReceiptStarted = new Promise<void>((resolve) => { sawOldReceipt = resolve; });
  const oldReceiptReleased = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => {
    if (route.request().method() === 'POST') {
      current = session('ready', { sessionId: replacementId, runtimeId: 'replacement-runtime', runtimeUrl: `/api/sandbox/guided/${replacementId}` });
    }
    return fulfill(route, current);
  });
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/state`, (route) => fulfill(route, guidedState('complete')));
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/receipt`, async (route) => {
    sawOldReceipt();
    await oldReceiptReleased;
    return fulfill(route, { error: 'old session expired' }, 410);
  });
  await page.route(`${origin}/api/sandbox/guided/${replacementId}/state`, (route) => fulfill(route, guidedState('idle', 'replacement-runtime')));
  await page.goto(`${origin}/demos/`);
  await expect(page.getByRole('button', { name: 'Run the journey again' })).toBeVisible();
  await page.getByText('Evidence & exact accounting').click();
  await oldReceiptStarted;
  await page.getByRole('button', { name: 'Run the journey again' }).click();
  await expect(page.getByTestId('guided-sandbox-status')).toContainText('Sandbox ready.');
  release();
  await expect(page.getByTestId('prepare-guided-profile')).toBeVisible();
  await expect(page.getByTestId('guided-sandbox-status')).not.toContainText('expired');
});

test('wrong guided runtime identity is rejected inline', async ({ page }) => {
  await page.route(`${origin}/api/sandbox/guided/session`, (route) => fulfill(route, session('ready')));
  await page.route(`${origin}/api/sandbox/guided/${sessionId}/state`, (route) => fulfill(route, guidedState('idle', 'wrong-runtime')));
  await page.goto(`${origin}/demos/`);
  await expect(page.getByRole('heading', { name: 'One stock. Two separate tokens.' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('runtime ID does not match');
});

test('inline sandbox status has no mobile overflow', async ({ page }) => {
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
