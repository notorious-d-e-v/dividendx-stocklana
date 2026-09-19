#!/usr/bin/env node
/** Actual Chrome acceptance of one isolated guided-tour v4 session. Never retries a mutation. */
import assert from 'node:assert/strict';
import { open, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { chromium, expect } from '@playwright/test';

const PAGE_URL = 'http://127.0.0.1:4174/demos/';
const RUNTIME_URL = 'http://127.0.0.1:4181';
const ASSETS = Object.freeze({
  'xstocks-test-kox': { symbol: 'KOx', decimals: 8 },
  'backpack-test-mu': { symbol: 'MU', decimals: 6 },
  'ondo-test-ibm': { symbol: 'IBMon', decimals: 9 },
});
const STEPS = [
  'core-split', 'core-recombine-partial', 'core-recombine-rest',
  'dividend-split', 'dividend-quarter-one', 'dividend-quarter-two', 'dividend-recombine',
  'create-pool', 'add-liquidity', 'buy-dr', 'remove-liquidity', 'recombine',
  'settle-year', 'redeem-buyer', 'redeem-provider',
];
const BALANCE_KEYS = ['stockRaw', 'ptRaw', 'drRaw', 'quoteRaw', 'lpRaw'];
const WAIT_MS = 60_000;

function parseArgs(args) {
  let output;
  let asset = 'xstocks-test-kox';
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--output' && args[i + 1]) output = args[++i];
    else if (args[i] === '--asset' && args[i + 1]) asset = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  assert(output && isAbsolute(output) && output.endsWith('.json'), '--output must be an absolute .json path');
  assert(output.startsWith('/tmp/') || output.startsWith('/private/tmp/'), 'QA output must be under /tmp');
  assert(Object.hasOwn(ASSETS, asset), `--asset must be one of ${Object.keys(ASSETS).join(', ')}`);
  return { output, asset };
}

const options = parseArgs(process.argv.slice(2));
const screenshotBase = options.output.slice(0, -'.json'.length);
const report = {
  kind: 'actual-chrome-local-guided-tour-v4',
  generatedAt: new Date().toISOString(),
  pageUrl: PAGE_URL,
  runtimeUrl: RUNTIME_URL,
  selectedAssetId: options.asset,
  status: 'running',
  mutationRequests: [],
  checkpoints: [],
  screenshots: [],
  layout: [],
  browserErrors: [],
  browserWarnings: [],
  rpcStatuses: [],
};
let browser;
let desktop;
let mobile;

const screenshotPath = (phase, width) => `${screenshotBase}-${phase}-${width}.png`;
async function assertNew(path) {
  await assert.rejects(stat(path), { code: 'ENOENT' }, `Refusing to replace existing evidence: ${path}`);
}
async function persist() {
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
}
async function reserveEvidence() {
  await mkdir(dirname(options.output), { recursive: true });
  for (const phase of ['before', 'part-one', 'dividend', 'dividend-chapter', 'final']) {
    for (const width of [1440, 390]) await assertNew(screenshotPath(phase, width));
  }
  const file = await open(options.output, 'wx');
  try { await file.writeFile(`${JSON.stringify(report, null, 2)}\n`); }
  finally { await file.close(); }
}
function safeError(error) { return error instanceof Error ? error.message : String(error); }

async function readJson(url, label) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200, `${label} returned HTTP ${response.status}`);
  return response.json();
}
async function readState() {
  const state = await readJson(`${RUNTIME_URL}/state`, 'Guided state');
  assert.equal(state.schemaVersion, 4);
  assert.equal(typeof state.revision, 'number');
  if (state.snapshot) {
    assert.equal(state.snapshot.asset?.id, options.asset);
    assert.equal(state.snapshot.stockDecimals, ASSETS[options.asset].decimals);
    assert.equal(state.snapshot.claimDecimals, ASSETS[options.asset].decimals);
    assert.equal(state.snapshot.backingVerified, true, 'Runtime backing check failed');
  }
  return state;
}
async function waitForState(predicate, label) {
  const deadline = Date.now() + WAIT_MS;
  let last;
  while (Date.now() < deadline) {
    last = await readState();
    assert.notEqual(last.status, 'failed', `${label}: ${last.error ?? 'runtime failed'}`);
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`${label} did not reconcile in ${WAIT_MS / 1000}s; last state: ${JSON.stringify({ revision: last?.revision, status: last?.status, activeStep: last?.activeStep, nextStep: last?.nextStep, completedSteps: last?.completedSteps, error: last?.error })}`);
}
function units(amount) { return (BigInt(amount) * 10n ** BigInt(ASSETS[options.asset].decimals)).toString(); }
function stockMultiplier(bits) {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt(bits), false);
  const multiplier = view.getFloat64(0, false);
  assert(Number.isFinite(multiplier) && multiplier > 0, 'Invalid observed stock multiplier');
  return multiplier;
}
function coreBalances(state, stock, pt, dr, vault) {
  const s = state.snapshot;
  assert(s, 'Missing observed snapshot');
  assert.equal(s.provider.stockRaw, units(stock), 'holder stock');
  assert.equal(s.provider.ptRaw, units(pt), 'holder PT');
  assert.equal(s.provider.drRaw, units(dr), 'holder DR');
  assert.equal(s.vaultRaw, units(vault), 'vault stock');
  assert.equal(s.ptSupplyRaw, units(pt), 'PT supply');
  assert.equal(s.drSupplyRaw, units(dr), 'DR supply');
  assert.equal(s.buyer.stockRaw, '0');
  assert.equal(s.buyer.ptRaw, '0');
  assert.equal(s.buyer.drRaw, '0');
}
function captureState(state, label) {
  const checkpoint = { label, at: new Date().toISOString(), revision: state.revision, status: state.status,
    nextStep: state.nextStep, completedSteps: [...state.completedSteps], snapshot: state.snapshot,
    transactionCount: state.transactions.length };
  report.checkpoints.push(checkpoint);
}
async function verifyDisplayedBalances(page, state) {
  const holder = page.getByTestId('wallet-provider');
  await holder.waitFor({ state: 'visible' });
  for (const [index, key] of ['stockRaw', 'ptRaw', 'drRaw'].entries()) {
    await expect(holder.locator('.balance-list > div').nth(index).locator('dd'),
      `${key} did not reconcile in the browser`).toHaveAttribute('title',
      `${state.snapshot.provider[key]} raw units`, { timeout: 10_000 });
  }
}
async function verifyDividendStockDisplay(page, state) {
  const multiplier = stockMultiplier(state.snapshot.stockMultiplierBits);
  assert(Math.abs(multiplier - 1.02) < 1e-12, `Expected observed Q2 stock factor 1.02; got ${multiplier}`);
  assert.equal(state.snapshot.provider.stockRaw, units(40));
  const expected = Number(BigInt(state.snapshot.provider.stockRaw))
    / 10 ** state.snapshot.stockDecimals * multiplier;
  assert(Math.abs(expected - 40.8) < 1e-8, `Observed raw stock and multiplier give ${expected}, expected 40.8`);
  const result = page.getByTestId('dividend-result-stock');
  await result.waitFor({ state: 'visible' });
  const actualText = (await result.innerText()).trim();
  const actual = Number(actualText);
  assert(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8,
    `Displayed stock ${actualText} does not match observed raw stock × multiplier ${expected}`);
  return { raw: state.snapshot.provider.stockRaw, multiplierBits: state.snapshot.stockMultiplierBits,
    multiplier, expected, displayed: actualText };
}
async function checkLayout(page, phase, width) {
  const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth }));
  assert.equal(layout.viewport, width);
  assert(layout.document <= width + 1 && layout.body <= width + 1,
    `${phase} ${width}px overflow: ${JSON.stringify(layout)}`);
  report.layout.push({ phase, width, ...layout, overflow: false });
}
async function screenshot(page, phase, width) {
  const path = screenshotPath(phase, width);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  report.screenshots.push({ phase, width, path });
}
async function capturePair(phase) {
  for (const page of [desktop, mobile]) {
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  }
  await checkLayout(desktop, phase, 1440);
  await checkLayout(mobile, phase, 390);
  await screenshot(desktop, phase, 1440);
  await screenshot(mobile, phase, 390);
  if (phase === 'dividend') {
    for (const [page, width] of [[desktop, 1440], [mobile, 390]]) {
      const path = screenshotPath('dividend-chapter', width);
      await page.locator('#tour-dividends').screenshot({ path, animations: 'disabled' });
      report.screenshots.push({ phase: 'dividend-chapter', width, path });
    }
  }
  await persist();
}
async function syncMobile(state, label) {
  await mobile.reload({ waitUntil: 'domcontentloaded' });
  await mobile.getByRole('heading', { level: 1, name: /One tokenized stock/ }).waitFor();
  if (state.snapshot) await verifyDisplayedBalances(mobile, state);
  assert.equal((await readState()).sessionId, state.sessionId, `${label} mobile reload changed runtime session`);
}

function bindBrowserErrors(page, device) {
  page.on('pageerror', (error) => report.browserErrors.push({ device, type: 'pageerror', message: error.message }));
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    const entry = { device, type: message.type(), message: message.text() };
    // Chrome may report a software graphics fallback when rendering headlessly.
    if (/You have Reduced Motion enabled on your device\. Animations may not appear as expected/i.test(entry.message)) {
      report.browserWarnings.push({ ...entry, classification: 'expected-reduced-motion-notice' });
    } else if (/Automatic fallback to software WebGL|WebGL.*software fallback|SwiftShader/i.test(entry.message)) {
      report.browserWarnings.push({ ...entry, classification: 'harmless-native-fallback' });
    } else report.browserErrors.push(entry);
  });
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().startsWith(`${RUNTIME_URL}/`)) return;
    let body = null;
    try { body = request.postDataJSON(); } catch {}
    report.mutationRequests.push({ device, path: new URL(request.url()).pathname,
      step: typeof body?.step === 'string' ? body.step : null,
      assetId: typeof body?.assetId === 'string' ? body.assetId : null,
      expectedRevision: body?.expectedRevision ?? null });
  });
}

async function clickStep(step, before) {
  assert.equal(before.status, 'ready', `Cannot submit ${step} from ${before.status}`);
  assert.equal(before.nextStep, step);
  const button = desktop.locator(`button[data-demo-step="${step}"]`);
  await button.waitFor({ state: 'visible' });
  await expect(button, `${step} button disabled`).toBeEnabled({ timeout: 15_000 });
  const mutationsBefore = report.mutationRequests.length;
  await button.click(); // Exactly one browser click; a timeout never causes replay.
  const index = STEPS.indexOf(step);
  const state = await waitForState((current) => current.revision > before.revision
    && current.completedSteps.length === index + 1
    && current.completedSteps[index] === step
    && ['ready', 'complete'].includes(current.status), step);
  assert.deepEqual(state.completedSteps, STEPS.slice(0, index + 1));
  assert.equal(state.nextStep, STEPS[index + 1] ?? null);
  assert.equal(state.sessionId, before.sessionId);
  const submitted = report.mutationRequests.slice(mutationsBefore);
  assert.deepEqual(submitted.map(({ device, path, step: submittedStep }) => [device, path, submittedStep]),
    [['desktop', '/step', step]], `${step} submitted more than once or outside the desktop UI`);
  captureState(state, step);
  await persist();
  return state;
}

async function rpcStatuses(rpcUrl, transactions) {
  const url = new URL(rpcUrl);
  assert.equal(url.protocol, 'http:');
  assert(['127.0.0.1', 'localhost'].includes(url.hostname), 'RPC must be the isolated loopback chain');
  const signatures = transactions.map((entry) => entry.signature);
  assert(signatures.length > 0 && signatures.every((signature) => typeof signature === 'string' && signature.length > 40));
  assert.equal(new Set(signatures).size, signatures.length, 'Duplicate transaction signatures');
  let rpcId = 0;
  for (let offset = 0; offset < signatures.length; offset += 20) {
    const batch = signatures.slice(offset, offset + 20);
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'getSignatureStatuses',
        params: [batch, { searchTransactionHistory: true }] }), signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.error, undefined, `RPC error: ${JSON.stringify(body.error)}`);
    assert.equal(body.result?.value?.length, batch.length);
    for (let i = 0; i < batch.length; i += 1) {
      const status = body.result.value[i];
      assert(status, `Missing RPC signature ${batch[i]}`);
      assert.equal(status.err, null, `RPC signature ${batch[i]} failed`);
      assert(['confirmed', 'finalized'].includes(status.confirmationStatus), `RPC signature ${batch[i]} not confirmed`);
      report.rpcStatuses.push({ signature: batch[i], slot: status.slot, confirmationStatus: status.confirmationStatus,
        err: status.err });
    }
  }
}

await reserveEvidence();
try {
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'no-preference' });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  desktop = await desktopContext.newPage();
  mobile = await mobileContext.newPage();
  desktop.setDefaultTimeout(15_000);
  mobile.setDefaultTimeout(15_000);
  bindBrowserErrors(desktop, 'desktop');
  bindBrowserErrors(mobile, 'mobile');
  const initial = await readState();
  assert.equal(initial.status, 'idle', 'Use a fresh local guided runtime for this run');
  assert.equal(initial.sessionId, null);
  await Promise.all([desktop.goto(PAGE_URL, { waitUntil: 'domcontentloaded' }), mobile.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })]);
  await Promise.all([desktop.getByRole('heading', { level: 1, name: /One tokenized stock/ }).waitFor(),
    mobile.getByRole('heading', { level: 1, name: /One tokenized stock/ }).waitFor()]);
  assert.equal(await mobile.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  await desktop.getByTestId('prepare-guided-profile').waitFor();
  await mobile.getByTestId('prepare-guided-profile').waitFor();
  await desktop.keyboard.press('Tab');
  await expect(desktop.locator('.skip-link')).toBeFocused();
  report.keyboardSkipLinkReachable = true;
  await capturePair('before');

  const revisionBeforeHero = (await readState()).revision;
  const mutationCountBeforeHero = report.mutationRequests.length;
  await desktop.getByRole('button', { name: /Start guided tour/ }).click();
  await desktop.waitForFunction(() => scrollY > 0 && document.getElementById('tour-core')?.getBoundingClientRect().top < innerHeight);
  assert.equal((await readState()).revision, revisionBeforeHero, 'Hero entry changed runtime revision');
  assert.equal(report.mutationRequests.length, mutationCountBeforeHero, 'Hero entry submitted a mutation');
  report.heroScrollOnly = true;

  const profile = ASSETS[options.asset];
  const choice = desktop.locator('.asset-choices').getByRole('button', { name: new RegExp(profile.symbol) });
  await choice.click();
  assert.equal(await choice.getAttribute('aria-pressed'), 'true');
  assert.equal((await readState()).revision, revisionBeforeHero, 'Profile choice mutated runtime before prepare');
  const prepare = desktop.getByTestId('prepare-guided-profile');
  await expect(prepare).toBeEnabled({ timeout: 15_000 });
  await prepare.click();
  let state = await waitForState((current) => current.revision > initial.revision && current.status === 'ready'
    && current.nextStep === 'core-split' && current.snapshot?.asset?.id === options.asset, 'prepare profile');
  assert.equal(state.asset?.id, options.asset);
  assert(state.sessionId);
  assert.deepEqual(state.completedSteps, []);
  coreBalances(state, 100, 0, 0, 0);
  assert.equal(state.snapshot.eventCount, 0);
  assert.equal(state.snapshot.provider.lpRaw, '0');
  assert.equal(state.snapshot.buyer.lpRaw, '0');
  assert.equal(state.snapshot.pool, null);
  captureState(state, 'setup');
  assert.deepEqual(report.mutationRequests.map(({ device, path, assetId }) => [device, path, assetId]),
    [['desktop', '/start', options.asset]], 'Setup must be the only mutation so far');
  await verifyDisplayedBalances(desktop, state);

  state = await clickStep('core-split', state);
  coreBalances(state, 0, 100, 100, 100);
  await verifyDisplayedBalances(desktop, state);
  await syncMobile(state, 'part-one explanation');
  await capturePair('part-one');

  await desktop.reload({ waitUntil: 'domcontentloaded' });
  await desktop.locator('button[data-demo-step="core-recombine-partial"]').waitFor({ state: 'visible' });
  assert.equal(await desktop.getByTestId('prepare-guided-profile').count(), 0,
    'Reload returned the user to stock selection');
  assert.equal((await readState()).sessionId, state.sessionId);
  assert.equal((await readState()).revision, state.revision);
  report.reloadResumedCoreProgress = true;
  state = await clickStep('core-recombine-partial', state);
  coreBalances(state, 40, 60, 60, 60);
  state = await clickStep('core-recombine-rest', state);
  coreBalances(state, 100, 0, 0, 0);
  await desktop.getByRole('button', { name: /Continue to Part Two/ }).waitFor({ state: 'visible' });
  const revisionBeforeContinue = (await readState()).revision;
  const mutationsBeforeContinue = report.mutationRequests.length;
  const continueButton = desktop.getByTestId('continue-to-dividends');
  await continueButton.focus();
  await desktop.keyboard.press('Enter');
  await desktop.waitForFunction(() => document.getElementById('tour-dividends')?.getBoundingClientRect().top < innerHeight);
  assert.equal((await readState()).revision, revisionBeforeContinue, 'Part Two continuation changed runtime revision');
  assert.equal(report.mutationRequests.length, mutationsBeforeContinue, 'Part Two continuation submitted a mutation');
  report.partTwoContinuationScrollOnly = true;

  state = await clickStep('dividend-split', state);
  coreBalances(state, 0, 100, 100, 100);
  assert.equal(state.snapshot.eventCount, 0);
  state = await clickStep('dividend-quarter-one', state);
  coreBalances(state, 0, 100, 100, 100);
  assert.equal(state.snapshot.eventCount, 1);
  assert(Math.abs(stockMultiplier(state.snapshot.stockMultiplierBits) - 1.01) < 1e-12);
  const firstQuarterTime = BigInt(state.snapshot.unixTimestamp);
  state = await clickStep('dividend-quarter-two', state);
  coreBalances(state, 0, 100, 100, 100);
  assert.equal(state.snapshot.eventCount, 2);
  assert(Math.abs(stockMultiplier(state.snapshot.stockMultiplierBits) - 1.02) < 1e-12);
  const secondQuarterTime = BigInt(state.snapshot.unixTimestamp);
  assert(secondQuarterTime > firstQuarterTime, 'Quarter two must follow quarter one on the same chain');
  state = await clickStep('dividend-recombine', state);
  coreBalances(state, 40, 60, 60, 60);
  assert.equal(state.snapshot.eventCount, 2);
  await verifyDisplayedBalances(desktop, state);
  report.dividendStockDisplay = await verifyDividendStockDisplay(desktop, state);
  await syncMobile(state, 'dividend recombination');
  report.dividendMobileStockDisplay = await verifyDividendStockDisplay(mobile, state);
  await capturePair('dividend');

  const revisionBeforePartThree = (await readState()).revision;
  const mutationsBeforePartThree = report.mutationRequests.length;
  const partThreeButton = desktop.getByTestId('continue-to-defi');
  await partThreeButton.waitFor({ state: 'visible' });
  await partThreeButton.focus();
  await desktop.keyboard.press('Enter');
  await desktop.waitForFunction(() => document.getElementById('tour-defi')?.getBoundingClientRect().top < innerHeight);
  assert.equal((await readState()).revision, revisionBeforePartThree, 'Part Three continuation changed runtime revision');
  assert.equal(report.mutationRequests.length, mutationsBeforePartThree, 'Part Three continuation submitted a mutation');
  report.partThreeContinuationScrollOnly = true;

  state = await clickStep('create-pool', state);
  assert(state.snapshot.pool, 'Pool was not created');
  assert.equal(state.snapshot.provider.drRaw, units(36));
  assert.equal(state.snapshot.pool.drRaw, units(24));
  assert.equal(state.snapshot.pool.quoteRaw, '4000000');
  assert.equal(state.snapshot.provider.quoteRaw, '6000000');
  assert.equal(state.snapshot.eventCount, 2);
  state = await clickStep('add-liquidity', state);
  assert(state.snapshot.pool, 'Pool disappeared after adding liquidity');
  assert.equal(BigInt(state.snapshot.provider.drRaw) + BigInt(state.snapshot.pool.drRaw), BigInt(units(60)),
    'Native LP rounding must retain all 60 DR across holder and pool');
  assert.equal(state.snapshot.pool.quoteRaw, '10000000');
  assert.equal(state.snapshot.provider.quoteRaw, '0');
  assert.equal(state.snapshot.drSupplyRaw, units(60));
  for (const step of STEPS.slice(9)) state = await clickStep(step, state);
  assert.equal(state.status, 'complete');
  assert.deepEqual(state.completedSteps, STEPS);
  const final = state.snapshot;
  assert.equal(final.phase, 'finalized');
  assert.equal(final.eventCount, 4);
  assert(BigInt(final.unixTimestamp) > secondQuarterTime, 'Year-end must follow the two visible quarters');
  assert.equal(final.ptSupplyRaw, '0');
  assert.equal(final.provider.ptRaw, '0');
  assert.equal(final.buyer.ptRaw, '0');
  assert.equal(final.provider.drRaw, '0');
  assert.equal(final.buyer.drRaw, '0');
  assert.equal(final.provider.lpRaw, '0');
  assert(final.pool && BigInt(final.pool.drRaw) > 0n, 'Locked pool DR residue missing');
  assert(BigInt(final.pool.lockedLpRaw) > 0n, 'Locked pool LP missing');
  assert.equal(final.drSupplyRaw, final.pool.drRaw, 'Pool must hold all residual DR supply');
  assert.equal(final.backingVerified, true);
  assert.equal(state.transactions.length, 40, 'Expected all 40 v4 setup, pool and settlement transactions');
  assert(state.transactions.every(({ status }) => ['confirmed', 'finalized'].includes(status)));
  await rpcStatuses(final.rpcUrl, state.transactions);
  assert.equal(report.rpcStatuses.length, state.transactions.length);

  const receipt = await readJson(`${RUNTIME_URL}/receipt`, 'Guided receipt');
  assert.equal(receipt.schemaVersion, 4);
  assert.equal(receipt.asset?.id, options.asset);
  assert.equal(receipt.sessionId, state.sessionId);
  assert.equal(receipt.runtimeId, state.runtimeId);
  assert.equal(receipt.boundary, 'offline-local-circle-devnet-usdc-clone');
  assert.equal(receipt.failure, null);
  assert.deepEqual(receipt.checkpoints.map(({ step }) => step), ['setup', ...STEPS]);
  assert.deepEqual(receipt.checkpoints.filter(({ step }) => ['dividend-quarter-one', 'dividend-quarter-two', 'settle-year'].includes(step))
    .map(({ snapshot }) => snapshot.eventCount), [1, 2, 4]);
  assert.equal(receipt.transactions.length, state.transactions.length);
  assert.equal(receipt.capture.circleUsdc.decimals, 6);
  assert.equal(receipt.localFunding.publicFaucetTransfer, false);
  report.finalState = state;
  report.receipt = receipt; // The runtime's public receipt contains addresses and signatures, never signer material.

  await desktop.getByRole('heading', { name: 'The claims remained backed through trading and redemption.' }).waitFor();
  await syncMobile(state, 'final');
  await mobile.getByRole('heading', { name: 'The claims remained backed through trading and redemption.' }).waitFor();
  await capturePair('final');
  await desktop.getByText('Evidence & exact accounting', { exact: true }).click();
  assert.equal(await desktop.locator('.transaction-list article').count(), state.transactions.length);
  await desktop.locator('.receipt-record pre').waitFor();
  assert.equal(report.mutationRequests.length, STEPS.length + 1);
  assert.deepEqual(report.mutationRequests.map(({ step, path }) => path === '/start' ? 'setup' : step),
    ['setup', ...STEPS]);
  assert.equal(report.browserErrors.length, 0, `Browser errors: ${JSON.stringify(report.browserErrors)}`);
  report.status = 'passed';
  report.finishedAt = new Date().toISOString();
  await persist();
  process.stdout.write(`${JSON.stringify({ ok: true, asset: options.asset, output: options.output,
    screenshots: report.screenshots.map(({ path }) => path), transactions: state.transactions.length,
    rpcStatuses: report.rpcStatuses.length })}\n`);
} catch (error) {
  report.status = 'failed';
  report.finishedAt = new Date().toISOString();
  report.failure = safeError(error);
  try {
    if (desktop && !desktop.isClosed()) {
      const path = `${screenshotBase}-failure-1440.png`;
      await assertNew(path);
      await desktop.screenshot({ path, fullPage: true, animations: 'disabled' });
      report.screenshots.push({ phase: 'failure', width: 1440, path });
    }
  } catch (captureError) { report.failureCaptureError = safeError(captureError); }
  await persist();
  process.stderr.write(`Guided tour local review failed: ${report.failure}\nEvidence: ${options.output}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
