import { expect, test, type Page } from '@playwright/test';
import { Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { DIVIDENDX_IDL, DIVIDENDX_PROGRAM_ID, configPda } from '@dividendx/transaction-sdk';
import { formatStock, parseStockAmount } from '../src/wallet/amounts';
import { confirmedRuntimeSignatures, fetchWalletSeries } from '../src/wallet/chain';
import { createBoundedRpcFetch, createDevnetRpcFetch, createLocalConnection, RequestScheduler, resolveRuntimeConfig, RuntimeRequestError, runtimePost, validateManifestShape } from '../src/wallet/runtime';
import type { LocalManifest } from '../src/wallet/types';
import { createInventoryFixture, type InventoryFixture } from './inventory-fixtures';
import { addOpenSeriesQuotes } from './wallet-quote-fixtures';
import catalog from '../../../packages/demo-fixtures/catalog.json' with { type: 'json' };

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

async function mockInventoryRuntime(page: Page, fixture: InventoryFixture, options: {
  getBalance?: (owner: string) => number | Promise<number>;
  beforeAccounts?: (addresses: string[]) => void | Promise<void>;
} = {}) {
  await page.route('http://127.0.0.1:4180/manifest', (route) => route.fulfill({
    json: { ...manifest(), faucetEnabled: true, assets: fixture.manifest.assets },
    headers: { 'Access-Control-Allow-Origin': '*' },
  }));
  await page.route('http://127.0.0.1:8899/', async (route) => {
    const input = route.request().postDataJSON() as { id: number; method: string; params?: unknown[] } | { id: number; method: string; params?: unknown[] }[];
    const answer = async (entry: { id: number; method: string; params?: unknown[] }) => {
      let result: unknown = null;
      if (entry.method === 'getGenesisHash') result = 'local-genesis-test';
      else if (entry.method === 'getBalance') {
        try { result = { context: { slot: 123 },
          value: await options.getBalance?.((entry.params?.[0] as string) ?? '') ?? 0 }; }
        catch { return { jsonrpc: '2.0', id: entry.id, error: { code: -32000, message: 'RPC balance unavailable' } }; }
      }
      else if (entry.method === 'getAccountInfo') result = { context: { slot: 123 }, value: {
        data: ['', 'base64'], executable: true, lamports: 1, owner: 'BPFLoaderUpgradeab1e11111111111111111111111', rentEpoch: 0, space: 0,
      } };
      else if (entry.method === 'getMultipleAccounts') {
        const addresses = entry.params?.[0] as string[];
        await options.beforeAccounts?.(addresses);
        const values = addresses.length === 1 && addresses[0] === configPda().address.toBase58()
          ? [{ data: [configData, 'base64'], executable: false, lamports: 1,
            owner: DIVIDENDX_PROGRAM_ID.toBase58(), rentEpoch: 0, space: 73 }]
          : addresses.map((address) => {
            const info = fixture.accounts.get(address);
            return info ? { data: [info.data.toString('base64'), 'base64'], executable: info.executable,
              lamports: info.lamports, owner: info.owner.toBase58(), rentEpoch: info.rentEpoch,
              space: info.data.length } : null;
          });
        result = { context: { slot: 123 }, value: values };
      }
      return { jsonrpc: '2.0', id: entry.id, result };
    };
    await route.fulfill({ json: Array.isArray(input) ? await Promise.all(input.map(answer)) : await answer(input),
      headers: { 'Access-Control-Allow-Origin': '*' } });
  });
}

function catalogManifest() {
  const base = manifest();
  const original = base.assets[0]!;
  return { ...base, assets: [
    { ...original, id: 'xstocks-test-kox', symbol: 'TestKOx', issuerLabel: 'xStocks test profile' },
    { ...original, id: 'backpack-test-mu', company: 'Micron', symbol: 'TestMU', issuerLabel: 'Backpack/Trek test profile', decimals: 6 },
    { ...original, id: 'ondo-test-ibm', company: 'IBM', symbol: 'TestIBMon', issuerLabel: 'Ondo test profile', decimals: 9 },
  ] };
}

async function mockCatalogRuntime(page: Page) {
  await page.route('http://127.0.0.1:4180/manifest', (route) => route.fulfill({ json: catalogManifest(), headers: { 'Access-Control-Allow-Origin': '*' } }));
  await mockReadyRpc(page);
}

test('all 15 verified profile IDs enable one market row each', async ({ page }) => {
  const ids = [
    'xstocks-test-kox', 'xstocks-test-aapl', 'xstocks-test-msft', 'xstocks-test-mu',
    'xstocks-test-nke', 'xstocks-test-ibm', 'backpack-test-mu', 'backpack-test-nke',
    'backpack-test-ibm', 'ondo-test-ko', 'ondo-test-aapl', 'ondo-test-msft',
    'ondo-test-mu', 'ondo-test-nke', 'ondo-test-ibm',
  ];
  const base = manifest();
  const assets = catalog.map((candidate, index) => ({
    ...base.assets[0]!, id: ids[index]!, company: candidate.company,
    symbol: `Test${candidate.symbol.replace('.US', '')}`,
    issuerLabel: `${candidate.issuerId} test profile`, decimals: candidate.decimals,
  }));
  await page.route('http://127.0.0.1:4180/manifest', (route) => route.fulfill({
    json: { ...base, assets }, headers: { 'Access-Control-Allow-Origin': '*' },
  }));
  await mockReadyRpc(page);
  await page.goto('/app/');
  const market = page.locator('.wallet-market');
  await expect(page.getByRole('heading', { name: /One stock\..*Two tokens\./ })).toBeVisible();
  await expect(market.locator('.wallet-market-grid button')).toHaveCount(15);
  await expect(market.locator('.wallet-company-dot')).toHaveCount(15);
  expect(await market.locator('.wallet-company-dot').allTextContents()).toEqual(Array(15).fill(''));
  await expect(market.locator('.wallet-market-grid button:enabled')).toHaveCount(15);
  await expect(market.locator('.wallet-market-grid button:disabled')).toHaveCount(0);
  await expect(market.locator('.wallet-company-list > section')).toHaveCount(6);
  const micronIssuers = await market.getByRole('region', { name: 'Micron stock tokens' })
    .locator('.wallet-market-grid button small').allTextContents();
  expect(micronIssuers).toEqual(['Ondo', 'Backpack/Trek', 'xStocks']);
  await expect(page.locator('.wallet-selector')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Split' }).click();
  await expect(page.locator('.wallet-selector select').first().locator('option')).toHaveCount(15);
  const optionValues = await page.locator('.wallet-selector select').first().locator('option').evaluateAll(
    (options) => options.map((option) => (option as HTMLOptionElement).value),
  );
  expect(new Set(optionValues).size).toBe(15);
  expect(new Set(optionValues)).toEqual(new Set(ids));
});

function installTestWallet(page: Page, reject: boolean, owner = PublicKey.default, walletName = 'Test Wallet') {
  return page.addInitScript(({ rejectConnect, address, bytes, name }) => {
    window.addEventListener('wallet-standard:app-ready', ((event: Event) => {
      const account = { address, publicKey: Uint8Array.from(bytes), chains: ['solana:devnet'], features: ['solana:signTransaction'], label: 'Test account' };
      let change: ((properties: { accounts?: typeof account[] }) => void) | undefined;
      const wallet = {
        version: '1.0.0', name: rejectConnect ? 'Rejecting Wallet' : name, icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains: ['solana:devnet'], accounts: [],
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
  }, { rejectConnect: reject, address: owner.toBase58(), bytes: [...owner.toBytes()], name: walletName });
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
  await expect(page.getByTestId('wallet-trigger')).toHaveAccessibleName('Connect wallet');
  await expect(page.getByLabel('Verified runtime')).toContainText('Verified Local SBF sandbox');
  expect(requestCount).toBeGreaterThanOrEqual(3);
});

test('program identity mismatch is clear and never reaches a wallet prompt', async ({ page }) => {
  await page.route('http://127.0.0.1:4180/manifest', (route) => route.fulfill({ json: manifest(PublicKey.default.toBase58()), headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('/app/');
  await expect(page.getByTestId('runtime-error')).toContainText('program identity does not match');
  await expect(page.getByTestId('temporary-wallet')).toHaveCount(0);
  await expect(page.getByLabel('Verified runtime')).toHaveCount(0);
});

test('Market lists 15 researched tokens with only three verified runtime choices', async ({ page }) => {
  await mockCatalogRuntime(page);
  await page.goto('/app/');
  await expect(page.getByLabel('Verified runtime')).toContainText('Verified Local SBF sandbox');
  const market = page.locator('.wallet-market');
  await expect(market).toContainText('15 stock tokens across 6 companies. 3 available in this runtime today.');
  await expect(market.locator('.wallet-company-list > section')).toHaveCount(6);
  await expect(market.locator('.wallet-market-grid button')).toHaveCount(15);
  await expect(market.locator('.wallet-market-grid button:disabled')).toHaveCount(12);
  await expect(market.getByRole('button', { name: /AAPLx/ })).toBeDisabled();
  await expect(page.locator('.wallet-selector')).toHaveCount(0);
  await expect(page.getByTestId('market-position')).toHaveCount(0);
  await expect(page.getByTestId('compact-position')).toHaveCount(0);
  await expect(page.getByText('Verified account details')).toHaveCount(0);
  await expect(page.getByTestId('market-balances')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Explore stock tokens by company.' })).toBeVisible();
  await expect(page.locator('.wallet-connect')).toHaveCount(0);
  await expect(page.locator('.wallet-boundary')).toHaveCount(0);
  await expect(page.getByTestId('wallet-trigger')).toHaveAccessibleName('Connect wallet');
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Split' }).click();
  await expect(page.locator('.wallet-selector select').first().locator('option')).toHaveCount(3);
  const options = await page.locator('.wallet-selector select').first().locator('option').allTextContents();
  expect(options.every((label) => !/Test|test profile/i.test(label))).toBe(true);
  await expect(page.getByTestId('market-position')).toHaveCount(0);
  await expect(page.getByTestId('compact-position')).toBeVisible();
  await expect(page.locator('.wallet-market')).toHaveCount(0);
  await expect(page.getByTestId('connect-to-continue')).toBeVisible();
  await page.getByTestId('connect-to-continue').click();
  await expect(page.getByRole('dialog', { name: 'Connect a wallet' })).toBeVisible();
  await page.getByRole('button', { name: 'Close wallet dialog' }).click();
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByTestId('compact-position')).toBeVisible();
  await expect(page.locator('.wallet-connect')).toHaveCount(0);
  await expect(page.getByTestId('connect-to-continue')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Public Devnet' })).toHaveAttribute('href', '/app/');
  await expect(page.getByRole('link', { name: 'Guided Demos' })).toHaveAttribute('href', '/demos/');
  await expect(page.getByRole('link', { name: /sandbox|rehearsal|annual reference/i })).toHaveCount(0);
});

test('wallet dialog supports keyboard, backdrop, focus return and temporary wallet choice', async ({ page }) => {
  await mockReadyRuntime(page);
  await page.goto('/app/');
  const trigger = page.getByTestId('wallet-trigger');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Connect a wallet' });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('temporary-wallet')).toHaveCount(1);
  for (const name of ['Phantom', 'Solflare', 'Backpack']) {
    await expect(dialog.getByRole('link', { name: `Install ${name}` })).toBeVisible();
  }
  await expect(dialog.getByRole('button', { name: 'Close wallet dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByTestId('temporary-wallet')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator('.wallet-dialog-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Split' }).click();
  await trigger.click();
  await page.getByRole('dialog').getByTestId('temporary-wallet').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).not.toContainText('Wallet disconnected');
  await trigger.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect wallet' }).click();
  await expect(trigger).toHaveAccessibleName('Connect wallet');
});

test('a stock card opens details and hands a disconnected visitor to one wallet dialog', async ({ page }) => {
  await mockCatalogRuntime(page);
  await page.goto('/app/');
  const card = page.getByTestId('market-stock-card').filter({ hasText: 'KOx' });
  await card.click();
  const assetDialog = page.getByTestId('asset-dialog');
  await expect(assetDialog).toBeVisible();
  await expect(assetDialog.getByRole('heading', { name: /Coca-Cola.*KOx/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close stock details' })).toBeFocused();
  await assetDialog.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(assetDialog).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Connect a wallet' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card).toBeFocused();
});

test('Market has no stock selector and stock details return focus to the card', async ({ page }) => {
  await mockCatalogRuntime(page);
  await page.goto('/app/');
  await expect(page.getByRole('combobox', { name: 'Stock token' })).toHaveCount(0);
  const card = page.getByTestId('market-stock-card').filter({ hasText: 'MU.US' });
  await card.click();
  await expect(page.getByTestId('asset-dialog')).toBeVisible();
  await expect(page.getByTestId('asset-dialog').getByRole('heading', { name: /Micron.*MU/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /One stock\..*Two tokens\./ })).toBeVisible();
  await page.getByRole('button', { name: 'Close stock details' }).click();
  await expect(card).toBeFocused();
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Split' }).click();
  await expect(page.getByRole('combobox', { name: 'Stock token' })).toHaveValue('backpack-test-mu');
});

test('wallet navigation, disclosure and dialog fit 390px', async ({ page }) => {
  await mockCatalogRuntime(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/');
  await expect(page.locator('.wallet-market-grid button')).toHaveCount(15);
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  expect(await noOverflow()).toBe(true);
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Split' }).click();
  expect(await noOverflow()).toBe(true);
  await page.getByTestId('wallet-trigger').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await noOverflow()).toBe(true);
  await page.getByRole('button', { name: 'Close wallet dialog' }).click();
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Redeem' }).click();
  expect(await noOverflow()).toBe(true);
});

test('Wallet Standard rejection and disconnect remain explicit', async ({ page }) => {
  await mockReadyRuntime(page);
  await installTestWallet(page, true);
  await page.goto('/app/');
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rejecting Wallet' }).click();
  await expect(page.getByRole('alert')).toContainText('User rejected wallet connection');

  await page.reload();
  await installTestWallet(page, false);
  await page.reload();
  await page.getByTestId('wallet-trigger').click();
  const installed = page.getByRole('dialog').getByRole('button', { name: 'Test Wallet', exact: true });
  await expect(installed.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await installed.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('wallet-trigger')).not.toHaveAccessibleName('Connect wallet');
  await page.evaluate(() => (window as typeof window & { mismatchTestWallet: () => void }).mismatchTestWallet());
  await expect(page.locator('.p-success[role="status"]')).toContainText('Wallet disconnected');
});

test('a connected wallet with no canonical holdings gets an empty inventory and faucet path', async ({ page }) => {
  const fixture = createInventoryFixture();
  let inventoryRead!: () => void;
  const inventorySeen = new Promise<void>((resolve) => { inventoryRead = resolve; });
  await mockInventoryRuntime(page, fixture, { beforeAccounts: (addresses) => { if (addresses.length > 1) inventoryRead(); } });
  await installTestWallet(page, false, fixture.owner);
  await page.goto('/app/');
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Test Wallet', exact: true }).click();
  await inventorySeen;
  await expect(page.getByTestId('market-inventory-status')).toHaveCount(0);
  await expect(page.getByTestId('market-balances')).toHaveCount(0);
  await expect(page.locator('.wallet-selector')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Explore stock tokens by company.' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Split' }).click();
  await expect(page.getByTestId('split-holdings')).toBeVisible();
  await expect(page.getByTestId('empty-inventory')).toBeVisible();
  await expect(page.getByTestId('empty-inventory-faucet')).toBeVisible();
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByTestId('redeem-holdings')).toBeVisible();
  await expect(page.getByTestId('empty-inventory')).toBeVisible();
});

test('canonical stock and claim ATAs appear as supported Split and Redeem holdings', async ({ page }) => {
  const fixture = createInventoryFixture();
  fixture.setHolding(0, { collateral: 2_000_000n, pt: 300_000n, dr: 200_000n });
  await mockInventoryRuntime(page, fixture);
  await installTestWallet(page, false, fixture.owner);
  await page.goto('/app/');
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Test Wallet', exact: true }).click();
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Split' }).click();
  await expect(page.getByTestId('split-holdings')).toContainText('Company 0');
  await expect(page.getByTestId('split-holdings')).toContainText('3'); // 2 raw units at a verified 1.5 stock display factor
  await expect(page.getByTestId('empty-inventory')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByTestId('redeem-holdings')).toContainText('Company 0');
  await expect(page.getByTestId('empty-inventory')).toHaveCount(0);
});

test('Market groups stock once and keeps PT-only and DR-only years and assets distinct', async ({ page }) => {
  const fixture = createInventoryFixture(3, 2);
  fixture.setHolding(0, { collateral: 2_000_000n, pt: 400_000n }, 0);
  fixture.setHolding(0, { dr: 300_000n }, 1);
  fixture.setHolding(1, { pt: 50_000_000n }, 1);
  fixture.setHolding(2, { dr: 700_000_000n }, 0);
  await mockInventoryRuntime(page, fixture);
  await installTestWallet(page, false, fixture.owner);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/');
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Test Wallet', exact: true }).click();
  const home = page.getByTestId('market-balances');
  await expect(home.getByRole('heading', { name: 'Your balances' })).toBeVisible();
  await expect(home.getByTestId('market-balance-asset')).toHaveCount(3);
  await expect(page.locator('.wallet-selector')).toHaveCount(0);
  await expect(page.getByTestId('market-position')).toHaveCount(0);
  await expect(page.getByText('Verified account details')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Explore stock tokens by company.' })).toBeVisible();
  const first = home.getByTestId('market-balance-asset').filter({ hasText: 'Company 0' });
  await expect(first.getByTestId('market-stock-balance')).toContainText('3');
  await expect(first.getByTestId('market-stock-balance')).toHaveCount(1);
  await expect(first.getByTestId('market-balance-series')).toHaveCount(2);
  const firstYear = first.getByTestId('market-balance-series').filter({ hasText: '2027 annual series' });
  await expect(firstYear.getByTestId('market-pt-balance')).toContainText('0.4');
  await expect(firstYear.getByTestId('market-dr-balance')).toContainText('0');
  const secondYear = first.getByTestId('market-balance-series').filter({ hasText: '2028 annual series' });
  await expect(secondYear.getByTestId('market-pt-balance')).toContainText('0');
  await expect(secondYear.getByTestId('market-dr-balance')).toContainText('0.3');
  const ptOnly = home.getByTestId('market-balance-asset').filter({ hasText: 'Company 1' });
  await expect(ptOnly.getByTestId('market-balance-series')).toHaveCount(1);
  await expect(ptOnly.getByTestId('market-balance-series')).toContainText('2028 annual series');
  await expect(ptOnly.getByTestId('market-pt-balance')).toContainText('0.5');
  await expect(ptOnly.getByTestId('market-holding-split')).toHaveCount(0);
  await expect(ptOnly.getByTestId('market-holding-redeem')).toBeVisible();
  const drOnly = home.getByTestId('market-balance-asset').filter({ hasText: 'Company 2' });
  await expect(drOnly.getByTestId('market-balance-series')).toContainText('2027 annual series');
  await expect(drOnly.getByTestId('market-dr-balance')).toContainText('0.7');
  await expect(drOnly.getByTestId('market-holding-split')).toHaveCount(0);
  await expect(drOnly.getByTestId('market-holding-redeem')).toBeVisible();
  await page.screenshot({ path: 'planning/evidence/market-balances-2026-09-20-1440.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'planning/evidence/market-balances-2026-09-20-390.png', fullPage: true });
  await secondYear.getByTestId('market-holding-redeem').click();
  await expect(page.getByRole('combobox', { name: 'Stock token' })).toHaveValue('asset-0');
  await expect(page.getByRole('combobox', { name: 'Annual series' })).toHaveValue('2028');
  await expect(page.getByTestId('compact-position')).toContainText('Company 0');
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Market' }).click();
  await ptOnly.getByTestId('market-holding-redeem').click();
  await expect(page.getByRole('combobox', { name: 'Stock token' })).toHaveValue('asset-1');
  await expect(page.getByRole('combobox', { name: 'Annual series' })).toHaveValue('2028');
});

test('Market keeps inventory errors distinct from an empty wallet and allows retry', async ({ page }) => {
  const fixture = createInventoryFixture();
  const clock = fixture.accounts.get(SYSVAR_CLOCK_PUBKEY.toBase58());
  fixture.accounts.set(SYSVAR_CLOCK_PUBKEY.toBase58(), null);
  await mockInventoryRuntime(page, fixture);
  await installTestWallet(page, false, fixture.owner);
  await page.goto('/app/');
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Test Wallet', exact: true }).click();
  await expect(page.getByTestId('market-inventory-status')).toContainText('Wallet balances could not be checked');
  await expect(page.getByTestId('market-balances')).toHaveCount(0);
  fixture.accounts.set(SYSVAR_CLOCK_PUBKEY.toBase58(), clock!);
  await page.getByRole('button', { name: 'Retry balances' }).click();
  await expect(page.getByTestId('market-inventory-status')).toHaveCount(0);
  await expect(page.getByTestId('market-balances')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Explore stock tokens by company.' })).toBeVisible();
});

test('mock quote accounts are a valid open series before browser race checks', async () => {
  const fixture = createInventoryFixture();
  fixture.setHolding(0, { collateral: 2_000_000n });
  await addOpenSeriesQuotes(fixture);
  const asset = fixture.manifest.assets[0]!;
  const quote = await fetchWalletSeries(fixture.connection, fixture.manifest, asset, asset.series[0]!, fixture.owner);
  expect(quote.collateralRaw).toBe(2_000_000n);
  expect(quote.eligibility.depositsOpen).toBe(true);
});

test('switching holdings keeps the list visible and never enables a stale asset quote', async ({ page }) => {
  const fixture = createInventoryFixture(2);
  fixture.setHolding(0, { collateral: 2_000_000n });
  fixture.setHolding(1, { collateral: 2n * 10n ** BigInt(fixture.manifest.assets[1]!.decimals) });
  await addOpenSeriesQuotes(fixture);
  let holdSecond = false;
  let releaseSecond!: () => void;
  let reachedSecond!: () => void;
  const secondPending = new Promise<void>((resolve) => { reachedSecond = resolve; });
  const secondGate = new Promise<void>((resolve) => { releaseSecond = resolve; });
  let holdFirstAgain = false;
  let releaseFirst!: () => void;
  let reachedFirst!: () => void;
  const firstPending = new Promise<void>((resolve) => { reachedFirst = resolve; });
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  await mockInventoryRuntime(page, fixture, { beforeAccounts: async (addresses) => {
    if (holdSecond && addresses.includes(fixture.manifest.assets[1]!.assetPolicy)) {
      holdSecond = false; reachedSecond(); await secondGate;
    } else if (holdFirstAgain && addresses.includes(fixture.manifest.assets[0]!.assetPolicy)) {
      holdFirstAgain = false; reachedFirst(); await firstGate;
    }
  } });
  await installTestWallet(page, false, fixture.owner);
  await page.goto('/app/');
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Test Wallet', exact: true }).click();
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Split' }).click();
  await expect(page.getByLabel('Deposit Test0')).toBeVisible();
  await page.getByLabel('Deposit Test0').fill('1');
  await expect(page.getByRole('button', { name: 'Split into PT + DR' })).toBeEnabled();

  holdSecond = true;
  await page.getByTestId('split-holdings').getByRole('button', { name: /Company 1/ }).click();
  await secondPending;
  await expect(page.getByTestId('quote-checking')).toBeVisible();
  await expect(page.getByTestId('split-holdings')).toContainText('Company 0');
  await expect(page.getByTestId('split-holdings')).toContainText('Company 1');
  await expect(page.getByLabel('Deposit Test0')).toHaveCount(0);
  const newField = page.getByLabel('Deposit Test1');
  if (await newField.count()) await newField.fill('1');
  const action = page.getByRole('button', { name: 'Split into PT + DR' });
  if (await action.count()) await expect(action).toBeDisabled();
  releaseSecond();
  await expect(newField).toBeVisible();
  await newField.fill('1');
  await expect(page.getByRole('button', { name: 'Split into PT + DR' })).toBeEnabled();

  holdFirstAgain = true;
  await page.getByTestId('split-holdings').getByRole('button', { name: /Company 0/ }).click();
  await firstPending;
  await page.getByTestId('split-holdings').getByRole('button', { name: /Company 1/ }).click();
  releaseFirst();
  await expect(page.getByLabel('Deposit Test1')).toBeVisible();
  await expect(page.getByLabel('Deposit Test0')).toHaveCount(0);
});

test('a late SOL balance from the previous wallet cannot change the new wallet balance', async ({ page }) => {
  const fixture = createInventoryFixture();
  await addOpenSeriesQuotes(fixture);
  const secondOwner = Keypair.generate().publicKey;
  let releaseOld!: () => void;
  let markOld!: () => void;
  const oldPending = new Promise<void>((resolve) => { markOld = resolve; });
  const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
  await mockInventoryRuntime(page, fixture, { getBalance: async (owner) => {
    if (owner === fixture.owner.toBase58()) { markOld(); await oldGate; return 0; }
    if (owner === secondOwner.toBase58()) return 7_000_000;
    return 0;
  } });
  await installTestWallet(page, false, fixture.owner, 'First Wallet');
  await installTestWallet(page, false, secondOwner, 'Second Wallet');
  await page.goto('/app/');
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'First Wallet' }).click();
  await page.getByTestId('market-stock-card').filter({ hasText: 'Test0' }).click();
  await oldPending;
  await expect(page.getByTestId('asset-sol-status')).toContainText('Checking wallet SOL balance');
  await page.getByRole('button', { name: 'Close stock details' }).click();
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect wallet' }).click();
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Second Wallet' }).click();
  await page.getByTestId('market-stock-card').filter({ hasText: 'Test0' }).click();
  await expect(page.getByTestId('asset-get-tokens')).toContainText('Request Test0');
  await expect(page.locator('.wallet-sol-current')).toContainText('0.007000 SOL');
  releaseOld();
  await expect(page.locator('.wallet-sol-current')).toContainText('0.007000 SOL');
});

test('a previous wallet snapshot cannot restore its holdings or enable Split after a wallet switch', async ({ page }) => {
  const fixture = createInventoryFixture();
  fixture.setHolding(0, { collateral: 2_000_000n });
  await addOpenSeriesQuotes(fixture);
  const secondOwner = Keypair.generate().publicKey;
  const firstAta = getAssociatedTokenAddressSync(new PublicKey(fixture.manifest.assets[0]!.collateralMint),
    fixture.owner, false, TOKEN_2022_PROGRAM_ID).toBase58();
  let holdFirst = false;
  let reachedFirst!: () => void;
  let releaseFirst!: () => void;
  const firstPending = new Promise<void>((resolve) => { reachedFirst = resolve; });
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  await mockInventoryRuntime(page, fixture, { beforeAccounts: async (addresses) => {
    if (holdFirst && addresses.includes(firstAta)) { reachedFirst(); await firstGate; }
  } });
  await installTestWallet(page, false, fixture.owner, 'First Wallet');
  await installTestWallet(page, false, secondOwner, 'Second Wallet');
  await page.goto('/app/');
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'First Wallet' }).click();
  await page.getByRole('navigation', { name: 'Wallet actions' }).getByRole('button', { name: 'Split' }).click();
  await expect(page.getByTestId('split-holdings')).toContainText('Company 0');
  await page.getByLabel('Deposit Test0').fill('1');
  await expect(page.getByRole('button', { name: 'Split into PT + DR' })).toBeEnabled();

  holdFirst = true;
  await page.getByRole('button', { name: 'Refresh balances' }).click();
  await firstPending;
  await expect(page.getByTestId('quote-checking')).toBeVisible();
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect wallet' }).click();
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Second Wallet' }).click();
  await expect(page.getByTestId('empty-inventory')).toBeVisible();
  await expect(page.getByTestId('split-holdings')).not.toContainText('Company 0');
  releaseFirst();
  await expect(page.getByTestId('empty-inventory')).toBeVisible();
  await expect(page.getByTestId('split-holdings')).not.toContainText('Company 0');
  const split = page.getByRole('button', { name: 'Split into PT + DR' });
  if (await split.count()) await expect(split).toBeDisabled();
});

test('local stock details explain the session faucet without a public Devnet grant claim', async ({ page }) => {
  const fixture = createInventoryFixture();
  await addOpenSeriesQuotes(fixture);
  let lamports = 0;
  await mockInventoryRuntime(page, fixture, { getBalance: () => lamports });
  await installTestWallet(page, false, fixture.owner);
  await page.goto('/app/');
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Test Wallet', exact: true }).click();
  const card = page.getByTestId('market-stock-card').filter({ hasText: 'Test0' });
  await card.click();
  await expect(page.getByTestId('asset-stock-balance')).toHaveText('0');
  await expect(page.getByTestId('asset-get-tokens')).toContainText('Request Test0');
  await expect(page.getByTestId('asset-sol-status')).toContainText('funds each wallet once per session');
  await expect(page.locator('.wallet-sol-current')).toContainText('0.000000 SOL');
  await page.getByRole('button', { name: 'Close stock details' }).click();
  lamports = 7_000_000;
  await card.click();
  await expect(page.getByTestId('asset-get-tokens')).toContainText('Request Test0');
  await expect(page.getByTestId('asset-sol-status')).toContainText('funds each wallet once per session');
  await expect(page.locator('.wallet-sol-current')).toContainText('0.007000 SOL');
});

test('unknown wallet SOL remains explicit until a successful balance retry', async ({ page }) => {
  const fixture = createInventoryFixture();
  await addOpenSeriesQuotes(fixture);
  let blocked = true;
  await mockInventoryRuntime(page, fixture, { getBalance: () => {
    if (blocked) throw new Error('RPC blocked');
    return 0;
  } });
  await installTestWallet(page, false, fixture.owner);
  await page.goto('/app/');
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Test Wallet', exact: true }).click();
  await page.getByTestId('market-stock-card').filter({ hasText: 'Test0' }).click();
  await expect(page.getByTestId('asset-sol-status')).toContainText('SOL balance unavailable');
  await expect(page.getByTestId('asset-get-tokens')).toBeDisabled();
  blocked = false;
  await page.getByRole('button', { name: 'Retry SOL balance' }).click();
  await expect(page.getByTestId('asset-get-tokens')).toContainText('Request Test0');
  await expect(page.getByTestId('asset-sol-status')).toContainText('funds each wallet once per session');
  await expect(page.getByTestId('asset-get-tokens')).toBeEnabled();
});

test('stock details show an existing scaled holding and a Split path', async ({ page }) => {
  const fixture = createInventoryFixture();
  fixture.setHolding(0, { collateral: 2_000_000n });
  await addOpenSeriesQuotes(fixture);
  await mockInventoryRuntime(page, fixture, { getBalance: () => 7_000_000 });
  await installTestWallet(page, false, fixture.owner);
  await page.goto('/app/');
  await page.getByTestId('wallet-trigger').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Test Wallet', exact: true }).click();
  await page.getByTestId('market-stock-card').filter({ hasText: 'Test0' }).click();
  await expect(page.getByTestId('asset-stock-balance')).toHaveText('3');
  await expect(page.getByTestId('asset-get-tokens')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to Split' }).click();
  await expect(page.getByTestId('asset-dialog')).toHaveCount(0);
  await expect(page.getByTestId('split-holdings')).toContainText('Company 0');
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
