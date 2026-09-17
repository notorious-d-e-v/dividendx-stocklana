import { expect, test, type Page, type Route } from '@playwright/test';
import type { DemoSnapshot, DemoState, DemoStep } from '../../../packages/guided-runtime/src/contract';

const runtimeId = 'runtime-browser-test';
const sessionId = 'session-browser-test';

const snapshot: DemoSnapshot = {
  observedAt: '2026-09-17T05:00:00.000Z',
  slot: 42,
  unixTimestamp: '1789621200',
  genesisHash: 'LocalGenesis11111111111111111111111111111',
  rpcUrl: 'http://127.0.0.1:8899',
  dividendXProgram: 'DividendX11111111111111111111111111111111',
  raydiumProgram: 'Raydium111111111111111111111111111111111',
  series: 'Series1111111111111111111111111111111111',
  year: 2027,
  phase: 'open',
  eventCount: 0,
  stockDecimals: 8,
  quoteDecimals: 6,
  lpDecimals: 9,
  stockMultiplierBits: '4607182418800017408',
  provider: { address: 'Provider111111111111111111111111111111111', stockRaw: '0', ptRaw: '10000000000', drRaw: '10000000000', quoteRaw: '800000000', lpRaw: '1500000000' },
  buyer: { address: 'Buyer111111111111111111111111111111111111', stockRaw: '0', ptRaw: '0', drRaw: '0', quoteRaw: '1000000000', lpRaw: '0' },
  mints: { stock: 'StockMint11111111111111111111111111111111', pt: 'PtMint111111111111111111111111111111111', dr: 'DrMint111111111111111111111111111111111', quote: 'QuoteMint1111111111111111111111111111111', lp: 'LpMint111111111111111111111111111111111' },
  pool: { address: 'Pool1111111111111111111111111111111111', drRaw: '4000000000', quoteRaw: '80000000', lockedLpRaw: '100' },
  vaultRaw: '10000000000',
  ptSupplyRaw: '10000000000',
  drSupplyRaw: '10000000000',
  backingVerified: true,
  swap: null,
};

function demoState(overrides: Partial<DemoState> = {}): DemoState {
  return {
    schemaVersion: 1,
    runtimeId,
    revision: 2,
    sessionId,
    status: 'ready',
    activeStep: null,
    nextStep: 'split',
    completedSteps: [],
    snapshot,
    transactions: [{ step: 'setup', name: 'Prepare local demo', signature: 'setup-signature-111111111111111111111111', status: 'confirmed', slot: 41 }],
    error: null,
    ...overrides,
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockRuntime(page: Page, initial: DemoState, onStep?: (step: DemoStep, current: DemoState) => DemoState) {
  let current = initial;
  const calls = { start: 0, step: 0 };
  await page.route('http://127.0.0.1:4181/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/state') return fulfillJson(route, current);
    if (url.pathname === '/receipt') return fulfillJson(route, { sessionId: current.sessionId, provenance: 'browser fixture', transactions: current.transactions });
    if (url.pathname === '/start') {
      calls.start += 1;
      current = demoState();
      return fulfillJson(route, { accepted: true }, 202);
    }
    if (url.pathname === '/step') {
      calls.step += 1;
      const request = route.request().postDataJSON() as { step: DemoStep };
      current = onStep ? onStep(request.step, current) : current;
      return fulfillJson(route, { accepted: true }, 202);
    }
    return fulfillJson(route, { error: 'not found' }, 404);
  });
  return calls;
}

test('prepares the two actors and advances one guarded real-state action', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const idle = demoState({ revision: 1, sessionId: null, status: 'idle', nextStep: null, snapshot: null, transactions: [] });
  const calls = await mockRuntime(page, idle, (step) => demoState({
    revision: 3,
    nextStep: 'create-pool',
    completedSteps: [step],
    transactions: [
      { step: 'setup', name: 'Prepare local demo', signature: 'setup-signature', status: 'confirmed', slot: 41 },
      { step, name: 'Split test stock', signature: 'split-signature', status: 'confirmed', slot: 42 },
    ],
  }));

  await page.goto('/demos/');
  await expect(page.getByRole('heading', { name: 'Sell dividend rights through a market.' })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare demo wallets' }).click();
  await expect(page.getByRole('button', { name: 'Split 100 test stock' })).toBeEnabled();
  await expect(page.getByTestId('wallet-provider')).toContainText('100');
  await expect(page.getByTestId('wallet-provider')).toContainText('Signs current action');
  await expect(page.getByTestId('wallet-buyer')).toContainText('Server-managed test wallet');

  await page.getByRole('button', { name: 'Split 100 test stock' }).click();
  await expect(page.getByRole('button', { name: 'Open market · 40 DR + 80 quote' })).toBeEnabled();
  await expect(page.getByText('Complete', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'apps/web/qa/guided-demo-1440.png', fullPage: true });
  expect(calls).toEqual({ start: 1, step: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('refreshes a stale action without replay and preserves partial failure receipts', async ({ page }) => {
  let state = demoState();
  let stepCalls = 0;
  await page.route('http://127.0.0.1:4181/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/state') return fulfillJson(route, state);
    if (path === '/step') {
      stepCalls += 1;
      state = demoState({
        revision: 3,
        status: 'failed',
        activeStep: 'split',
        nextStep: null,
        error: 'Confirmation stopped after the first submitted transaction.',
        transactions: [{ step: 'split', name: 'Deposit stock', signature: 'partial-signature-123', status: 'submitted', slot: null }],
      });
      return fulfillJson(route, { error: 'Expected revision is stale.' }, 409);
    }
    if (path === '/receipt') return fulfillJson(route, { partial: true, signatures: ['partial-signature-123'] });
    return fulfillJson(route, {});
  });

  await page.goto('/demos/');
  await page.getByRole('button', { name: 'Split 100 test stock' }).click();
  await expect(page.getByRole('heading', { name: 'Keep the partial receipt, then start fresh.' })).toBeVisible();
  await expect(page.getByText('Confirmation stopped after the first submitted transaction.')).toBeVisible();
  await page.getByText('Evidence & exact accounting').click();
  await expect(page.locator('.transaction-list code').filter({ hasText: 'partial-signature-123' })).toBeVisible();
  expect(stepCalls).toBe(1);
});

test('reload reconnects to the current server session', async ({ page }) => {
  await mockRuntime(page, demoState({
    revision: 8,
    nextStep: 'remove-liquidity',
    completedSteps: ['split', 'create-pool', 'add-liquidity', 'buy-dr'],
    snapshot: {
      ...snapshot,
      buyer: { ...snapshot.buyer, quoteRaw: '980000000', drRaw: '907024323' },
      swap: { inputQuoteRaw: '20000000', outputDrRaw: '907024323', minimumDrRaw: '897954079' },
    },
  }));
  await page.goto('/demos/');
  await expect(page.getByRole('button', { name: 'Withdraw all LP liquidity' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Withdraw all LP liquidity' })).toBeVisible();
  await expect(page.getByTestId('wallet-buyer')).toContainText('9.07024323');
  await page.getByText('Evidence & exact accounting').click();
  await expect(page.getByText('Enforced minimum DR')).toBeVisible();
});

test('shows a bounded unavailable-runtime recovery state', async ({ page }) => {
  await page.route('http://127.0.0.1:4181/**', (route) => fulfillJson(route, { error: 'Guided runtime is offline.' }, 503));
  await page.goto('/demos/');
  await expect(page.getByRole('heading', { name: 'The guided demo is unavailable.' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Guided runtime is offline.');
  await expect(page.getByText('npm run demo:guided')).toBeVisible();
  await page.getByRole('button', { name: 'Check runtime again' }).click();
  await expect(page.getByRole('button', { name: 'Check runtime again' })).toBeVisible();
});

test('mobile layout has no overflow and keeps keyboard focus visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockRuntime(page, demoState());
  await page.goto('/demos/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to demo' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Split 100 test stock' }).focus();
  await expect(page.getByRole('button', { name: 'Split 100 test stock' })).toBeFocused();
  await expect(page.getByTestId('wallet-provider')).toBeVisible();
  await expect(page.getByTestId('wallet-buyer')).toBeVisible();
  await page.screenshot({ path: 'apps/web/qa/guided-demo-390.png', fullPage: true });
});
