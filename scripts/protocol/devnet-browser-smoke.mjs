#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import { chromium, expect } from '@playwright/test';

const HOST = '127.0.0.1';
const PORT = 4195;
const ORIGIN = `http://${HOST}:${PORT}`;
const ASSET_ID = 'xstocks-test-kox';
const AMOUNT_UI = '1';
const TOKEN_FUND_UI = 10n;
const SOL_FUND_LAMPORTS = 6_000_000;
const GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const PROGRAM = '2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE';
const DOMAIN = 'ce59db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab';
const RPC_URL = 'https://api.devnet.solana.com';
const UI_EXPECT_TIMEOUT_MS = 60_000;
const RPC_ATTEMPT_DEADLINE_MS = 15_000;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const viteBin = join(repositoryRoot, 'node_modules/.bin/vite');
const viteConfig = join(repositoryRoot, 'apps/web/vite.config.ts');
const operatorCli = join(repositoryRoot, 'packages/devnet-runtime/dist/src/cli.js');

function parseArgs(argv) {
  assert.equal(argv.length % 2, 0, 'Arguments must be --name value pairs.');
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    assert.match(name ?? '', /^--[a-z-]+$/, `Invalid argument ${String(name)}.`);
    assert.ok(value && !value.startsWith('--'), `${name} requires a value.`);
    assert.equal(flags.has(name.slice(2)), false, `${name} was provided twice.`);
    flags.set(name.slice(2), value);
  }
  for (const name of flags.keys()) assert.ok(['execute', 'manifest', 'state-dir', 'receipt'].includes(name), `Unknown argument --${name}.`);
  assert.equal(flags.get('execute'), 'true', 'Live devnet mutation is opt-in: pass --execute true.');
  for (const name of ['manifest', 'state-dir']) {
    const value = flags.get(name);
    assert.ok(value, `--${name} is required.`);
    assert.ok(isAbsolute(value), `--${name} must be an absolute path.`);
  }
  const receipt = flags.get('receipt') ?? join(tmpdir(), `dividendx-devnet-browser-smoke-${Date.now()}.json`);
  assert.ok(isAbsolute(receipt), '--receipt must be an absolute path.');
  assert.equal(existsSync(receipt), false, '--receipt already exists; refusing to overwrite public evidence.');
  return { manifestPath: flags.get('manifest'), stateDirectory: flags.get('state-dir'), receiptPath: receipt };
}

function parseManifest(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Manifest must be an object.');
  assert.equal(value.schemaVersion, 1, 'Manifest schemaVersion must be 1.');
  assert.equal(value.kind, 'devnet', 'Manifest kind must be devnet.');
  assert.equal(value.rpcUrl, RPC_URL, 'Manifest RPC must be the pinned Solana devnet endpoint.');
  assert.equal(value.genesisHash, GENESIS, 'Manifest genesis is not pinned devnet.');
  assert.equal(value.programId, PROGRAM, 'Manifest program is not the accepted DividendX deployment.');
  assert.equal(value.deploymentDomainHex, DOMAIN, 'Manifest deployment domain mismatch.');
  assert.equal(value.clockControl, false, 'Devnet manifest must disable clock control.');
  assert.equal(value.faucetEnabled, false, 'Persistent registry must keep the public faucet disabled.');
  assert.match(value.runtimeId, /^[0-9a-f-]{36}$/i, 'Manifest runtimeId is malformed.');
  assert.ok(Array.isArray(value.assets), 'Manifest assets are missing.');
  const asset = value.assets.find((candidate) => candidate?.id === ASSET_ID);
  assert.ok(asset, `Manifest does not contain ${ASSET_ID}.`);
  assert.equal(asset.symbol, 'TestKOx');
  assert.equal(asset.decimals, 8);
  assert.equal(asset.series?.length, 1);
  assert.equal(asset.series[0]?.year, 2027);
  for (const address of [asset.collateralMint, asset.assetPolicy, asset.series[0].address, asset.series[0].accumulator,
    asset.series[0].ptMint, asset.series[0].drMint, asset.series[0].vault]) new PublicKey(address);
  return { manifest: value, asset, series: asset.series[0] };
}

async function assertPortAvailable() {
  await new Promise((resolveReady, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`QA port ${PORT} is already in use; no process was stopped.`)));
    probe.listen(PORT, HOST, () => probe.close(resolveReady));
  });
}

function captureProcess(command, args, options, timeoutMs) {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} exceeded ${timeoutMs}ms.`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolveProcess({ stdout, stderr });
      else reject(new Error(`${command} exited with ${String(code ?? signal)}: ${stderr.slice(-2_000)}`));
    });
  });
}

async function waitForVite(child, logs) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Vite exited early with ${child.exitCode}: ${logs().slice(-2_000)}`);
    try {
      const response = await fetch(`${ORIGIN}/app/`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* Vite is still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Vite did not become ready on ${ORIGIN}: ${logs().slice(-2_000)}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function fundBrowserOwner({ manifestPath, stateDirectory, manifest, owner }) {
  assert.ok(existsSync(operatorCli), 'Build packages/devnet-runtime before running this harness; operator CLI dist is missing.');
  const result = await captureProcess(process.execPath, [operatorCli, 'fund-holder',
    '--manifest', manifestPath,
    '--state-dir', stateDirectory,
    '--owner', owner,
    '--asset-id', ASSET_ID,
    '--runtime-id', manifest.runtimeId,
    '--genesis-hash', manifest.genesisHash,
  ], { cwd: repositoryRoot, env: process.env }, 180_000);
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error('fund-holder did not return JSON.'); }
  assert.ok(Array.isArray(parsed.signatures) && parsed.signatures.length === 1, 'fund-holder must return exactly one bounded funding signature.');
  assert.match(parsed.signatures[0], /^[1-9A-HJ-NP-Za-km-z]{64,88}$/, 'fund-holder returned an invalid signature.');
  return parsed.signatures[0];
}

async function confirmed(connection, signature, requireDividendX = false) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      assert.equal(status.err, null, `Transaction ${signature} failed: ${JSON.stringify(status.err)}`);
      let details = null;
      for (let detailAttempt = 0; detailAttempt < 30 && !details; detailAttempt += 1) {
        details = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (!details) await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      }
      assert.ok(details, `Confirmed transaction ${signature} details remained unavailable.`);
      const dividendXInvokeObserved = Boolean(details.meta?.logMessages?.some((line) => line.includes(`Program ${PROGRAM} invoke`)));
      if (requireDividendX) assert.equal(dividendXInvokeObserved, true, `Transaction ${signature} did not invoke DividendX.`);
      return { signature, slot: status.slot, confirmationStatus: status.confirmationStatus,
        blockTime: details.blockTime, feeLamports: details.meta?.fee ?? null, dividendXInvokeObserved };
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 750));
  }
  throw new Error(`Transaction ${signature} did not reach confirmed status.`);
}

async function rawBalance(connection, address) {
  const response = await connection.getTokenAccountBalance(address, 'confirmed');
  return BigInt(response.value.amount);
}

async function exactBalances(connection, addresses) {
  const collateralRaw = await rawBalance(connection, addresses.collateral);
  const ptRaw = await rawBalance(connection, addresses.pt);
  const drRaw = await rawBalance(connection, addresses.dr);
  const solLamports = await connection.getBalance(addresses.owner, 'confirmed');
  return { collateralRaw, ptRaw, drRaw, solLamports };
}

async function boundedRpcFetch(input, init = {}) {
  const deadline = Date.now() + RPC_ATTEMPT_DEADLINE_MS;
  for (let attempt = 0; ; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Devnet RPC retry deadline exceeded after ${RPC_ATTEMPT_DEADLINE_MS}ms.`);
    const timeout = AbortSignal.timeout(remaining);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const response = await fetch(input, { ...init, signal });
    if (response.status !== 429 && response.status !== 503) return response;
    const retryAfter = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1_000, 3_000)
      : Math.min(250 * 2 ** attempt, 2_000);
    await response.body?.cancel().catch(() => undefined);
    if (Date.now() + delay >= deadline) throw new Error(`Devnet RPC remained unavailable with HTTP ${response.status} inside the ${RPC_ATTEMPT_DEADLINE_MS}ms deadline.`);
    await new Promise((resolveWait) => setTimeout(resolveWait, delay));
  }
}

function publicError(error, sensitiveValues) {
  let text = error instanceof Error ? error.message : String(error);
  for (const value of sensitiveValues) if (value) text = text.replaceAll(value, '[private path]');
  return text.slice(0, 2_000);
}

function serializableBalances(value) {
  return {
    collateralRaw: value.collateralRaw.toString(),
    ptRaw: value.ptRaw.toString(),
    drRaw: value.drRaw.toString(),
    solLamports: value.solLamports,
  };
}

async function writeReceipt(path, receipt) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, path);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assert.ok(existsSync(options.manifestPath), 'Manifest file does not exist.');
  assert.ok(existsSync(options.stateDirectory), 'State directory does not exist.');
  assert.ok(existsSync(viteBin), 'Vite executable is missing.');
  const manifestText = await readFile(options.manifestPath, 'utf8');
  const { manifest, asset, series } = parseManifest(JSON.parse(manifestText));
  const startedAt = new Date().toISOString();
  let progress = {
    schema: 'dividendx-devnet-browser-smoke-v1',
    boundary: 'public-devnet-synthetic-test-assets-temporary-browser-wallet',
    status: 'running',
    stage: 'manifest-validated',
    startedAt,
    updatedAt: startedAt,
    manifestTransport: 'playwright-route-single-same-origin-manifest-endpoint',
    frontendTransport: 'isolated-production-build-preview-no-HMR',
    rpcTransport: 'genuine-solana-devnet-no-rpc-interception; harness proof reads retry only HTTP 429/503 inside a shared 15s deadline',
    runtimeId: manifest.runtimeId,
    genesisHash: manifest.genesisHash,
    programId: manifest.programId,
    deploymentDomainHex: manifest.deploymentDomainHex,
    assetId: ASSET_ID,
    symbol: asset.symbol,
    amountRaw: (10n ** BigInt(asset.decimals)).toString(),
    funding: { requestedTokenRaw: (TOKEN_FUND_UI * 10n ** BigInt(asset.decimals)).toString(), requestedSolLamports: SOL_FUND_LAMPORTS, attempts: 0 },
    transactions: {},
  };
  const sensitivePaths = [options.stateDirectory, options.manifestPath, repositoryRoot];
  let currentStage = 'manifest-validated';
  const persist = async (stage, updates = {}) => {
    currentStage = stage;
    progress = { ...progress, ...updates, stage, updatedAt: new Date().toISOString() };
    const serialized = JSON.stringify(progress);
    for (const value of sensitivePaths) assert.equal(serialized.includes(value), false, 'Public receipt leaked a private input path.');
    await writeReceipt(options.receiptPath, progress);
  };
  await persist('manifest-validated');
  await assertPortAvailable();

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'dividendx-devnet-browser-'));
  const temporaryConfig = join(temporaryDirectory, 'vite.config.mjs');
  await writeFile(temporaryConfig, `import base from ${JSON.stringify(pathToFileURL(viteConfig).href)};\nexport default { ...base, cacheDir: ${JSON.stringify(join(temporaryDirectory, 'vite-cache'))}, server: { ...(base.server || {}), host: ${JSON.stringify(HOST)}, port: ${PORT}, strictPort: true } };\n`);

  let vite;
  let browser;
  let page;
  let viteOutput = '';
  let fundAttempted = false;
  try {
    const previewDirectory = join(temporaryDirectory, 'build');
    const previewEnvironment = { ...process.env, VITE_DIVIDENDX_NETWORK: 'devnet',
      VITE_DIVIDENDX_RUNTIME_URL: '/api/devnet', VITE_DIVIDENDX_DEVNET_RPC_URL: RPC_URL };
    // A static build prevents another verification process rebuilding the linked
    // SDK from hot-reloading the app and discarding a form mid-transaction.
    await captureProcess(viteBin, ['build', '--config', temporaryConfig, '--outDir', previewDirectory],
      { cwd: repositoryRoot, env: previewEnvironment }, 120_000);
    vite = spawn(viteBin, ['preview', '--config', temporaryConfig, '--outDir', previewDirectory,
      '--host', HOST, '--port', String(PORT), '--strictPort'], {
      cwd: repositoryRoot,
      env: previewEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    vite.stdout.on('data', (chunk) => { viteOutput += chunk.toString(); });
    vite.stderr.on('data', (chunk) => { viteOutput += chunk.toString(); });
    await waitForVite(vite, () => viteOutput);

    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      || (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(UI_EXPECT_TIMEOUT_MS);
    const uiExpect = expect.configure({ timeout: UI_EXPECT_TIMEOUT_MS });
    const pageErrors = [];
    const rpcRequests = [];
    let rpcSends = 0;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (!request.url().startsWith(`${RPC_URL}/`)) return;
      rpcRequests.push(request.url());
      try {
        const payload = request.postDataJSON();
        if ((Array.isArray(payload) ? payload : [payload]).some((entry) => entry?.method === 'sendTransaction')) rpcSends += 1;
      } catch { /* CORS preflight has no JSON body. */ }
    });
    await page.route(`${ORIGIN}/api/devnet/manifest`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: manifestText,
      headers: { 'Cache-Control': 'no-store' },
    }));

    await page.goto(`${ORIGIN}/app/`, { waitUntil: 'domcontentloaded' });
    await uiExpect(page.getByLabel('Verified runtime')).toContainText('Verified Solana devnet');
    await uiExpect(page.getByText('Network-wide test dates')).toHaveCount(0);
    await uiExpect(page.getByText('Annual lifecycle controls')).toHaveCount(0);
    await uiExpect(page.getByRole('button', { name: /Request test SOL/ })).toHaveCount(0);
    await page.locator('.wallet-selector select').first().selectOption(ASSET_ID);
    await page.getByTestId('temporary-wallet').click();
    await uiExpect(page.locator('.wallet-connect h2')).toHaveText('DividendX temporary test wallet');
    const ownerText = await page.locator('.wallet-connect code').textContent();
    assert.ok(ownerText, 'Temporary wallet owner was not visible.');
    const owner = new PublicKey(ownerText.trim());
    currentStage = 'temporary-wallet-created';
    await persist(currentStage, { owner: owner.toBase58(),
      assertions: { noClockControls: true, faucetUiAbsent: true } });

    const connection = new Connection(manifest.rpcUrl, { commitment: 'confirmed', confirmTransactionInitialTimeout: 60_000,
      disableRetryOnRateLimit: true, fetch: boundedRpcFetch });
    const addresses = {
      owner,
      collateral: getAssociatedTokenAddressSync(new PublicKey(asset.collateralMint), owner, false, TOKEN_2022_PROGRAM_ID),
      pt: getAssociatedTokenAddressSync(new PublicKey(series.ptMint), owner),
      dr: getAssociatedTokenAddressSync(new PublicKey(series.drMint), owner),
    };
    const unit = 10n ** BigInt(asset.decimals);
    assert.equal(fundAttempted, false, 'Harness attempted to fund the browser wallet more than once.');
    fundAttempted = true;
    await persist('fund-requested', { funding: { ...progress.funding, attempts: 1 } });
    const fundingSignature = await fundBrowserOwner({ ...options, manifest, owner: owner.toBase58() });
    currentStage = 'fund-signature-returned';
    await persist(currentStage, { transactions: { ...progress.transactions, fund: { signature: fundingSignature, confirmationStatus: 'operator-confirmed-pending-independent-proof' } } });
    await new Promise((resolveWait) => setTimeout(resolveWait, 750));
    const fundingReceipt = await confirmed(connection, fundingSignature);
    const fundedSolLamports = await connection.getBalance(owner, 'confirmed');
    const fundedCollateralRaw = await rawBalance(connection, addresses.collateral);
    assert.equal(fundedSolLamports, SOL_FUND_LAMPORTS, 'Temporary wallet did not receive exactly 0.006 test SOL.');
    assert.equal(fundedCollateralRaw, TOKEN_FUND_UI * unit, 'Temporary wallet did not receive exactly 10 test stock tokens.');
    currentStage = 'funding-confirmed';
    await persist(currentStage, {
      funding: { ...progress.funding, confirmedTokenRaw: fundedCollateralRaw.toString(), confirmedSolLamports: fundedSolLamports },
      transactions: { ...progress.transactions, fund: fundingReceipt },
    });

    // The operator CLI and independent verifier share this machine's public-RPC
    // IP budget with Chromium. Let their burst clear before the browser action.
    await new Promise((resolveWait) => setTimeout(resolveWait, 12_000));

    async function submitThroughUi(button, receiptLabel) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const sendsBefore = rpcSends;
        await button.click();
        const deadline = Date.now() + UI_EXPECT_TIMEOUT_MS;
        let retry = false;
        while (Date.now() < deadline) {
          const first = page.locator('.wallet-receipts article').first();
          if (await first.count() && (await first.innerText()).includes(receiptLabel)) return;
          const alert = page.locator('.p-error[role="alert"]');
          if (await alert.count() && await button.isEnabled()) {
            const error = await alert.innerText();
            if (attempt === 0 && /\b(?:429|503)\b/.test(error) && rpcSends === sendsBefore) {
              progress.preSubmissionRetries = [...(progress.preSubmissionRetries ?? []),
                { action: receiptLabel, reason: 'transient RPC rejection before sendTransaction', observedAt: new Date().toISOString() }];
              await persist(currentStage);
              await new Promise((resolveWait) => setTimeout(resolveWait, 12_000));
              retry = true;
              break;
            }
            throw new Error(`Browser ${receiptLabel} failed: ${error}`);
          }
          await new Promise((resolveWait) => setTimeout(resolveWait, 250));
        }
        if (!retry) throw new Error(`Browser ${receiptLabel} receipt was not confirmed; refusing an ambiguous replay.`);
      }
      throw new Error(`Browser ${receiptLabel} did not recover from the bounded pre-submission retry.`);
    }

    await page.getByRole('button', { name: 'Refresh balances' }).click();
    await uiExpect(page.locator('.wallet-balances div').nth(0).locator('b')).toHaveText('10');
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await page.getByLabel(/^Deposit TestKOx/).fill(AMOUNT_UI);
    await submitThroughUi(page.getByRole('button', { name: /Split into PT \+ DR/ }), 'deposit');
    await uiExpect(page.locator('.wallet-receipts article').first()).toContainText('deposit');
    const splitSignature = (await page.locator('.wallet-receipts article').first().locator('code').textContent())?.trim();
    assert.ok(splitSignature, 'Split signature was not visible.');
    currentStage = 'split-signature-visible';
    await persist(currentStage, { transactions: { ...progress.transactions, split: { signature: splitSignature, confirmationStatus: 'ui-confirmed-pending-independent-proof' } } });
    await uiExpect(page.locator('.wallet-receipts article').first().locator('a')).toHaveAttribute('href', `https://explorer.solana.com/tx/${splitSignature}?cluster=devnet`);
    await uiExpect(page.locator('.wallet-balances div').nth(0).locator('b')).toHaveText('9');
    await uiExpect(page.locator('.wallet-balances div').nth(1).locator('b')).toHaveText('1');
    await uiExpect(page.locator('.wallet-balances div').nth(2).locator('b')).toHaveText('1');
    await new Promise((resolveWait) => setTimeout(resolveWait, 750));
    const splitReceipt = await confirmed(connection, splitSignature, true);
    const afterSplit = await exactBalances(connection, addresses);
    assert.equal(afterSplit.collateralRaw, 9n * unit);
    assert.equal(afterSplit.ptRaw, unit);
    assert.equal(afterSplit.drRaw, unit);
    currentStage = 'split-confirmed';
    await persist(currentStage, { transactions: { ...progress.transactions, split: splitReceipt },
      afterSplit: serializableBalances(afterSplit) });

    await new Promise((resolveWait) => setTimeout(resolveWait, 12_000));

    await page.getByRole('button', { name: 'Redeem', exact: true }).click();
    await page.getByLabel(/^Matching pair amount/).fill(AMOUNT_UI);
    await submitThroughUi(page.getByRole('button', { name: /Combine & return stock/ }), 'recombine');
    await uiExpect(page.locator('.wallet-receipts article').first()).toContainText('recombine');
    const recombineSignature = (await page.locator('.wallet-receipts article').first().locator('code').textContent())?.trim();
    assert.ok(recombineSignature && recombineSignature !== splitSignature, 'Recombine signature was missing or repeated.');
    currentStage = 'recombine-signature-visible';
    await persist(currentStage, { transactions: { ...progress.transactions, recombine: { signature: recombineSignature, confirmationStatus: 'ui-confirmed-pending-independent-proof' } } });
    await uiExpect(page.locator('.wallet-balances div').nth(0).locator('b')).toHaveText('10');
    await uiExpect(page.locator('.wallet-balances div').nth(1).locator('b')).toHaveText('0');
    await uiExpect(page.locator('.wallet-balances div').nth(2).locator('b')).toHaveText('0');
    await new Promise((resolveWait) => setTimeout(resolveWait, 750));
    const recombineReceipt = await confirmed(connection, recombineSignature, true);
    const final = await exactBalances(connection, addresses);
    assert.equal(final.collateralRaw, TOKEN_FUND_UI * unit);
    assert.equal(final.ptRaw, 0n);
    assert.equal(final.drRaw, 0n);
    assert.ok(rpcRequests.length > 0, 'Browser made no genuine requests to the pinned devnet RPC.');
    assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join('; ')}`);

    currentStage = 'complete';
    await persist(currentStage, {
      status: 'complete',
      completedAt: new Date().toISOString(),
      transactions: { fund: fundingReceipt, split: splitReceipt, recombine: recombineReceipt },
      afterSplit: serializableBalances(afterSplit),
      final: serializableBalances(final),
      assertions: { noClockControls: true, faucetUiAbsent: true, devnetExplorerLinks: true,
        exactRpcBalances: true, browserPageErrors: 0 },
    });
    process.stdout.write(`${JSON.stringify({ ok: true, receipt: options.receiptPath, ...progress }, null, 2)}\n`);
  } catch (error) {
    const failure = { message: publicError(error, sensitivePaths) };
    if (page) {
      try { failure.uiText = (await page.locator('body').innerText({ timeout: 5_000 })).slice(0, 12_000); } catch { failure.uiText = 'Browser body text unavailable.'; }
      const screenshotPath = `${options.receiptPath}.failure.png`;
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        failure.browserScreenshot = basename(screenshotPath);
        failure.screenshotBoundary = 'Browser app viewport only; no terminal or private state rendered.';
      } catch { failure.browserScreenshot = null; }
    }
    await persist(currentStage, { status: 'failed', failedAt: new Date().toISOString(), failure });
    throw new Error(`${failure.message} Public partial receipt: ${options.receiptPath}`);
  } finally {
    await browser?.close().catch(() => undefined);
    await stopChild(vite);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
