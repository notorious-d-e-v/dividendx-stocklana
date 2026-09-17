import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.DIVIDENDX_REVIEW_URL ?? 'http://127.0.0.1:4184';
assert.ok(['http://127.0.0.1:4184', 'http://127.0.0.1:4174'].includes(base));
const runtime = 'http://127.0.0.1:4181';
const steps = ['split', 'create-pool', 'add-liquidity', 'buy-dr', 'remove-liquidity', 'recombine', 'settle-year', 'redeem-buyer', 'redeem-provider'];
const balanceKeys = ['stockRaw', 'ptRaw', 'drRaw', 'quoteRaw', 'lpRaw'];
const errors = [];
const actions = [];
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});

async function readState() {
  const response = await fetch(`${runtime}/state`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200);
  return response.json();
}

async function waitForState(predicate) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const state = await readState();
    assert.notEqual(state.status, 'failed', state.error ?? 'guided runtime failed');
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Guided browser journey timed out.');
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().startsWith(`${runtime}/`)) {
      actions.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
    }
  });
  await page.goto(`${base}/demos/`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  const initial = await readState();
  assert.ok(['idle', 'complete', 'failed'].includes(initial.status), 'Use a fresh or finished guided session.');
  const button = page.locator('.current-action .demo-primary');
  await button.waitFor();
  await button.click();
  let state = await waitForState((value) => value.status === 'ready' && value.nextStep === 'split');
  const sessionId = state.sessionId;
  const checkpoints = [];

  async function verifyDisplayedBalances(value) {
    for (const role of ['provider', 'buyer']) {
      const expected = balanceKeys.map((key) => `${value.snapshot[role][key]} raw units`);
      const cells = page.getByTestId(`wallet-${role}`).locator('dd');
      const deadline = Date.now() + 15_000;
      let actual;
      do {
        actual = await cells.evaluateAll((elements) => elements.map((element) => element.getAttribute('title')));
        if (JSON.stringify(actual) === JSON.stringify(expected)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.deepEqual(actual, expected, `${role} displayed balances must match the completed chain snapshot`);
    }
    assert.equal(value.snapshot.backingVerified, true);
  }

  await verifyDisplayedBalances(state);
  await page.screenshot({ path: 'apps/web/qa/guided-demo-ready-1440.png', fullPage: true });
  for (const step of steps) {
    await button.click();
    state = await waitForState((value) => value.completedSteps.includes(step) && ['ready', 'complete'].includes(value.status));
    assert.equal(state.sessionId, sessionId);
    await verifyDisplayedBalances(state);
    checkpoints.push({ step, revision: state.revision, slot: state.snapshot.slot, transactions: state.transactions.length });
    if (step === 'buy-dr') {
      await page.reload();
      await verifyDisplayedBalances(state);
      assert.equal((await readState()).sessionId, sessionId, 'reload must preserve the runtime session');
    }
  }
  assert.equal(state.status, 'complete');
  assert.deepEqual(state.completedSteps, steps);
  assert.deepEqual(actions.map(({ path, body }) => path === '/start' ? 'setup' : body.step), ['setup', ...steps]);
  assert.ok(state.transactions.every(({ status }) => status === 'confirmed' || status === 'finalized'));
  await page.getByRole('heading', { name: 'The claims remained backed through trading and redemption.' }).waitFor();
  const layout = [];
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `No horizontal overflow at ${width}px`);
    layout.push({ width, overflow });
    if (width === 1440 || width === 390) await page.screenshot({ path: `apps/web/qa/guided-demo-complete-${width}.png`, fullPage: true });
  }
  await page.getByText('Evidence & exact accounting', { exact: true }).click();
  assert.equal(await page.locator('.transaction-list article').count(), state.transactions.length);
  assert.equal(await page.locator('.transaction-list a').count(), 0, 'Local signatures must not link to a public explorer');
  assert.deepEqual(errors, []);
  const evidence = { reviewedAt: new Date().toISOString(), baseUrl: base, kind: 'real-browser-local-transactions', sessionId,
    runtimeId: state.runtimeId, actions: actions.map(({ path, body }) => ({ path, step: body.step ?? 'setup' })),
    checkpoints, layout, pageErrors: errors, reloadPreservedSession: true, finalState: state,
    limits: ['Local chain, test assets and synthetic annual dividends; separate from public devnet proof.'] };
  await writeFile('planning/evidence/guided-demo-browser-2026-09-17.json', `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, sessionId, transactions: state.transactions.length, steps: steps.length, pageErrors: errors, layout }));
} finally {
  await browser.close();
}
