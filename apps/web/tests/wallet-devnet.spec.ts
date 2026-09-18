import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import type { WalletAccount } from '@wallet-standard/base';
import { PublicKey, Transaction } from '@solana/web3.js';
import { DIVIDENDX_IDL, DIVIDENDX_PROGRAM_ID, configPda } from '@dividendx/transaction-sdk';
import type { CompatibleWallet, LocalManifest } from '../src/wallet/types';
import {
  DEFAULT_DEVNET_RPC_URL,
  DEVNET_DEPLOYMENT_DOMAIN_HEX,
  DEVNET_GENESIS_HASH,
  resolveRuntimeConfig,
  runtimePost,
  validateManifestShape,
} from '../src/wallet/runtime';
import { DEVNET_CHAIN, signLegacyTransaction } from '../src/wallet/wallet-standard';

const port = 4194;
const origin = `http://127.0.0.1:${port}`;
const config = resolveRuntimeConfig({ VITE_DIVIDENDX_NETWORK: 'devnet' });
const configDiscriminator = Uint8Array.from(DIVIDENDX_IDL.accounts!.find((account) => account.name === 'Config')!.discriminator);
let server: ChildProcess | undefined;

function encodedConfig(domainHex = DEVNET_DEPLOYMENT_DOMAIN_HEX) {
  return Buffer.concat([configDiscriminator, Buffer.alloc(32), Buffer.from(domainHex, 'hex'), Buffer.from([255])]).toString('base64');
}

function devnetManifest(overrides: Partial<LocalManifest> = {}): LocalManifest {
  return {
    schemaVersion: 1,
    kind: 'devnet',
    rpcUrl: DEFAULT_DEVNET_RPC_URL,
    genesisHash: DEVNET_GENESIS_HASH,
    programId: DIVIDENDX_PROGRAM_ID.toBase58(),
    deploymentDomainHex: DEVNET_DEPLOYMENT_DOMAIN_HEX,
    runtimeId: 'public-devnet-2026-09-18',
    clockControl: false,
    faucetEnabled: false,
    assets: [{
      id: 'devnet-test', company: 'Test company', symbol: 'TestSTOCK', issuerLabel: 'Devnet test profile', issuerIdHex: '01'.repeat(32), decimals: 8,
      collateralMint: PublicKey.default.toBase58(), assetPolicy: PublicKey.default.toBase58(),
      series: [{ year: 2027, address: PublicKey.default.toBase58(), accumulator: PublicKey.default.toBase58(), ptMint: PublicKey.default.toBase58(), drMint: PublicKey.default.toBase58(), vault: PublicKey.default.toBase58() }],
    }],
    ...overrides,
  };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server?.exitCode !== null) throw new Error(`Devnet test server exited with ${server?.exitCode}.`);
    try { if ((await fetch(`${origin}/app/`)).ok) return; } catch { /* server is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Devnet test server did not start.');
}

test.beforeAll(async () => {
  server = spawn('./node_modules/.bin/vite', ['--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, VITE_DIVIDENDX_NETWORK: 'devnet' },
    stdio: 'ignore',
  });
  await waitForServer();
});

test.afterAll(() => { server?.kill('SIGTERM'); });

async function mockDevnetRpc(page: Page, overrides: { genesisHash?: string; deploymentDomainHex?: string } = {}) {
  await page.route('https://api.devnet.solana.com/**', async (route) => {
    const request = route.request().postDataJSON() as { id: number; method: string; params?: unknown[] } | { id: number; method: string; params?: unknown[] }[];
    const answer = (entry: { id: number; method: string; params?: unknown[] }) => {
      let result: unknown;
      if (entry.method === 'getGenesisHash') result = overrides.genesisHash ?? DEVNET_GENESIS_HASH;
      else if (entry.method === 'getAccountInfo') result = { context: { slot: 10 }, value: { data: ['', 'base64'], executable: true, lamports: 1, owner: 'BPFLoaderUpgradeab1e11111111111111111111111', rentEpoch: 0, space: 0 } };
      else if (entry.method === 'getMultipleAccounts') {
        const addresses = entry.params?.[0] as string[];
        const isConfig = addresses?.length === 1 && addresses[0] === configPda().address.toBase58();
        result = { context: { slot: 10 }, value: isConfig ? [{ data: [encodedConfig(overrides.deploymentDomainHex), 'base64'], executable: false, lamports: 1, owner: DIVIDENDX_PROGRAM_ID.toBase58(), rentEpoch: 0, space: 73 }] : addresses.map(() => null) };
      } else result = null;
      return { jsonrpc: '2.0', id: entry.id, result };
    };
    await route.fulfill({ json: Array.isArray(request) ? request.map(answer) : answer(request) });
  });
}

function installRetryWallet(page: Page) {
  return page.addInitScript(() => {
    window.addEventListener('wallet-standard:app-ready', ((event: Event) => {
      const account = { address: '11111111111111111111111111111111', publicKey: new Uint8Array(32), chains: ['solana:devnet'], features: ['solana:signTransaction'], label: 'Devnet test account' };
      let attempts = 0;
      const wallet = {
        version: '1.0.0', name: 'Retry Devnet Wallet', icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains: ['solana:devnet'], accounts: [],
        features: {
          'standard:connect': { version: '1.0.0', connect: async () => { attempts += 1; if (attempts === 1) throw new Error('User rejected devnet connection.'); return { accounts: [account] }; } },
          'standard:events': { version: '1.0.0', on: () => () => undefined },
          'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'], signTransaction: async () => [] },
        },
      };
      (event as Event & { detail: { register: (registered: unknown) => void } }).detail.register(wallet);
    }) as EventListener);
  });
}

test('wrong manifest RPC endpoint is rejected before any wallet prompt', async ({ page }) => {
  await page.route(`${origin}/api/devnet/manifest`, (route) => route.fulfill({ json: devnetManifest({ rpcUrl: 'https://api.mainnet-beta.solana.com' }) }));
  await page.goto(`${origin}/app/`);
  await expect(page.getByTestId('runtime-error')).toContainText('RPC endpoint does not match');
  await expect(page.getByTestId('temporary-wallet')).toHaveCount(0);
});

test('manifest clock control is rejected before any wallet prompt', async ({ page }) => {
  await page.route(`${origin}/api/devnet/manifest`, (route) => route.fulfill({ json: devnetManifest({ clockControl: true }) }));
  await page.goto(`${origin}/app/`);
  await expect(page.getByTestId('runtime-error')).toContainText('cannot expose clock control');
  await expect(page.getByTestId('temporary-wallet')).toHaveCount(0);
});

test('pinned manifest rejects an RPC returning another genesis before wallet controls', async ({ page }) => {
  await page.route(`${origin}/api/devnet/manifest`, (route) => route.fulfill({ json: devnetManifest() }));
  await mockDevnetRpc(page, { genesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' });
  await page.goto(`${origin}/app/`);
  await expect(page.getByTestId('runtime-error')).toContainText('RPC genesis does not match');
  await expect(page.getByTestId('temporary-wallet')).toHaveCount(0);
});

test('pinned manifest rejects the wrong onchain config domain before wallet controls', async ({ page }) => {
  await page.route(`${origin}/api/devnet/manifest`, (route) => route.fulfill({ json: devnetManifest() }));
  await mockDevnetRpc(page, { deploymentDomainHex: '00'.repeat(32) });
  await page.goto(`${origin}/app/`);
  await expect(page.getByTestId('runtime-error')).toContainText('Config deployment domain does not match');
  await expect(page.getByTestId('temporary-wallet')).toHaveCount(0);
});

test('verified devnet has no clock controls and wallet rejection can be retried', async ({ page }) => {
  await installRetryWallet(page);
  await page.route(`${origin}/api/devnet/manifest`, (route) => route.fulfill({ json: devnetManifest() }));
  await mockDevnetRpc(page);
  await page.goto(`${origin}/app/`);
  await expect(page.getByLabel('Verified runtime')).toContainText('Verified Solana devnet');
  await expect(page.getByText('Annual lifecycle controls')).toHaveCount(0);
  await expect(page.getByText('Network-wide test dates')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Request test SOL/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry Devnet Wallet' }).click();
  await expect(page.getByRole('alert')).toContainText('User rejected devnet connection');
  await page.getByRole('button', { name: 'Retry Devnet Wallet' }).click();
  await expect(page.getByRole('status')).toContainText('connected for Solana devnet signing');
});

test('devnet configuration pins identity, blocks advance, and passes the chain to signing', async () => {
  expect(() => validateManifestShape(devnetManifest({ kind: 'surfnet' }), config)).toThrow('not the configured Solana devnet');
  expect(() => validateManifestShape(devnetManifest({ wsUrl: 'ws://127.0.0.1:54321' }), config)).toThrow('cannot configure a WebSocket endpoint');
  expect(() => validateManifestShape({ ...devnetManifest(), deploymentDomainHex: undefined }, config)).toThrow('Deployment domain must be exactly 32 bytes of hex');
  expect(() => validateManifestShape(devnetManifest({ clockControl: true }), config)).toThrow('cannot expose clock control');
  expect(() => resolveRuntimeConfig({ VITE_DIVIDENDX_NETWORK: 'devnet', VITE_DIVIDENDX_DEVNET_RPC_URL: 'http://api.devnet.solana.com' })).toThrow('HTTPS');
  await expect(runtimePost(devnetManifest(), '/advance', {}, config)).rejects.toThrow('does not allow date controls');
  await expect(runtimePost(devnetManifest(), '/faucet', {}, config)).rejects.toThrow('test faucet is unavailable');

  const account = { address: PublicKey.default.toBase58(), publicKey: PublicKey.default.toBytes(), chains: [DEVNET_CHAIN], features: ['solana:signTransaction'] } as WalletAccount;
  let signedChain: string | undefined;
  const wallet = {
    version: '1.0.0', name: 'Signing test', icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains: [DEVNET_CHAIN], accounts: [account],
    features: {
      'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [account] }) },
      'standard:events': { version: '1.0.0', on: () => () => undefined },
      'solana:signTransaction': {
        version: '1.0.0', supportedTransactionVersions: ['legacy'],
        signTransaction: async (...inputs: readonly { chain?: string; transaction: Uint8Array }[]) => inputs.map((input) => { signedChain = input.chain; return { signedTransaction: input.transaction }; }),
      },
    },
  } as unknown as CompatibleWallet;
  const transaction = new Transaction({ feePayer: PublicKey.default, recentBlockhash: PublicKey.default.toBase58() });
  await signLegacyTransaction(wallet, account, transaction, 'devnet');
  expect(signedChain).toBe(DEVNET_CHAIN);
});
