import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getMint, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

// Requires a fresh local runtime. This uses the actual UI, without wallet/RPC mocks.
const base = 'http://127.0.0.1:4174';
console.log('Review: reading fresh runtime manifest');
const manifest = await (await fetch('http://127.0.0.1:4180/manifest', { signal: AbortSignal.timeout(10_000) })).json();
const asset = manifest.assets.find((value) => value.id === 'xstocks-test-kox');
assert(asset);
const series = asset.series[0];
const connection = new Connection(manifest.rpcUrl, { commitment: 'confirmed', fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }) });
const raw = 10n ** BigInt(asset.decimals);
console.log('Review: checking fresh vault through RPC');
assert.equal((await getAccount(connection, new PublicKey(series.vault), 'confirmed', TOKEN_2022_PROGRAM_ID)).amount, 0n, 'Restart the local runtime before this review.');
console.log('Review: launching browser');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
let expectedRpcStall = false;
const receipts = new Set();
const steps = [];
const a = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const b = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
for (const page of [a, b]) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => { if (event.type() === 'error' && !expectedRpcStall) errors.push(event.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
}
async function step(label, work) {
  console.log(`Review: ${label}`);
  await work();
  steps.push(label);
}
async function captureReceipts(page) {
  for (const signature of await page.locator('.wallet-receipts article code').allTextContents()) receipts.add(signature.trim());
}
async function settled(page) {
  await expect(page.getByRole('button', { name: 'Request test SOL + TestKOx', exact: true })).toBeEnabled({ timeout: 150_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await captureReceipts(page);
}
async function balances(page, amounts) {
  for (let index = 0; index < amounts.length; index++) {
    if (amounts[index] !== undefined) await expect(page.locator('.wallet-balances > div b').nth(index)).toHaveText(amounts[index], { timeout: 30_000 });
  }
}
async function screenshots(page, name) {
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow at ${width}`);
    if (width === 1440 || width === 390) await page.screenshot({ path: new URL(`wallet-${name}-${width}.png`, import.meta.url).pathname, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
try {
  await step('Connect two disposable browser wallets and fund real token accounts', async () => {
    for (const page of [a, b]) {
      await page.goto(`${base}/app/`);
      await expect(page.getByTestId('temporary-wallet')).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
      await page.getByTestId('temporary-wallet').click();
      await expect(page.locator('.wallet-connect code')).toBeVisible();
      await page.getByRole('button', { name: 'Request test SOL + TestKOx', exact: true }).click();
      await settled(page);
      await balances(page, ['100', '0', '0']);
    }
  });
  const ownerA = new PublicKey((await a.locator('.wallet-connect code').textContent()).trim());
  const ownerB = new PublicKey((await b.locator('.wallet-connect code').textContent()).trim());
  assert(!ownerA.equals(ownerB));
  await screenshots(a, 'market');
  await step('Deposit 100 stock tokens and issue actual PT and DR', async () => {
    await a.getByRole('button', { name: 'Split', exact: true }).click();
    await a.getByLabel('Deposit TestKOx').fill('100');
    await screenshots(a, 'split');
    await a.getByRole('button', { name: 'Split into PT + DR' }).click();
    await settled(a);
    await balances(a, ['0', '100', '100']);
  });
  await step('Recombine 10 matching claims before finalization', async () => {
    await a.getByRole('button', { name: 'Redeem', exact: true }).click();
    await a.getByLabel('Matching pair amount').fill('10');
    await a.getByRole('button', { name: 'Combine & return stock' }).click();
    await settled(a);
    await balances(a, ['10', '90', '90']);
  });
  await step('Transfer PT and DR independently to the second wallet', async () => {
    for (const [index, side, amount] of [[0, 'PT', '20'], [1, 'DR', '40']]) {
      const card = a.locator('.transfer-grid article').nth(index);
      await card.getByLabel('Recipient wallet').fill(ownerB.toBase58());
      await card.getByLabel(`${side} amount`).fill(amount);
      await card.getByRole('button', { name: `Transfer ${side}` }).click();
      await settled(a);
    }
    await balances(a, ['10', '70', '50']);
    await b.getByRole('button', { name: 'Refresh balances', exact: true }).click();
    await balances(b, ['100', '20', '40']);
  });
  await step('Close funding and record four synthetic test dividends', async () => {
    await a.getByText('Network-wide test dates', { exact: true }).click();
    await a.getByRole('button', { name: 'start year', exact: true }).click();
    await settled(a);
    await expect(a.locator('.wallet-phase')).toHaveText('Collecting dividends');
    await a.getByRole('button', { name: 'Split', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Split into PT + DR' })).toBeDisabled();
    await a.getByRole('button', { name: 'record dividends', exact: true }).click();
    await settled(a);
    await expect(a.getByRole('status')).toContainText(/four|4/i);
  });
  await step('Distinguish maturity from finalized redemption', async () => {
    await a.getByRole('button', { name: 'end year', exact: true }).click();
    await settled(a);
    await expect(a.locator('.wallet-phase')).toHaveText('Matured · awaiting finalization');
    await a.getByRole('button', { name: 'Redeem', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Redeem PT' })).toHaveCount(0);
    await a.getByRole('button', { name: 'finalize', exact: true }).click();
    await settled(a);
    await expect(a.locator('.wallet-phase')).toHaveText('Ready to redeem');
    await b.getByRole('button', { name: 'Refresh balances', exact: true }).click();
    await expect(b.locator('.wallet-phase')).toHaveText('Ready to redeem');
    await a.getByText('Network-wide test dates', { exact: true }).click();
    await screenshots(a, 'redeem');
  });
  await step('Require explicit consent for closing a zero-output DR fragment', async () => {
    const card = a.locator('.redemption-grid article').nth(1);
    await card.getByLabel('Claim amount').fill('0.00000001');
    await expect(card.getByRole('button', { name: 'Close zero-value DR' })).toBeDisabled();
    await card.getByRole('checkbox').check();
    await expect(card.getByRole('button', { name: 'Close zero-value DR' })).toBeEnabled();
    // Do not burn it: Max must clear consent and retain the entire claim balance.
    await card.getByRole('button', { name: 'Max', exact: true }).click();
    await expect(card.getByRole('checkbox')).toHaveCount(0);
  });
  await step('Both holders redeem stock exposure and dividend rights independently', async () => {
    for (const page of [b, a]) {
      await page.getByRole('button', { name: 'Redeem', exact: true }).click();
      for (const [index, side] of [[0, 'PT'], [1, 'DR']]) {
        const card = page.locator('.redemption-grid article').nth(index);
        await card.getByRole('button', { name: 'Max', exact: true }).click();
        await card.getByRole('button', { name: `Redeem ${side}` }).click();
        await settled(page);
      }
      await balances(page, [undefined, '0', '0']);
    }
  });
  const [vault, pt, dr, stockA, stockB] = await Promise.all([
    getAccount(connection, new PublicKey(series.vault), 'confirmed', TOKEN_2022_PROGRAM_ID),
    getMint(connection, new PublicKey(series.ptMint)),
    getMint(connection, new PublicKey(series.drMint)),
    getAccount(connection, getAssociatedTokenAddressSync(new PublicKey(asset.collateralMint), ownerA, false, TOKEN_2022_PROGRAM_ID), 'confirmed', TOKEN_2022_PROGRAM_ID),
    getAccount(connection, getAssociatedTokenAddressSync(new PublicKey(asset.collateralMint), ownerB, false, TOKEN_2022_PROGRAM_ID), 'confirmed', TOKEN_2022_PROGRAM_ID),
  ]);
  assert.equal(vault.amount, 0n);
  assert.equal(pt.supply, 0n);
  assert.equal(dr.supply, 0n);
  assert.equal(stockA.amount + stockB.amount, 200n * raw);
  const statuses = (await connection.getSignatureStatuses([...receipts], { searchTransactionHistory: true })).value;
  assert(receipts.size >= 15);
  for (const status of statuses) { assert.equal(status?.err, null); assert(['confirmed', 'finalized'].includes(status.confirmationStatus)); }
  await step('A stalled background RPC marks balances stale and manual refresh recovers', async () => {
    expectedRpcStall = true;
    const rpcPattern = `${manifest.rpcUrl}/**`;
    // Longer than the 9s polling interval: a later poll must not hide this timeout.
    await a.route(rpcPattern, () => {});
    await a.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(a.getByTestId('stale-balances')).toBeVisible({ timeout: 25_000 });
    await expect(a.locator('.redemption-grid').getByLabel('Claim amount').first()).toBeDisabled();
    await a.unroute(rpcPattern);
    await a.getByRole('button', { name: 'Refresh balances', exact: true }).click();
    await expect(a.getByTestId('stale-balances')).toHaveCount(0, { timeout: 25_000 });
    await balances(a, [undefined, '0', '0']);
    expectedRpcStall = false;
  });
  await step('Reload discards the temporary wallet and preserves onchain settlement', async () => {
    await a.reload();
    await expect(a.getByTestId('temporary-wallet')).toBeVisible();
    await expect(a.locator('.wallet-connect code')).toHaveCount(0);
    assert.equal(await a.evaluate(() => localStorage.length + sessionStorage.length), 0);
  });
  assert.deepEqual(errors, []);
  await writeFile(new URL('../../../planning/evidence/wallet-browser-review-2026-09-17.json', import.meta.url), JSON.stringify({
    reviewedAt: new Date().toISOString(), status: 'pass', kind: 'real local SBF browser flow',
    runtimeId: manifest.runtimeId, genesisHash: manifest.genesisHash, asset: asset.id,
    browser: 'Chromium', wallet: 'memory-only test Wallet Standard signer; no installed extension tested',
    owners: [ownerA.toBase58(), ownerB.toBase58()], steps, widths: [1440, 1024, 768, 390],
    finalRaw: { vault: vault.amount.toString(), ptSupply: pt.supply.toString(), drSupply: dr.supply.toString(), stockA: stockA.amount.toString(), stockB: stockB.amount.toString() },
    confirmedSignatures: [...receipts], errors,
  }, null, 2) + '\n');
  console.log(`PASS actual browser annual flow; ${receipts.size} confirmed displayed receipts; exact raw conservation; four widths; no errors.`);
} catch (error) {
  await a.screenshot({ path: '/tmp/dividendx-wallet-review-failure.png', fullPage: true });
  console.error('Current alerts:', await a.getByRole('alert').allTextContents(), 'Browser errors:', errors);
  throw error;
} finally { await browser.close(); }
