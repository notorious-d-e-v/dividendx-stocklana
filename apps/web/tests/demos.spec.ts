import { expect, test, type Page, type Route } from '@playwright/test';
import { DEMO_ASSETS, type DemoAsset, type DemoSnapshot, type DemoState, type DemoStep } from '../../../packages/guided-runtime/src/contract';

const runtimeId = 'runtime-browser-test';
const sessionId = 'session-browser-test';
const circleDevnetUsdcMint = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const order: DemoStep[] = ['core-split', 'core-recombine-partial', 'core-recombine-rest', 'dividend-split', 'dividend-quarter-one', 'dividend-quarter-two', 'dividend-recombine', 'create-pool', 'add-liquidity', 'buy-dr', 'remove-liquidity', 'recombine', 'settle-year', 'redeem-buyer', 'redeem-provider'];
const raw = (amount: number, decimals: number) => `${amount}${'0'.repeat(decimals)}`;
const bits = (value: number) => { const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, value); return view.getBigUint64(0).toString(); };

function snapshot(asset: DemoAsset = DEMO_ASSETS[0], stock = 0, pt = 0, dr = 0, multiplier = 1, eventCount = 0): DemoSnapshot {
  const provider = { address: 'Provider111111111111111111111111111111111', stockRaw: raw(stock, asset.decimals), ptRaw: raw(pt, asset.decimals), drRaw: raw(dr, asset.decimals), quoteRaw: '10000000', lpRaw: '0' };
  return {
    asset, observedAt: '2026-09-17T05:00:00.000Z', slot: 42, unixTimestamp: '1789621200',
    genesisHash: 'LocalGenesis11111111111111111111111111111', rpcUrl: 'http://127.0.0.1:8899',
    dividendXProgram: 'DividendX11111111111111111111111111111111', raydiumProgram: 'Raydium111111111111111111111111111111111',
    series: 'Series1111111111111111111111111111111111', year: 2027, phase: 'open', eventCount,
    stockDecimals: asset.decimals, claimDecimals: asset.decimals, quoteDecimals: 6, lpDecimals: 9,
    stockMultiplierBits: bits(multiplier),
    quoteAsset: { symbol: 'USDC', provenance: 'local-circle-devnet-clone', canonicalMint: circleDevnetUsdcMint },
    provider, buyer: { address: 'Buyer111111111111111111111111111111111111', stockRaw: '0', ptRaw: '0', drRaw: '0', quoteRaw: '1000000', lpRaw: '0' },
    mints: { stock: 'StockMint11111111111111111111111111111111', pt: 'PtMint111111111111111111111111111111111', dr: 'DrMint111111111111111111111111111111111', quote: circleDevnetUsdcMint, lp: null },
    pool: null, vaultRaw: raw(pt, asset.decimals), ptSupplyRaw: raw(pt, asset.decimals), drSupplyRaw: raw(dr, asset.decimals), backingVerified: true, swap: null,
  };
}

function state(overrides: Partial<DemoState> = {}): DemoState {
  return { schemaVersion: 4, runtimeId, revision: 1, sessionId: null, asset: null, status: 'idle', activeStep: null, nextStep: null, completedSteps: [], snapshot: null, transactions: [], error: null, ...overrides };
}

function ready(step: DemoStep, completedSteps: DemoStep[] = [], asset: DemoAsset = DEMO_ASSETS[0], view = snapshot(asset)): DemoState {
  return state({ revision: 2 + completedSteps.length, sessionId, asset, status: 'ready', nextStep: step, completedSteps, snapshot: view });
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockRuntime(page: Page, initial = state(), onStep?: (step: DemoStep, current: DemoState) => DemoState) {
  let current = initial;
  const calls: { starts: unknown[]; steps: DemoStep[] } = { starts: [], steps: [] };
  await page.route('http://127.0.0.1:4181/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/state') return fulfillJson(route, current);
    if (path === '/receipt') return fulfillJson(route, { schemaVersion: 4, sessionId: current.sessionId, provenance: 'browser fixture', transactions: current.transactions });
    if (path === '/start') {
      const request = route.request().postDataJSON() as { assetId: DemoAsset['id'] };
      calls.starts.push(request);
      const asset = DEMO_ASSETS.find((item) => item.id === request.assetId)!;
      const restarted = current.status === 'complete';
      current = { ...ready('core-split', [], asset, snapshot(asset, 100)), sessionId: restarted ? 'replacement-browser-session' : sessionId };
      return fulfillJson(route, { accepted: true }, 202);
    }
    if (path === '/step') {
      const request = route.request().postDataJSON() as { step: DemoStep };
      calls.steps.push(request.step);
      current = onStep ? onStep(request.step, current) : advance(request.step, current);
      return fulfillJson(route, { accepted: true }, 202);
    }
    return fulfillJson(route, { error: 'not found' }, 404);
  });
  return calls;
}

function advance(step: DemoStep, current: DemoState): DemoState {
  const asset = current.asset!;
  const index = order.indexOf(step);
  const nextStep = order[index + 1] ?? null;
  let stock = 40; let pt = 60; let dr = 60; let multiplier = 1.02; let events = 2;
  if (step === 'core-split' || step === 'dividend-split') { stock = 0; pt = 100; dr = 100; multiplier = 1; events = 0; }
  if (step === 'core-recombine-partial') { multiplier = 1; events = 0; }
  if (step === 'core-recombine-rest') { stock = 100; pt = 0; dr = 0; multiplier = 1; events = 0; }
  if (step === 'dividend-quarter-one') { stock = 0; pt = 100; dr = 100; multiplier = 1.01; events = 1; }
  if (step === 'dividend-quarter-two') { stock = 0; pt = 100; dr = 100; }
  if (step === 'settle-year' || step === 'redeem-buyer' || step === 'redeem-provider') { multiplier = 1.04; events = 4; }
  return state({
    revision: current.revision + 1, sessionId, asset, status: nextStep ? 'ready' : 'complete', nextStep,
    completedSteps: [...current.completedSteps, step], snapshot: snapshot(asset, stock, pt, dr, multiplier, events),
    transactions: [...current.transactions, { step, name: step, signature: `${step}-signature`, status: 'confirmed', slot: 42 + index }],
  });
}

const clickStep = async (page: Page, step: DemoStep) => { await page.locator(`[data-demo-step="${step}"]`).click(); await expect(page.locator(`[data-demo-step="${step}"]`)).toHaveCount(0); };

test('root and /demos/ serve the same guided landing and two-link navigation', async ({ page }) => {
  await mockRuntime(page);
  for (const path of ['/', '/demos/']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'One stock. Two separate tokens.' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link')).toHaveCount(2);
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Public Devnet' })).toHaveAttribute('href', '/app/');
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Guided Demos' })).toHaveAttribute('href', '/demos/');
    await expect(page.getByTestId('prepare-guided-profile')).toBeDisabled();
  }
});

test('hero scrolls without mutation; selected company starts funded and completes Part One', async ({ page }) => {
  const calls = await mockRuntime(page);
  await page.goto('/demos/');
  await expect(page.getByRole('heading', { name: 'One stock. Two separate tokens.' })).toBeVisible();
  await expect(page.locator('#tour-dividends .chapter-preview')).toContainText('Finish Part One');
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  await expect(page.locator('#tour-core')).toBeInViewport();
  expect(calls.starts).toHaveLength(0);
  await expect(page.getByTestId('prepare-guided-profile')).toBeDisabled();
  await page.getByRole('button', { name: /MU Micron Backpack\/Trek/ }).click();
  await expect(page.getByTestId('prepare-guided-profile')).toHaveText('Get 100 tokenized Micron');
  await page.getByTestId('prepare-guided-profile').click();
  await expect(page.locator('[data-demo-step="core-split"]')).toBeEnabled();
  expect(calls.starts).toEqual([{ runtimeId, expectedRevision: 1, assetId: 'backpack-test-mu' }]);
  await expect(page.getByTestId('wallet-provider')).toContainText('Micron');
  for (const step of order.slice(0, 3)) await clickStep(page, step);
  await expect(page.getByText('Part one complete.')).toBeVisible();
  await expect(page.getByRole('heading', { name: '100 stocks restored.' })).toBeVisible();
  await expect(page.locator('[data-demo-step="dividend-split"]')).toBeEnabled();
  await expect(page.locator('#tour-dividends #current-action-title')).toContainText('Micron');
  expect(calls.steps).toEqual(order.slice(0, 3));
  await page.getByTestId('continue-to-dividends').click();
  await expect(page.locator('#tour-dividends')).toBeInViewport();
});

test('running a completed local journey again returns focus and scroll to Part One once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const asset = DEMO_ASSETS[0];
  const calls = await mockRuntime(page, state({
    revision: 17, sessionId, asset, status: 'complete', completedSteps: order,
    snapshot: snapshot(asset, 40, 60, 0, 1.04, 4),
  }));
  await page.goto('/demos/');
  await page.getByRole('button', { name: 'Run the journey again' }).click();
  await expect(page.locator('[data-demo-step="core-split"]')).toBeEnabled();
  await expect(page.locator('#core-heading')).toBeFocused();
  await expect(page.locator('#tour-core')).toBeInViewport();
  expect(await page.locator('#tour-core').evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(50);
  expect(calls.starts).toHaveLength(1);
  expect(calls.steps).toHaveLength(0);
});

test('all three company profiles carry chosen ID and claim decimal precision', async ({ page }) => {
  const labels: Record<DemoAsset['id'], { symbol: string; issuer: string }> = {
    'xstocks-test-kox': { symbol: 'KOx', issuer: 'xStocks' },
    'backpack-test-mu': { symbol: 'MU', issuer: 'Backpack/Trek' },
    'ondo-test-ibm': { symbol: 'IBMon', issuer: 'Ondo' },
  };
  for (const asset of DEMO_ASSETS) {
    const calls = await mockRuntime(page);
    await page.goto('/demos/');
    await page.getByRole('button', { name: `${labels[asset.id].symbol} ${asset.company} ${labels[asset.id].issuer}` }).click();
    await page.getByTestId('prepare-guided-profile').click();
    await expect(page.getByText(`Stock holder wallet · ${labels[asset.id].symbol}`)).toBeVisible();
    expect(calls.starts[0]).toMatchObject({ assetId: asset.id });
    await expect(page.locator('.hero-stock')).toContainText(`${asset.company} (${labels[asset.id].symbol})`);
    await expect(page.getByTestId('wallet-provider').locator('.balance-list > div').filter({ hasText: asset.company }).locator('dd')).toHaveText('100');
    await expect(page.getByTestId('wallet-provider').locator('.balance-list > div').filter({ hasText: asset.company }).locator('dd')).toHaveAttribute('title', `${raw(100, asset.decimals)} raw units`);
    await page.unrouteAll();
  }
});

test('two dividend events change observed stock allocation but not DR count', async ({ page }) => {
  const completed = order.slice(0, 4);
  await mockRuntime(page, ready('dividend-quarter-one', completed, DEMO_ASSETS[0], snapshot(DEMO_ASSETS[0], 0, 100, 100)));
  await page.goto('/demos/');
  await clickStep(page, 'dividend-quarter-one');
  await expect(page.locator('#tour-dividends .action-result')).toContainText('101 stocks');
  await expect(page.getByTestId('wallet-provider').locator('.balance-list > div').filter({ hasText: 'Dividend rights' }).locator('dd')).toHaveText('100');
  await clickStep(page, 'dividend-quarter-two');
  await expect(page.locator('#tour-dividends .action-result')).toContainText('102 stocks');
  await expect(page.getByTestId('wallet-provider').locator('.balance-list > div').filter({ hasText: 'Dividend rights' }).locator('dd')).toHaveText('100');
});

test('dividend recombination displays 40.8 observed stocks and carries 60 claims into Part Three', async ({ page }) => {
  const completed = order.slice(0, 6);
  const calls = await mockRuntime(page, ready('dividend-recombine', completed, DEMO_ASSETS[0], snapshot(DEMO_ASSETS[0], 0, 100, 100, 1.02, 2)));
  await page.goto('/demos/');
  await clickStep(page, 'dividend-recombine');
  await expect(page.getByTestId('dividend-result-stock')).toHaveText('40.8');
  await expect(page.locator('#tour-dividends')).toContainText('60 PT and 60 DR');
  await expect(page.locator('[data-demo-step="create-pool"]')).toBeEnabled();
  await expect(page.locator('[data-demo-step="dividend-split"]')).toHaveCount(0);
  expect(calls.steps).toEqual(['dividend-recombine']);
  await page.getByTestId('continue-to-defi').click();
  await expect(page.locator('#tour-defi')).toBeInViewport();
});

test('after reload Part Three resumes at pool seed with two separate wallets', async ({ page }) => {
  const completed = order.slice(0, 7);
  const calls = await mockRuntime(page, ready('create-pool', completed, DEMO_ASSETS[0], snapshot(DEMO_ASSETS[0], 40, 60, 60, 1.02, 2)));
  await page.goto('/demos/');
  await page.reload();
  await expect(page.locator('[data-demo-step="create-pool"]')).toBeEnabled();
  await expect(page.getByTestId('wallet-provider')).toBeVisible();
  await expect(page.getByTestId('wallet-buyer')).toBeVisible();
  await expect(page.locator('#tour-defi')).toContainText('annual deposit cutoff has passed');
  expect(calls.starts).toHaveLength(0);
});

test('wallet changes link returns to the next action without forcing navigation', async ({ page }) => {
  await mockRuntime(page, ready('core-split', [], DEMO_ASSETS[0], snapshot(DEMO_ASSETS[0], 100)));
  await page.goto('/demos/');
  await clickStep(page, 'core-split');
  await page.getByRole('button', { name: 'See wallet changes' }).click();
  await expect(page.locator('#core-wallet')).toBeInViewport();
  await page.getByRole('button', { name: 'Return to next action' }).click();
  await expect(page.locator('[data-demo-step="core-recombine-partial"]')).toBeInViewport();
});

test('wallet cue runs once per new completion and leaves keyboard focus in place', async ({ page }) => {
  await mockRuntime(page, ready('core-split', [], DEMO_ASSETS[0], snapshot(DEMO_ASSETS[0], 100)));
  await page.goto('/demos/');
  await clickStep(page, 'core-split');
  const cue = page.getByRole('button', { name: 'See wallet changes' });
  await expect(cue).toHaveAttribute('data-wiggle', 'true');
  await cue.focus();
  await expect(cue).not.toHaveAttribute('data-wiggle', 'true');
  await expect(cue).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: 'See wallet changes' })).not.toHaveAttribute('data-wiggle', 'true');
});

test('reduced motion skips the wallet cue', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockRuntime(page, ready('core-split', [], DEMO_ASSETS[0], snapshot(DEMO_ASSETS[0], 100)));
  await page.goto('/demos/');
  await clickStep(page, 'core-split');
  await expect(page.getByRole('button', { name: 'See wallet changes' })).not.toHaveAttribute('data-wiggle', 'true');
});

test('withdrawal result uses observed USDC after a buyer trade and survives reload', async ({ page }) => {
  const asset = DEMO_ASSETS[0];
  const completed = order.slice(0, 10);
  const after = snapshot(asset, 40, 60, 54, 1.02, 2);
  after.provider.quoteRaw = '10999595';
  await mockRuntime(page, ready('remove-liquidity', completed, asset, snapshot(asset, 40, 60, 0, 1.02, 2)), (_step, current) => ({
    ...advance('remove-liquidity', current), snapshot: after,
  }));
  await page.goto('/demos/');
  await clickStep(page, 'remove-liquidity');
  await expect(page.locator('#tour-defi .action-result')).toContainText('10.999595 USDC—0.999595 USDC more than the 10 USDC supplied');
  await expect(page.locator('#tour-defi .action-result')).toContainText('pool share returns more USDC and fewer DR');
  await page.reload();
  await expect(page.locator('#tour-defi .action-result')).toContainText('10.999595 USDC—0.999595 USDC more than the 10 USDC supplied');
});

test('withdrawal below the supplied amount does not claim a gain', async ({ page }) => {
  const asset = DEMO_ASSETS[0];
  const after = snapshot(asset, 40, 60, 54, 1.02, 2);
  after.provider.quoteRaw = '9500000';
  await mockRuntime(page, ready('recombine', order.slice(0, 11), asset, after));
  await page.goto('/demos/');
  await expect(page.locator('#tour-defi .action-result')).toContainText('9.5 USDC—0.5 USDC less than the 10 USDC supplied');
});

test('stale response preserves partial receipt and never replays an action', async ({ page }) => {
  let current = ready('core-split', [], DEMO_ASSETS[0], snapshot(DEMO_ASSETS[0], 100));
  let stepCalls = 0;
  await page.route('http://127.0.0.1:4181/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/state') return fulfillJson(route, current);
    if (path === '/step') {
      stepCalls += 1;
      current = state({ ...current, revision: current.revision + 1, status: 'failed', activeStep: 'core-split', nextStep: null,
        error: 'Confirmation stopped after the first submitted transaction.', transactions: [{ step: 'core-split', name: 'Deposit stock', signature: 'partial-signature-123', status: 'submitted', slot: null }] });
      return fulfillJson(route, { error: 'Expected revision is stale.' }, 409);
    }
    if (path === '/receipt') return fulfillJson(route, { schemaVersion: 4, partial: true, signatures: ['partial-signature-123'] });
    return fulfillJson(route, {});
  });
  await page.goto('/demos/');
  await page.locator('[data-demo-step="core-split"]').click();
  await expect(page.getByRole('heading', { name: 'Keep the partial receipt, then start fresh.' })).toBeVisible();
  await page.getByText('Evidence & exact accounting').click();
  await expect(page.locator('.transaction-list code').filter({ hasText: 'partial-signature-123' })).toBeVisible();
  expect(stepCalls).toBe(1);
});

test('submitted step remains disabled while its outcome is pending', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let stepCalls = 0;
  const current = ready('core-split', [], DEMO_ASSETS[0], snapshot(DEMO_ASSETS[0], 100));
  await page.route('http://127.0.0.1:4181/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/state') return fulfillJson(route, current);
    if (path === '/step') { stepCalls += 1; await pending; return fulfillJson(route, { accepted: true }, 202); }
    return fulfillJson(route, { schemaVersion: 4 });
  });
  await page.goto('/demos/');
  const button = page.locator('[data-demo-step="core-split"]');
  await button.click();
  await expect(button).toBeDisabled();
  expect(stepCalls).toBe(1);
  release();
});

test('rejects prior runtime state without displaying wallet balances', async ({ page }) => {
  const legacy = { ...ready('core-split'), schemaVersion: 3, snapshot: { ...snapshot(), provider: { ...snapshot().provider, address: 'LegacyProvider111' } } };
  await page.route('http://127.0.0.1:4181/**', (route) => fulfillJson(route, legacy));
  await page.goto('/demos/');
  await expect(page.getByRole('heading', { name: 'The guided demo is unavailable.' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('requires guided runtime v4');
  await expect(page.getByText('LegacyProvider111', { exact: true })).toHaveCount(0);
});

test('unavailable runtime offers bounded manual recovery', async ({ page }) => {
  await page.route('http://127.0.0.1:4181/**', (route) => fulfillJson(route, { error: 'Guided runtime is offline.' }, 503));
  await page.goto('/demos/');
  await expect(page.getByRole('heading', { name: 'The guided demo is unavailable.' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Guided runtime is offline.');
  await page.getByRole('button', { name: 'Check runtime again' }).click();
  await expect(page.getByRole('button', { name: 'Check runtime again' })).toBeVisible();
});

test('mobile and reduced motion keep the tour usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const calls = await mockRuntime(page);
  await page.goto('/demos/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to demo' })).toBeFocused();
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  await expect(page.locator('#tour-core')).toBeInViewport();
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  expect(calls.starts).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
