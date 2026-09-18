#!/usr/bin/env node
import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, extname, isAbsolute, parse as parsePath } from 'node:path';
import { chromium } from '@playwright/test';

const SESSION_RE = /^[0-9a-f]{32}$/;
const FLOWS = ['sandbox', 'guided', 'devnet', 'isolation'];
const GUIDED_ACTIONS = [
  ['split', 'Split 100 test stock'],
  ['create-pool', 'Open market · 40 DR + 4 USDC'],
  ['add-liquidity', 'Add liquidity · 60 DR + 6 USDC'],
  ['buy-dr', 'Buy DR with 1 Test USDC'],
  ['remove-liquidity', 'Withdraw all LP liquidity'],
  ['recombine', 'Recombine paired PT + DR'],
  ['settle-year', 'Fast-forward test year'],
  ['redeem-buyer', 'Redeem buyer DR independently'],
  ['redeem-provider', 'Redeem Stock holder PT independently'],
];
const READ_TIMEOUT_MS = 90_000;
const DOM_TIMEOUT_MS = 60_000;
const POLL_MS = 2_000;

function usage() {
  return `Usage: node scripts/hosting/hosted-browser-smoke.mjs \\
  --execute true --url https://site.example --output /absolute/new-evidence.json \\
  --flow sandbox|guided|devnet|isolation|all

This driver performs real transactions and consumes hosted session/faucet quotas. It never mocks broker, manifest, or RPC traffic.`;
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) throw new Error(`Invalid arguments.\n${usage()}`);
    if (!['--execute', '--url', '--output', '--flow'].includes(flag)) throw new Error(`Unknown option ${flag}.`);
    if (values.has(flag)) throw new Error(`Duplicate option ${flag}.`);
    values.set(flag, value);
  }
  if (values.get('--execute') !== 'true') throw new Error('Refusing to run: pass --execute true after reviewing the target and quota impact.');
  const flow = values.get('--flow');
  if (![...FLOWS, 'all'].includes(flow)) throw new Error('--flow must be sandbox, guided, devnet, isolation, or all.');
  const rawUrl = values.get('--url');
  if (!rawUrl) throw new Error('--url is required.');
  const parsedUrl = new URL(rawUrl);
  const local = parsedUrl.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !local) throw new Error('--url must be an HTTPS site or an explicit localhost QA origin.');
  if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash || !['', '/'].includes(parsedUrl.pathname)) {
    throw new Error('--url must be a credential-free origin without a path, query, or fragment.');
  }
  const output = values.get('--output');
  if (!output || !isAbsolute(output) || extname(output) !== '.json') throw new Error('--output must be a new absolute .json path.');
  return { baseUrl: parsedUrl.origin, output, flow };
}

async function mustNotExist(path) {
  try { await access(path, fsConstants.F_OK); throw new Error(`Refusing to overwrite ${path}.`); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

function selectedFlows(flow) { return flow === 'all' ? FLOWS : [flow]; }
function safePublicText(value, limit = 20_000) {
  return String(value).replace(/(__Host-dxv|authorization|cookie|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]').slice(0, limit);
}
function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return safePublicText(message, 2_000);
}
function now() { return new Date().toISOString(); }
function delay(milliseconds, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function done() { signal.removeEventListener('abort', abort); resolve(undefined); }
    function abort() { clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener('abort', abort, { once: true });
  });
}
async function boundedBody(response, label) {
  let timer;
  try {
    return await Promise.race([
      response.text(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} body timed out.`)), READ_TIMEOUT_MS); }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

const options = parseArgs(process.argv.slice(2));
const outputName = parsePath(options.output);
const screenshotPath = (flow, width) => `${outputName.dir}/${outputName.name}-${flow}-${width}.png`;
const failureScreenshotPath = (flow) => `${outputName.dir}/${outputName.name}-${flow}-failure.png`;
await mkdir(dirname(options.output), { recursive: true });
await mustNotExist(options.output);
for (const flow of selectedFlows(options.flow)) for (const width of [1440, 390]) await mustNotExist(screenshotPath(flow, width));
for (const flow of selectedFlows(options.flow)) {
  const contexts = flow === 'isolation' ? ['isolation-visitor-a', 'isolation-visitor-b'] : [flow];
  for (const context of contexts) await mustNotExist(failureScreenshotPath(context));
}

const report = {
  schemaVersion: 1,
  kind: 'dividendx-hosted-browser-smoke',
  boundary: 'real production pages and public test assets; no issuer custody or mainnet claim',
  startedAt: now(),
  completedAt: null,
  targetOrigin: options.baseUrl,
  requestedFlow: options.flow,
  status: 'running',
  browser: 'Chromium; temporary in-memory wallets only; installed wallets not used',
  stages: [],
  flows: {},
  screenshots: [],
  failureArtifacts: [],
  browserErrors: [],
  errors: [],
  limits: {
    sessionLifetime: '15 minutes hard limit',
    transactionWaitSeconds: 60,
    requestWaitSeconds: 90,
    mutationRetry: false,
    intentionalFaucetReplay: 'One identical request after confirmation checks idempotence; no new grant is expected.',
    activeVmMaximumForAllFlow: 4,
    cleanup: 'No hidden delete; isolation performs the one specified reset and other VMs hard-expire.',
  },
};
let currentStage = 'preflight';
let currentPublicUrl = options.baseUrl;
let initialized = false;
async function persist() {
  const body = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(options.output, body, initialized ? undefined : { flag: 'wx' });
  initialized = true;
}
async function stage(name, detail = {}) {
  currentStage = name;
  report.stages.push({ at: now(), name, ...detail });
  await persist();
  process.stdout.write(`Hosted smoke: ${name}\n`);
}

async function captureFailureArtifacts(page, flow, error) {
  const artifact = { at: now(), flow, stage: currentStage, message: safeError(error), url: currentPublicUrl, alerts: [], bodyText: '', screenshot: null };
  try {
    if (!page.isClosed()) {
      const pageUrl = new URL(page.url());
      artifact.url = `${pageUrl.origin}${pageUrl.pathname}`;
      artifact.alerts = (await page.locator('[role="alert"]:visible').allTextContents()).map((text) => safePublicText(text, 1_000));
      artifact.bodyText = safePublicText(await page.locator('body').innerText(), 20_000);
      artifact.screenshot = failureScreenshotPath(flow);
      await page.screenshot({ path: artifact.screenshot, fullPage: true });
      report.screenshots.push({ flow, failure: true, path: artifact.screenshot });
    }
  } catch (captureError) { artifact.captureError = safeError(captureError); }
  report.failureArtifacts.push(artifact);
  await persist();
}

const runAbort = new AbortController();
let browser;
const interrupt = () => {
  runAbort.abort(new Error('Hosted smoke interrupted.'));
  void browser?.close();
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
await persist();

const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
let rpcId = 1;
const signatureCaptures = new WeakMap();
const pendingResponseReads = new Set();

function url(path) { return new URL(path, `${options.baseUrl}/`).toString(); }
async function responseJson(response, label, expected = [200]) {
  const text = await boundedBody(response, label);
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(`${label} returned non-JSON HTTP ${response.status()}.`); }
  if (!expected.includes(response.status())) throw new Error(`${label} returned HTTP ${response.status()}: ${safeError(value?.error ?? value?.message ?? 'request failed')}`);
  return value;
}
async function contextJson(context, path, label, expected = [200]) {
  const response = await context.request.get(url(path), { timeout: READ_TIMEOUT_MS, failOnStatusCode: false });
  return responseJson(response, label, expected);
}
async function rpc(context, endpoint, method, params = []) {
  const target = endpoint.startsWith('/') ? url(endpoint) : endpoint;
  const headers = { 'Content-Type': 'application/json' };
  if (new URL(target).origin === options.baseUrl) headers.Origin = options.baseUrl;
  const response = await context.request.post(target, {
    timeout: READ_TIMEOUT_MS,
    failOnStatusCode: false,
    headers,
    data: { jsonrpc: '2.0', id: rpcId++, method, params },
  });
  const body = await responseJson(response, `RPC ${method}`);
  if (body.error) throw new Error(`RPC ${method} failed: ${safeError(JSON.stringify(body.error))}`);
  return body.result;
}
async function poll(label, work, ready, timeoutMs = READ_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    if (runAbort.signal.aborted) throw runAbort.signal.reason;
    try { last = await work(); if (ready(last)) return last; }
    catch (error) { last = { error: safeError(error) }; }
    await delay(POLL_MS, runAbort.signal);
  }
  throw new Error(`${label} did not become ready within ${timeoutMs / 1_000} seconds. Last read: ${safeError(JSON.stringify(last))}`);
}

function observePage(page, bucket) {
  const capture = { signatures: new Set(), pending: new Set() };
  signatureCaptures.set(page, capture);
  const record = (entry) => {
    const value = { at: now(), ...entry };
    bucket.push(value);
    report.browserErrors.push(value);
  };
  page.setDefaultTimeout(DOM_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(READ_TIMEOUT_MS);
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const navigated = new URL(frame.url());
      currentPublicUrl = `${navigated.origin}${navigated.pathname}`;
    }
  });
  page.on('pageerror', (error) => record({ type: 'pageerror', message: safeError(error) }));
  page.on('console', (event) => {
    if (event.type() !== 'error') return;
    let sourceUrl;
    try { const source = new URL(event.location().url); sourceUrl = `${source.origin}${source.pathname}`; } catch {}
    record({ type: 'console', message: safeError(event.text()), ...(sourceUrl ? { url: sourceUrl } : {}) });
  });
  page.on('response', (response) => {
    const request = response.request();
    const responseUrl = new URL(response.url());
    const track = (operation) => {
      const pending = operation.catch(() => undefined).finally(() => {
        capture.pending.delete(pending);
        pendingResponseReads.delete(pending);
      });
      capture.pending.add(pending);
      pendingResponseReads.add(pending);
    };
    if (response.status() >= 400) {
      const entry = { type: 'http', status: response.status(), url: `${responseUrl.origin}${responseUrl.pathname}` };
      if (responseUrl.origin === options.baseUrl && responseUrl.pathname.startsWith('/api/')) {
        track((async () => {
          if (responseUrl.pathname.endsWith('/rpc')) {
            try {
              const requestBody = request.postDataJSON();
              const calls = Array.isArray(requestBody) ? requestBody : [requestBody];
              const rpcMethods = [...new Set(calls.map((call) => call?.method).filter((method) => typeof method === 'string'))];
              if (rpcMethods.length) entry.rpcMethods = rpcMethods;
            } catch { /* Never retain malformed request bodies or signed transaction bytes. */ }
          }
          try {
            const value = await response.json();
            const publicMessage = typeof value?.error === 'string' ? value.error : typeof value?.message === 'string' ? value.message : '';
            if (publicMessage) entry.message = safeError(publicMessage).slice(0, 500);
          } catch { /* Status, URL and RPC method remain useful for non-JSON failures. */ }
          record(entry);
        })());
      } else record(entry);
    }
    if (request.method() !== 'POST' || response.status() < 200 || response.status() >= 300) return;
    track((async () => {
      const pathname = responseUrl.pathname;
      if (pathname.endsWith('/faucet') || pathname.endsWith('/advance')) {
        const value = await response.json();
        if (Array.isArray(value?.signatures)) for (const signature of value.signatures) {
          if (typeof signature === 'string' && signature) capture.signatures.add(signature);
        }
        return;
      }
      if (!pathname.endsWith('/rpc')) return;
      let requestBody;
      try { requestBody = request.postDataJSON(); } catch { return; }
      const calls = Array.isArray(requestBody) ? requestBody : [requestBody];
      const sendIds = new Set(calls.filter((call) => call?.method === 'sendTransaction').map((call) => call.id));
      if (sendIds.size === 0) return;
      const responseBody = await response.json();
      const replies = Array.isArray(responseBody) ? responseBody : [responseBody];
      for (const reply of replies) if (sendIds.has(reply?.id) && typeof reply?.result === 'string' && reply.result) {
        capture.signatures.add(reply.result);
      }
    })());
  });
}

async function flushPendingResponseReads() {
  while (pendingResponseReads.size) await Promise.all([...pendingResponseReads]);
}

async function capturedSignatureSnapshot(page) {
  const capture = signatureCaptures.get(page);
  assert(capture, 'Signature capture was not initialized for this page.');
  await Promise.all([...capture.pending]);
  return new Set(capture.signatures);
}

async function assertNoOverflowAndCapture(page, flow) {
  const results = [];
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `${flow} has horizontal overflow at ${width}px.`);
    const path = screenshotPath(flow, width);
    await page.screenshot({ path, fullPage: true });
    report.screenshots.push({ flow, width, path, overflow });
    results.push({ width, overflow });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await persist();
  return results;
}

async function readSession(context, kind) {
  const value = await contextJson(context, `/api/sandbox/${kind}/session`, `${kind} session`, [200, 202]);
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.kind, kind);
  assert(['none', 'starting', 'ready', 'expired', 'failed'].includes(value.status));
  if (value.sessionId !== null) assert(SESSION_RE.test(value.sessionId), 'Invalid public session ID.');
  if (value.status === 'ready') {
    assert.equal(value.runtimeUrl, `/api/sandbox/${kind}/${value.sessionId}`);
    assert.equal(typeof value.runtimeId, 'string');
    assert(Date.parse(value.expiresAt) > Date.now());
  }
  return value;
}

async function enterSession(page, context, kind) {
  const route = kind === 'wallet' ? '/sandbox/' : '/demos/';
  await page.goto(url(route), { waitUntil: 'domcontentloaded' });
  let session = await readSession(context, kind);
  let startedAt = null;
  if (session.status === 'none' || session.status === 'expired' || session.status === 'failed') {
    const buttonName = session.sessionId ? 'Start a fresh sandbox' : 'Start private sandbox';
    const button = page.getByRole('button', { name: buttonName, exact: true });
    await button.waitFor({ state: 'visible' });
    startedAt = Date.now();
    await button.click(); // Exactly one explicit mutation. Unknown completion is reconciled only by GET below.
  } else if (session.status !== 'starting' && session.status !== 'ready') {
    throw new Error(`Unexpected ${kind} session state ${session.status}.`);
  }
  session = await poll(`${kind} session`, () => readSession(context, kind), (value) => value.status === 'ready');
  return { session, startedAt, readyAt: Date.now() };
}

async function readManifest(context, session) {
  const manifest = await contextJson(context, `${session.runtimeUrl}/manifest`, 'wallet manifest');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.kind, 'surfnet');
  assert.equal(manifest.hostedSessionId, session.sessionId);
  assert.equal(manifest.runtimeId, session.runtimeId);
  assert.equal(manifest.expiresAt, session.expiresAt);
  assert.equal(manifest.rpcUrl, `${session.runtimeUrl}/rpc`);
  assert.equal(manifest.wsUrl, undefined);
  assert(Array.isArray(manifest.assets) && manifest.assets.length > 0);
  const rpcGenesis = await rpc(context, manifest.rpcUrl, 'getGenesisHash');
  assert.equal(rpcGenesis, manifest.genesisHash);
  return manifest;
}

async function walletReceipts(page) {
  return page.locator('.wallet-receipts article').evaluateAll((articles) => articles.map((article) => ({
    label: article.querySelector('b')?.textContent?.trim() ?? '',
    detail: article.querySelector('span')?.textContent?.trim() ?? '',
    signature: article.querySelector('code')?.textContent?.trim() ?? '',
    explorer: article.querySelector('a')?.getAttribute('href') ?? null,
  })));
}

async function waitForWalletIdle(page, label) {
  const reset = page.getByRole('button', { name: 'Reset sandbox', exact: true });
  const anchor = await reset.count() === 1
    ? reset
    : page.getByRole('button', { name: /^Request test SOL \+ / }).first();
  const state = await poll(`${label} UI`, async () => ({
    anchorCount: await anchor.count(),
    anchorEnabled: await anchor.count() === 1 && await anchor.isEnabled(),
    loading: await page.locator('.wallet-loading').count(),
    alert: await visibleAlertText(page),
  }), (value) => Boolean(value.alert) || (value.anchorCount === 1 && value.anchorEnabled && value.loading === 0), DOM_TIMEOUT_MS);
  if (state.alert) await failForVisibleAlert(page, label);
}

async function visibleAlertText(page) {
  const alerts = await page.locator('[role="alert"]:visible').allTextContents();
  return safePublicText(alerts.join(' '), 1_000).trim();
}

async function failForVisibleAlert(page, label) {
  const message = await visibleAlertText(page);
  if (!message) return;
  report.errors.push({ at: now(), type: 'ui-alert', stage: currentStage, url: currentPublicUrl, label, message });
  await persist();
  throw new Error(`${label} stopped with a visible error: ${message}`);
}

async function finishWalletAction(page, label, beforeReceipts, beforeCaptured, additionalSignatures = []) {
  const priorDisplayed = new Set(beforeReceipts.map((item) => item.signature).filter(Boolean));
  const receiptDeadline = Date.now() + DOM_TIMEOUT_MS;
  while (Date.now() < receiptDeadline) {
    await failForVisibleAlert(page, label);
    const receipts = await walletReceipts(page);
    const added = receipts.filter((receipt) => receipt.signature && !priorDisplayed.has(receipt.signature));
    if (added.length > 0 && added.every((receipt) => /confirmed|finalized/i.test(receipt.detail))) break;
    await delay(250, runAbort.signal);
  }
  const newlyConfirmed = (await walletReceipts(page)).filter((receipt) => receipt.signature && !priorDisplayed.has(receipt.signature));
  if (newlyConfirmed.length === 0 || newlyConfirmed.some((receipt) => !/confirmed|finalized/i.test(receipt.detail))) {
    throw new Error(`${label} produced no confirmed receipt within ${DOM_TIMEOUT_MS / 1_000} seconds.`);
  }
  await waitForWalletIdle(page, label);
  await failForVisibleAlert(page, label);
  const receipts = await walletReceipts(page);
  const displayedReceipts = receipts.filter((item) => item.signature && !priorDisplayed.has(item.signature));
  assert(displayedReceipts.length > 0, `${label} produced no newly displayed receipt.`);
  assert(displayedReceipts.every((item) => /confirmed|finalized/i.test(item.detail)), `${label} displayed an unconfirmed receipt.`);
  const captured = await capturedSignatureSnapshot(page);
  const signatures = [...new Set([
    ...displayedReceipts.map((item) => item.signature),
    ...[...captured].filter((signature) => !beforeCaptured.has(signature)),
    ...additionalSignatures,
  ].filter(Boolean))];
  assert(signatures.length > 0, `${label} produced no public transaction signature.`);
  return { label, signatures, displayedReceipts, uiReceiptLimit: 8 };
}

async function clickWalletAction(page, button, label) {
  const beforeReceipts = await walletReceipts(page);
  const beforeCaptured = await capturedSignatureSnapshot(page);
  await button.waitFor({ state: 'visible' });
  assert(await button.isEnabled(), `${label} is disabled.`);
  await button.click(); // Never repeated after unknown completion.
  return finishWalletAction(page, label, beforeReceipts, beforeCaptured);
}
async function displayedBalances(page) { return page.locator('.wallet-balances > div b').allTextContents(); }
async function connectTemporaryWallet(page) {
  const button = page.getByTestId('temporary-wallet');
  await button.waitFor({ state: 'visible' });
  await button.click();
  await page.locator('.wallet-connect code').waitFor({ state: 'visible' });
  return (await page.locator('.wallet-connect code').textContent()).trim();
}
async function verifySignatures(context, rpcUrl, signatures) {
  const statuses = [];
  for (let offset = 0; offset < signatures.length; offset += 20) {
    const batch = signatures.slice(offset, offset + 20);
    const result = await rpc(context, rpcUrl, 'getSignatureStatuses', [batch, { searchTransactionHistory: true }]);
    assert.equal(result.value.length, batch.length);
    statuses.push(...result.value);
  }
  assert.equal(statuses.length, signatures.length);
  for (const status of statuses) {
    assert(status, 'A displayed signature is missing from RPC history.');
    assert.equal(status.err, null);
    assert(['confirmed', 'finalized'].includes(status.confirmationStatus), `Unexpected signature status ${status.confirmationStatus}.`);
  }
  return statuses;
}

async function readSeriesBalances(context, rpcUrl, asset) {
  const series = asset.series.find((item) => item.year === 2027) ?? asset.series[0];
  assert(series, `No annual series exists for ${asset.symbol}.`);
  const accounts = await rpc(context, rpcUrl, 'getMultipleAccounts', [
    [series.vault, series.ptMint, series.drMint],
    { encoding: 'base64', commitment: 'confirmed' },
  ]);
  assert.equal(accounts.value.length, 3);
  const bytes = accounts.value.map((account) => {
    assert(account && Array.isArray(account.data) && account.data[1] === 'base64', 'A final token account was missing or not base64 encoded.');
    return Buffer.from(account.data[0], 'base64');
  });
  assert(bytes[0].length >= 72 && bytes[1].length >= 44 && bytes[2].length >= 44, 'A final token account had invalid data.');
  return {
    vaultRaw: bytes[0].readBigUInt64LE(64).toString(),
    ptSupplyRaw: bytes[1].readBigUInt64LE(36).toString(),
    drSupplyRaw: bytes[2].readBigUInt64LE(36).toString(),
  };
}

async function runSandbox() {
  await stage('sandbox: create isolated visitor session');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: false });
  const errors = [];
  const page = await context.newPage();
  observePage(page, errors);
  try {
    const { session } = await enterSession(page, context, 'wallet');
    report.flows.sandbox = { status: 'running', session };
    await persist();
    const manifest = await readManifest(context, session);
    report.flows.sandbox = { status: 'running', session, manifest };
    await persist();
    const asset = manifest.assets.find((item) => item.symbol === 'TestKOx') ?? manifest.assets[0];
    const actions = [];
    await page.locator('.wallet-selector select').first().selectOption(asset.id);
    const wallet = await connectTemporaryWallet(page);
    await stage('sandbox: fund temporary wallet once', { sessionId: session.sessionId });
    actions.push(await clickWalletAction(page, page.getByRole('button', { name: `Request test SOL + ${asset.symbol}`, exact: true }), 'sandbox faucet'));
    await stage('sandbox: split stock into PT and DR');
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await page.getByLabel(`Deposit ${asset.symbol}`).fill('100');
    actions.push(await clickWalletAction(page, page.getByRole('button', { name: 'Split into PT + DR', exact: false }), 'sandbox split'));
    await stage('sandbox: advance through four events and finalization');
    await page.getByText('Network-wide test dates', { exact: true }).click();
    for (const name of ['start year', 'record dividends', 'end year', 'finalize']) {
      actions.push(await clickWalletAction(page, page.getByRole('button', { name, exact: true }), `sandbox ${name}`));
      if (name === 'record dividends') assert.match(await page.getByRole('status').textContent(), /four|4/i);
    }
    assert.equal((await page.locator('.wallet-phase').textContent()).trim(), 'Ready to redeem');
    await page.getByRole('button', { name: 'Redeem', exact: true }).click();
    await stage('sandbox: redeem PT and DR independently');
    for (const [index, name] of [[0, 'Redeem PT'], [1, 'Redeem DR']]) {
      const card = page.locator('.redemption-grid article').nth(index);
      await card.getByRole('button', { name: 'Max', exact: true }).click();
      actions.push(await clickWalletAction(page, card.getByRole('button', { name, exact: false }), `sandbox ${name}`));
    }
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('.wallet-balances > div b')].map((item) => item.textContent?.trim());
      return values[1] === '0' && values[2] === '0';
    }, undefined, { timeout: DOM_TIMEOUT_MS });
    const receipts = await walletReceipts(page);
    const signatures = [...new Set(actions.flatMap((action) => action.signatures))];
    const statuses = await verifySignatures(context, manifest.rpcUrl, signatures);
    const balances = await displayedBalances(page);
    assert.equal(balances[1], '0');
    assert.equal(balances[2], '0');
    const seriesBalances = await readSeriesBalances(context, manifest.rpcUrl, asset);
    assert.deepEqual(seriesBalances, { vaultRaw: '0', ptSupplyRaw: '0', drSupplyRaw: '0' });
    const layout = await assertNoOverflowAndCapture(page, 'sandbox');
    await flushPendingResponseReads();
    assert.deepEqual(errors, [], `Sandbox browser errors: ${JSON.stringify(errors)}`);
    report.flows.sandbox = { status: 'pass', session, manifest, wallet, assetId: asset.id, balances, seriesBalances, actions,
      displayedReceiptsAtEnd: receipts, displayedReceiptLimit: 8, rpcStatuses: statuses, layout, browserErrors: errors };
    await persist();
  } catch (error) {
    await captureFailureArtifacts(page, 'sandbox', error);
    throw error;
  } finally { await context.close(); }
}

async function guidedState(context, runtimeUrl) { return contextJson(context, `${runtimeUrl}/state`, 'guided state'); }
async function runGuided() {
  await stage('guided: create isolated visitor session');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: false });
  const errors = [];
  const page = await context.newPage();
  observePage(page, errors);
  try {
    const { session } = await enterSession(page, context, 'guided');
    report.flows.guided = { status: 'running', session };
    await persist();
    let state = await guidedState(context, session.runtimeUrl);
    report.flows.guided = { status: 'running', session, initialState: state };
    await persist();
    assert.equal(state.runtimeId, session.runtimeId);
    if (state.status === 'idle') {
      await stage('guided: prepare two disposable server wallets', { sessionId: session.sessionId });
      await page.getByRole('button', { name: 'Prepare demo wallets', exact: true }).click();
      state = await poll('guided setup', () => guidedState(context, session.runtimeUrl), (value) => value.status === 'ready' && value.nextStep === 'split');
    }
    const innerSessionId = state.sessionId;
    const checkpoints = [];
    for (const [stepId, action] of GUIDED_ACTIONS) {
      await stage(`guided: ${stepId}`);
      const button = page.getByRole('button', { name: action, exact: true });
      await button.waitFor({ state: 'visible' });
      assert(await button.isEnabled(), `${action} is disabled.`);
      await button.click(); // One mutation only; subsequent requests are reads.
      state = await poll(`guided ${stepId}`, () => guidedState(context, session.runtimeUrl), (value) => value.completedSteps?.includes(stepId) && ['ready', 'complete'].includes(value.status), DOM_TIMEOUT_MS);
      assert.equal(state.runtimeId, session.runtimeId);
      assert.equal(state.sessionId, innerSessionId);
      assert.notEqual(state.status, 'failed', state.error ?? `${stepId} failed`);
      checkpoints.push({ step: stepId, revision: state.revision, slot: state.snapshot?.slot ?? null, transactions: state.transactions.length });
    }
    assert.equal(state.status, 'complete');
    assert.equal(state.snapshot?.phase, 'finalized');
    assert.equal(state.snapshot?.eventCount, 4);
    assert.equal(state.snapshot?.rpcUrl, `sandbox:${session.sessionId}`);
    assert.equal(state.snapshot?.ptSupplyRaw, '0');
    assert.equal(state.snapshot?.provider.ptRaw, '0');
    assert.equal(state.snapshot?.provider.drRaw, '0');
    assert.equal(state.snapshot?.buyer.drRaw, '0');
    assert.equal(state.snapshot?.backingVerified, true);
    assert(BigInt(state.snapshot?.vaultRaw ?? '0') > 0n);
    assert(BigInt(state.snapshot?.drSupplyRaw ?? '0') > 0n);
    assert.equal(state.snapshot?.drSupplyRaw, state.snapshot?.pool?.drRaw);
    assert(state.transactions.every((transaction) => ['confirmed', 'finalized'].includes(transaction.status)));
    const receipt = await contextJson(context, `${session.runtimeUrl}/receipt`, 'guided receipt');
    assert.equal(receipt.schemaVersion, 2);
    assert.equal(receipt.runtimeId, session.runtimeId);
    assert.equal(receipt.sessionId, innerSessionId);
    assert.equal(await page.locator('.transaction-list a').count(), 0, 'Sandbox signatures must not link to Explorer.');
    const layout = await assertNoOverflowAndCapture(page, 'guided');
    await flushPendingResponseReads();
    assert.deepEqual(errors, [], `Guided browser errors: ${JSON.stringify(errors)}`);
    report.flows.guided = { status: 'pass', session, innerSessionId, finalState: state, receipt, checkpoints, layout, browserErrors: errors };
    await persist();
  } catch (error) {
    await captureFailureArtifacts(page, 'guided', error);
    throw error;
  } finally { await context.close(); }
}

async function waitForDevnetFaucet(context, manifest, responsePayload) {
  const signatures = responsePayload?.signatures ?? [];
  assert(signatures.length > 0, 'Devnet faucet returned no recorded signatures.');
  return poll('devnet faucet confirmation', async () => {
    try { return await rpc(context, manifest.rpcUrl, 'getSignatureStatuses', [signatures, { searchTransactionHistory: true }]); }
    catch (error) { return { value: [], publicError: safeError(error) }; }
  }, (result) => result.value?.length === signatures.length && result.value.every((status) => status && status.err === null && ['confirmed', 'finalized'].includes(status.confirmationStatus)));
}

async function runDevnet() {
  await stage('devnet: open real-calendar public app');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: false });
  const errors = [];
  const page = await context.newPage();
  observePage(page, errors);
  try {
    await page.goto(url('/app/'), { waitUntil: 'domcontentloaded' });
    const manifest = await contextJson(context, '/api/devnet/manifest', 'devnet manifest');
    assert.equal(manifest.kind, 'devnet');
    assert.equal(manifest.clockControl, false);
    report.flows.devnet = { status: 'running', manifest };
    await persist();
    await page.getByLabel('Verified runtime').waitFor({ state: 'visible' });
    assert.equal(await page.getByText('Network-wide test dates', { exact: true }).count(), 0);
    const asset = manifest.assets.find((item) => item.symbol === 'TestKOx') ?? manifest.assets[0];
    const actions = [];
    await page.locator('.wallet-selector select').first().selectOption(asset.id);
    const wallet = await connectTemporaryWallet(page);
    await stage('devnet: request the bounded ten-token grant once');
    const faucetBeforeReceipts = await walletReceipts(page);
    const faucetBeforeCaptured = await capturedSignatureSnapshot(page);
    const faucetResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/devnet/faucet', { timeout: READ_TIMEOUT_MS });
    await page.getByRole('button', { name: `Request test SOL + ${asset.symbol}`, exact: true }).click();
    const faucetPayload = await responseJson(await faucetResponse, 'devnet faucet', [200, 202]);
    const faucetStatuses = await waitForDevnetFaucet(context, manifest, faucetPayload);
    actions.push(await finishWalletAction(page, 'devnet faucet', faucetBeforeReceipts, faucetBeforeCaptured, faucetPayload.signatures));
    await stage('devnet: verify identical faucet request returns the same transaction');
    const duplicateResponse = await context.request.post(url('/api/devnet/faucet'), {
      timeout: READ_TIMEOUT_MS, failOnStatusCode: false,
      headers: { 'Content-Type': 'application/json', Origin: options.baseUrl },
      data: { owner: wallet, assetId: asset.id, runtimeId: manifest.runtimeId, genesisHash: manifest.genesisHash },
    });
    const duplicateGrant = await responseJson(duplicateResponse, 'idempotent devnet faucet', [200, 202]);
    assert.deepEqual(duplicateGrant.signatures, faucetPayload.signatures);
    await page.getByRole('button', { name: 'Refresh balances', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.wallet-balances > div b')?.textContent?.trim() === '10', undefined, { timeout: DOM_TIMEOUT_MS });
    Object.assign(report.flows.devnet, { wallet, assetId: asset.id, faucet: faucetPayload, duplicateGrant, faucetStatuses: faucetStatuses.value, actions });
    await stage('devnet: split and recombine one TestKOx');
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await page.getByLabel(`Deposit ${asset.symbol}`).fill('1');
    actions.push(await clickWalletAction(page, page.getByRole('button', { name: 'Split into PT + DR', exact: false }), 'devnet split'));
    await page.getByRole('button', { name: 'Redeem', exact: true }).click();
    await page.getByLabel('Matching pair amount').fill('1');
    actions.push(await clickWalletAction(page, page.getByRole('button', { name: 'Combine & return stock', exact: false }), 'devnet recombine'));
    await page.waitForFunction(() => {
      const values = [...document.querySelectorAll('.wallet-balances > div b')].map((item) => item.textContent?.trim());
      return values[0] === '10' && values[1] === '0' && values[2] === '0';
    }, undefined, { timeout: DOM_TIMEOUT_MS });
    const receipts = await walletReceipts(page);
    assert(receipts.length >= 2);
    assert(receipts.every((item) => item.explorer?.startsWith('https://explorer.solana.com/tx/')), 'Every public devnet receipt must link to Explorer.');
    const signatures = [...new Set(actions.flatMap((action) => action.signatures))];
    const rpcStatuses = await verifySignatures(context, manifest.rpcUrl, signatures);
    const balances = await displayedBalances(page);
    assert.deepEqual(balances, ['10', '0', '0']);
    const seriesBalances = await readSeriesBalances(context, manifest.rpcUrl, asset);
    const layout = await assertNoOverflowAndCapture(page, 'devnet');
    await flushPendingResponseReads();
    assert.deepEqual(errors, [], `Devnet browser errors: ${JSON.stringify(errors)}`);
    report.flows.devnet = { status: 'pass', manifest, wallet, assetId: asset.id, faucet: faucetPayload, duplicateGrant,
      faucetStatuses: faucetStatuses.value, balances, seriesBalances, actions, displayedReceiptsAtEnd: receipts,
      displayedReceiptLimit: 8, rpcStatuses, layout, browserErrors: errors };
    await persist();
  } catch (error) {
    await captureFailureArtifacts(page, 'devnet', error);
    throw error;
  } finally { await context.close(); }
}

let isolationProgress = Promise.resolve();
function persistIsolationIdentity(name, session, manifest) {
  isolationProgress = isolationProgress.then(async () => {
    const current = report.flows.isolation?.status === 'running' ? report.flows.isolation : { status: 'running' };
    current[name === 'visitor-a' ? 'visitorA' : 'visitorB'] = { session, manifest };
    report.flows.isolation = current;
    await persist();
  });
  return isolationProgress;
}

async function isolationVisitor(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: false });
  const errors = [];
  const page = await context.newPage();
  observePage(page, errors);
  try {
    const entered = await enterSession(page, context, 'wallet');
    assert(entered.startedAt !== null, `${name} unexpectedly reused a prior cookie session.`);
    const manifest = await readManifest(context, entered.session);
    await persistIsolationIdentity(name, entered.session, manifest);
    await page.locator('.wallet-phase').waitFor({ state: 'visible' });
    return { name, context, page, errors, ...entered, manifest, phase: (await page.locator('.wallet-phase').textContent()).trim(), balances: await displayedBalances(page) };
  } catch (error) {
    await captureFailureArtifacts(page, `isolation-${name}`, error);
    await context.close();
    throw error;
  }
}

async function runIsolation() {
  await stage('isolation: start two simultaneous cookie visitors');
  const visitorResults = await Promise.allSettled([isolationVisitor('visitor-a'), isolationVisitor('visitor-b')]);
  const visitors = visitorResults.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const failedVisitor = visitorResults.find((result) => result.status === 'rejected');
  if (failedVisitor) {
    for (const visitor of visitors) await captureFailureArtifacts(visitor.page, `isolation-${visitor.name}`, failedVisitor.reason);
    await Promise.all(visitors.map(({ context }) => context.close()));
    throw failedVisitor.reason;
  }
  const [a, b] = visitors;
  try {
    report.flows.isolation = { status: 'running', visitorA: { session: a.session, manifest: a.manifest }, visitorB: { session: b.session, manifest: b.manifest } };
    await persist();
    assert.notEqual(a.session.sessionId, b.session.sessionId);
    assert.notEqual(a.session.runtimeId, b.session.runtimeId);
    // Separate Surfpool instances can report the same genesis hash. Runtime,
    // deployment domain and actual account visibility establish isolation.
    assert.notEqual(a.manifest.deploymentDomainHex, b.manifest.deploymentDomainHex);
    assert.notEqual(a.manifest.assets[0].series[0].address, b.manifest.assets[0].series[0].address);
    const seriesAddresses = [a.manifest.assets[0].series[0].address, b.manifest.assets[0].series[0].address];
    const accountsA = await rpc(a.context, a.manifest.rpcUrl, 'getMultipleAccounts', [seriesAddresses, { encoding: 'base64', commitment: 'confirmed' }]);
    const accountsB = await rpc(b.context, b.manifest.rpcUrl, 'getMultipleAccounts', [seriesAddresses, { encoding: 'base64', commitment: 'confirmed' }]);
    assert.ok(accountsA.value[0]); assert.equal(accountsA.value[1], null);
    assert.equal(accountsB.value[0], null); assert.ok(accountsB.value[1]);
    await stage('isolation: advance only visitor A');
    await a.page.getByText('Network-wide test dates', { exact: true }).click();
    const advanceAction = await clickWalletAction(a.page, a.page.getByRole('button', { name: 'start year', exact: true }), 'visitor A start year');
    const advanceStatuses = await verifySignatures(a.context, a.manifest.rpcUrl, advanceAction.signatures);
    assert.match((await a.page.locator('.wallet-phase').textContent()).trim(), /Collecting dividends/);
    await b.page.getByRole('button', { name: 'Refresh balances', exact: true }).click();
    await b.page.locator('.wallet-loading').waitFor({ state: 'hidden' }).catch(() => undefined);
    assert.equal((await b.page.locator('.wallet-phase').textContent()).trim(), b.phase);
    assert.deepEqual(await displayedBalances(b.page), b.balances);
    const cooldownRemaining = Math.max(0, 31_000 - (Date.now() - a.readyAt));
    if (cooldownRemaining > 0) {
      await stage('isolation: wait for mandatory reset cooldown', { milliseconds: cooldownRemaining });
      await delay(cooldownRemaining, runAbort.signal);
    }
    await stage('isolation: reset visitor A exactly once');
    const oldSession = a.session;
    const resetStartedAt = now();
    await a.page.getByRole('button', { name: 'Reset sandbox', exact: true }).click();
    const replacement = await poll('replacement wallet session', () => readSession(a.context, 'wallet'), (value) => value.status === 'ready' && value.sessionId !== oldSession.sessionId);
    const replacementManifest = await readManifest(a.context, replacement);
    assert.notEqual(replacementManifest.runtimeId, a.manifest.runtimeId);
    assert.notEqual(replacementManifest.deploymentDomainHex, a.manifest.deploymentDomainHex);
    await a.page.getByLabel('Verified runtime').waitFor({ state: 'visible', timeout: READ_TIMEOUT_MS });
    await a.page.locator('.wallet-phase').waitFor({ state: 'visible', timeout: READ_TIMEOUT_MS });
    const staleResponse = await a.context.request.get(url(`${oldSession.runtimeUrl}/manifest`), { timeout: READ_TIMEOUT_MS, failOnStatusCode: false });
    assert.equal(staleResponse.status(), 410, 'The old session-bound endpoint must stay gone.');
    const bSessionAfter = await readSession(b.context, 'wallet');
    const bManifestAfter = await readManifest(b.context, bSessionAfter);
    assert.equal(bSessionAfter.sessionId, b.session.sessionId);
    assert.equal(bManifestAfter.runtimeId, b.manifest.runtimeId);
    assert.equal(bManifestAfter.genesisHash, b.manifest.genesisHash);
    await b.page.getByRole('button', { name: 'Refresh balances', exact: true }).click();
    assert.deepEqual(await displayedBalances(b.page), b.balances);
    const layout = await assertNoOverflowAndCapture(a.page, 'isolation');
    await flushPendingResponseReads();
    const expectedAfterReset = (entry) => entry.at >= resetStartedAt && entry.url?.startsWith(url(`${oldSession.runtimeUrl}/`))
      && ((entry.type === 'http' && entry.status === 410)
        || (entry.type === 'console' && /^Failed to load resource: the server responded with a status of 410\b/.test(entry.message)));
    const expectedStaleSessionResponses = a.errors.filter(expectedAfterReset);
    const unexpectedA = a.errors.filter((entry) => !expectedAfterReset(entry));
    assert.deepEqual(unexpectedA, [], `Visitor A unexpected browser errors: ${JSON.stringify(unexpectedA)}`);
    assert.deepEqual(b.errors, [], `Visitor B browser errors: ${JSON.stringify(b.errors)}`);
    assert.equal(await a.page.locator('[role="alert"]:visible').count(), 0);
    assert.equal(await b.page.locator('[role="alert"]:visible').count(), 0);
    report.flows.isolation = {
      status: 'pass',
      accountIsolation: { visitorA: [true, false], visitorB: [false, true], sameGenesisHash: a.manifest.genesisHash === b.manifest.genesisHash },
      visitorA: { initialSession: oldSession, initialManifest: a.manifest, advanceAction, advanceStatuses,
        replacementSession: replacement, replacementManifest, staleEndpointStatus: staleResponse.status() },
      visitorB: { session: bSessionAfter, manifest: bManifestAfter, phaseBefore: b.phase, phaseAfter: (await b.page.locator('.wallet-phase').textContent()).trim(), balancesBefore: b.balances, balancesAfter: await displayedBalances(b.page) },
      layout,
      expectedStaleSessionResponses,
      browserErrors: [...unexpectedA, ...b.errors],
    };
    await persist();
  } catch (error) {
    for (const visitor of visitors) await captureFailureArtifacts(visitor.page, `isolation-${visitor.name}`, error);
    throw error;
  } finally { await Promise.all(visitors.map(({ context }) => context.close())); }
}

try {
  browser = await chromium.launch(launchOptions);
  await stage('browser launched', { flows: selectedFlows(options.flow) });
  for (const flow of selectedFlows(options.flow)) {
    if (flow === 'sandbox') await runSandbox();
    else if (flow === 'guided') await runGuided();
    else if (flow === 'devnet') await runDevnet();
    else await runIsolation();
  }
  await flushPendingResponseReads();
  report.status = 'pass';
  report.completedAt = now();
  await stage('all requested flows passed');
} catch (error) {
  await flushPendingResponseReads();
  report.status = 'failed';
  report.completedAt = now();
  report.errors.push({ at: now(), stage: currentStage, url: currentPublicUrl, message: safeError(error) });
  await persist();
  throw error;
} finally {
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  if (browser) await browser.close();
}
