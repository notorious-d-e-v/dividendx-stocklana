import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair, SystemProgram, Transaction, type Connection } from '@solana/web3.js';
import {
  DIVIDENDX_IDL, DIVIDENDX_PROGRAM_ID as SDK_PROGRAM_ID, DividendXInstructions,
} from '@dividendx/transaction-sdk';
import { assertCatalogExpansionState, assertSeparatedAuthorities, toSdkPublicKey } from '../src/bootstrap.js';
import { boundedFetch, parseDevnetRpcUrl } from '../src/config.js';
import {
  ACCEPTED_ELF_SHA256, ADMIN_ID, DEPLOYMENT_DOMAIN_HEX, DEVNET_GENESIS_HASH, HOLDER_SOL_CAP_LAMPORTS,
  HOLDER_TOKEN_CAP_UI, LEGACY_PROFILES, MAINNET_GENESIS_HASH, MAX_CATALOG_EXPANSION_SPEND_LAMPORTS,
  NEW_PROFILES, PROGRAM_ID, PROFILES,
} from '../src/constants.js';
import { verifyDevnetEnvironment } from '../src/environment.js';
import { assertProductionManifestRedacted, parseRegistryManifest } from '../src/manifest.js';
import { loadOrCreateStateSigner } from '../src/private-state.js';
import { routeManifestRequest } from '../src/service.js';
import { assertBootstrapBudget, executeResumableStep, persistedStepConfirmed } from '../src/transactions.js';
import type { PrivateRuntimeState, RegistryManifest } from '../src/types.js';

function manifest(): RegistryManifest {
  return {
    schemaVersion: 1, kind: 'devnet', rpcUrl: 'https://api.devnet.solana.com', genesisHash: DEVNET_GENESIS_HASH,
    programId: PROGRAM_ID.toBase58(), deploymentDomainHex: DEPLOYMENT_DOMAIN_HEX,
    runtimeId: '11111111-2222-4333-8444-555555555555', clockControl: false, faucetEnabled: false,
    assets: PROFILES.map((profile, index) => ({
      ...profile, issuerIdHex: `${index + 1}`.padStart(64, '0'),
      collateralMint: Keypair.generate().publicKey.toBase58(), assetPolicy: Keypair.generate().publicKey.toBase58(),
      series: [{ year: 2027, address: Keypair.generate().publicKey.toBase58(),
        accumulator: Keypair.generate().publicKey.toBase58(), ptMint: Keypair.generate().publicKey.toBase58(),
        drMint: Keypair.generate().publicKey.toBase58(), vault: Keypair.generate().publicKey.toBase58() }],
    })),
  };
}

test('fixed identities match the accepted AMM devnet manifest', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const accepted = JSON.parse(await readFile(resolve(here, '../../../amm-integration/manifests/devnet.example.json'), 'utf8'));
  assert.equal(accepted.expectedGenesisHash, DEVNET_GENESIS_HASH);
  assert.equal(accepted.expectedDividendXUpgradeAuthority, ADMIN_ID.toBase58());
  assert.equal(accepted.deploymentDomainHex, DEPLOYMENT_DOMAIN_HEX);
  assert.equal(accepted.expectedDividendXElfSha256, ACCEPTED_ELF_SHA256);
});

test('package lock matches the isolated package and excludes Surfpool', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, '../..');
  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.name, packageJson.name);
  assert.deepEqual(lock.packages[''].dependencies, packageJson.dependencies);
  assert.deepEqual(lock.packages[''].devDependencies, packageJson.devDependencies);
  assert.equal(lock.packages['node_modules/@solana/surfpool'], undefined);
});

test('RPC configuration is an explicit HTTPS origin', () => {
  assert.equal(parseDevnetRpcUrl('https://api.devnet.solana.com'), 'https://api.devnet.solana.com');
  for (const value of ['http://api.devnet.solana.com', 'https://user@example.com',
    'https://example.com/rpc', 'https://example.com/?token=secret']) assert.throws(() => parseDevnetRpcUrl(value));
});

test('RPC fetch has an actual per-attempt cancellation deadline', async () => {
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  })) as typeof fetch;
  await assert.rejects(boundedFetch(fetcher, 10)('https://example.com'), /timeout|aborted/i);
});

test('mainnet is rejected before any program or config account read', async () => {
  let reads = 0;
  const connection = {
    async getGenesisHash() { return MAINNET_GENESIS_HASH; },
    async getAccountInfo() { reads += 1; throw new Error('must not read'); },
  } as unknown as Connection;
  await assert.rejects(verifyDevnetEnvironment(connection), /PUBLIC_CLUSTER_REFUSED/);
  assert.equal(reads, 0);
});

test('registry rejects stale identities and keeps the exact public schema redacted', () => {
  const current = manifest();
  assert.equal(parseRegistryManifest(current).assets[0]!.symbol, 'TestKOx');
  const legacy = { ...current, assets: current.assets.slice(0, LEGACY_PROFILES.length) };
  assert.equal(parseRegistryManifest(legacy).assets.length, 3);
  assert.equal(parseRegistryManifest(current).assets.length, 15);
  assert.throws(() => parseRegistryManifest({ ...current, assets: current.assets.slice(0, 14) }), /MANIFEST_ASSETS_INVALID/);
  assert.throws(() => parseRegistryManifest({ ...current,
    assets: [current.assets[1], current.assets[0], ...current.assets.slice(2)] }), /MANIFEST_ASSETS_INVALID/);
  assert.throws(() => parseRegistryManifest({ ...legacy,
    assets: [legacy.assets[0], legacy.assets[0], legacy.assets[2]] }), /MANIFEST_ASSETS_INVALID/);
  assert.throws(() => parseRegistryManifest({ ...current, genesisHash: 'stale' }), /MANIFEST_IDENTITY_INVALID/);
  assert.doesNotThrow(() => assertProductionManifestRedacted(current));
  assert.throws(() => assertProductionManifestRedacted({ ...current, stateDir: '/Users/example/.local-tools' } as never));
});

test('admin, faucet, attestor, and mint authorities must be distinct', () => {
  const a = Keypair.generate().publicKey;
  const b = Keypair.generate().publicKey;
  assert.doesNotThrow(() => assertSeparatedAuthorities([a, b]));
  assert.throws(() => assertSeparatedAuthorities([a, b, a]), /AUTHORITY_SEPARATION_REQUIRED/);
});

test('registerAsset encodes a runtime key through the SDK PublicKey constructor', () => {
  const admin = Keypair.generate().publicKey;
  const attestor = Keypair.generate().publicKey;
  const converted = toSdkPublicKey(attestor);
  assert.equal(converted.toBase58(), attestor.toBase58());
  assert.equal(converted.constructor, SDK_PROGRAM_ID.constructor);
  const instruction = new DividendXInstructions(DIVIDENDX_IDL).admin.registerAsset({
    config: Keypair.generate().publicKey, admin, collateralMint: Keypair.generate().publicKey,
    assetPolicy: Keypair.generate().publicKey, systemProgram: SystemProgram.programId,
  }, { issuerId: new Uint8Array(32).fill(1), symbol: 'TestKOx', attestor: converted,
    policyDigest: new Uint8Array(32).fill(2) });
  assert.doesNotThrow(() => new Transaction({ feePayer: admin,
    blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 }).add(instruction).compileMessage());
});

test('bootstrap spend guard enforces the 0.15 SOL aggregate ceiling', () => {
  assert.doesNotThrow(() => assertBootstrapBudget(1_000_000_000n, 850_000_000n));
  assert.throws(() => assertBootstrapBudget(1_000_000_000n, 849_999_999n), /BOOTSTRAP_BUDGET_EXCEEDED/);
  assert.throws(() => assertBootstrapBudget(1n, 2n), /BOOTSTRAP_BUDGET_EXCEEDED/);
});

test('catalog expansion has distinct profiles and a separately bounded spend baseline', () => {
  assert.equal(LEGACY_PROFILES.length, 3);
  assert.equal(NEW_PROFILES.length, 12);
  assert.equal(new Set(PROFILES.map(({ id }) => id)).size, 15);
  assert.equal(new Set(PROFILES.map(({ symbol }) => symbol)).size, 15);
  assert.doesNotThrow(() => assertBootstrapBudget(1_000_000_000n, 700_000_000n,
    MAX_CATALOG_EXPANSION_SPEND_LAMPORTS));
  assert.throws(() => assertBootstrapBudget(1_000_000_000n, 699_999_999n,
    MAX_CATALOG_EXPANSION_SPEND_LAMPORTS), /BOOTSTRAP_BUDGET_EXCEEDED/);
});

test('catalog expansion state preserves original identities and never rebaselines on resume', () => {
  const rpcUrl = 'https://api.devnet.solana.com';
  const legacyKeys = { faucet: 'faucet-old', attestor: 'attestor-old',
    'mint-kox': 'mint-kox-old', 'mint-mu': 'mint-mu-old', 'mint-ibm': 'mint-ibm-old' };
  const expandedKeys = { ...legacyKeys, 'mint-xstocks-aapl': 'mint-aapl-new' };
  const state: PrivateRuntimeState = {
    schema: 'dividendx-devnet-private-state-v1', runtimeId: 'existing-runtime', rpcUrl,
    genesisHash: DEVNET_GENESIS_HASH, programId: PROGRAM_ID.toBase58(), deploymentDomainHex: DEPLOYMENT_DOMAIN_HEX,
    initialAdminLamports: '4000000000', publicKeys: { ...legacyKeys }, steps: {},
  };
  assert.equal(assertCatalogExpansionState(state, rpcUrl, legacyKeys, expandedKeys), 'begin');
  state.publicKeys = expandedKeys;
  state.catalogExpansion = { initialAdminLamports: '3816010520', maxSpendLamports: '300000000' };
  assert.equal(assertCatalogExpansionState(state, rpcUrl, legacyKeys, expandedKeys), 'resume');
  assert.equal(state.initialAdminLamports, '4000000000');
  assert.equal(state.catalogExpansion.initialAdminLamports, '3816010520');
  assert.deepEqual(Object.fromEntries(Object.entries(state.publicKeys).filter(([name]) => name in legacyKeys)), legacyKeys);
  assert.throws(() => assertCatalogExpansionState({ ...state, publicKeys: { ...expandedKeys, 'mint-kox': 'changed' } },
    rpcUrl, legacyKeys, expandedKeys), /STATE_SIGNERS_MISMATCH/);
  assert.throws(() => assertCatalogExpansionState({ ...state,
    catalogExpansion: { ...state.catalogExpansion!, initialAdminLamports: '3816010521' },
    publicKeys: { ...expandedKeys, unknown: 'key' } }, rpcUrl, legacyKeys, expandedKeys), /STATE_SIGNERS_MISMATCH/);
  assert.throws(() => assertCatalogExpansionState({ ...state,
    catalogExpansion: { ...state.catalogExpansion!, maxSpendLamports: '1' as '300000000' } },
    rpcUrl, legacyKeys, expandedKeys), /EXPANSION_BUDGET_INVALID/);
});

test('new mint signer names do not replace existing private signers', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'devnet-runtime-signers-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const legacy = await Promise.all(['mint-kox', 'mint-mu', 'mint-ibm'].map((name) =>
    loadOrCreateStateSigner(directory, name)));
  const before = await Promise.all(['mint-kox', 'mint-mu', 'mint-ibm'].map((name) =>
    readFile(join(directory, `${name}.json`), 'utf8')));
  const names = NEW_PROFILES.map((profile) => `mint-${profile.id.replace('-test-', '-')}`);
  assert.equal(new Set(names).size, 12);
  assert.equal(names.some((name) => ['mint-kox', 'mint-mu', 'mint-ibm'].includes(name)), false);
  await Promise.all(names.map((name) => loadOrCreateStateSigner(directory, name)));
  const reread = await Promise.all(['mint-kox', 'mint-mu', 'mint-ibm'].map((name) =>
    loadOrCreateStateSigner(directory, name)));
  assert.deepEqual(reread.map((signer) => signer.publicKey.toBase58()),
    legacy.map((signer) => signer.publicKey.toBase58()));
  assert.deepEqual(await Promise.all(['mint-kox', 'mint-mu', 'mint-ibm'].map((name) =>
    readFile(join(directory, `${name}.json`), 'utf8'))), before);
});

test('CLI holder funding has fixed reviewed token and SOL caps', () => {
  assert.equal(HOLDER_TOKEN_CAP_UI, 10n);
  assert.equal(HOLDER_SOL_CAP_LAMPORTS, 6_000_000);
});

test('an unresolved persisted signature is retried with identical serialized bytes', async (t) => {
  let sends = 0;
  let reconciled = false;
  const directory = await mkdtemp(join(tmpdir(), 'devnet-runtime-retry-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const statePath = join(directory, 'state.json');
  const state: PrivateRuntimeState = {
    schema: 'dividendx-devnet-private-state-v1', runtimeId: 'x', rpcUrl: 'https://example.com',
    genesisHash: DEVNET_GENESIS_HASH, programId: PROGRAM_ID.toBase58(), deploymentDomainHex: DEPLOYMENT_DOMAIN_HEX,
    initialAdminLamports: '1000000000', publicKeys: {},
    steps: { mint: { attempts: [{ signature: 'persisted', blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 100, serializedTransactionBase64: Buffer.from('same-transaction').toString('base64'),
      preparedAt: new Date(0).toISOString(), submittedAt: null }] } },
  };
  const connection = {
    async getSignatureStatuses() { return { context: { slot: 1 }, value: [null] }; },
    async getBlockHeight() { return 50; },
    async sendRawTransaction(raw: Uint8Array) {
      sends += 1;
      assert.equal(Buffer.from(raw).toString(), 'same-transaction');
      return 'persisted';
    },
    async confirmTransaction() { reconciled = true; return { context: { slot: 2 }, value: { err: null } }; },
  } as unknown as Connection;
  const signature = await executeResumableStep({ connection, state, statePath,
    adminAddress: Keypair.generate().publicKey.toBase58() }, 'mint', async () => reconciled,
  Keypair.generate(), []);
  assert.equal(signature, 'persisted');
  assert.equal(sends, 1);
  assert.ok(state.steps.mint!.attempts[0]!.submittedAt);
});

test('expired ambiguous signature never permits a newly signed duplicate', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'devnet-runtime-expired-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  let latestReads = 0;
  const state = {
    schema: 'dividendx-devnet-private-state-v1', runtimeId: 'x', rpcUrl: 'https://example.com',
    genesisHash: DEVNET_GENESIS_HASH, programId: PROGRAM_ID.toBase58(), deploymentDomainHex: DEPLOYMENT_DOMAIN_HEX,
    initialAdminLamports: '1000000000', publicKeys: {}, steps: { funding: { attempts: [{
      signature: 'ambiguous', blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 10,
      serializedTransactionBase64: Buffer.from('old').toString('base64'), preparedAt: new Date(0).toISOString(),
      submittedAt: null,
    }] } },
  } satisfies PrivateRuntimeState;
  const connection = {
    async getSignatureStatuses() { return { context: { slot: 1 }, value: [null] }; },
    async getBlockHeight() { return 11; },
    async getLatestBlockhash() { latestReads += 1; throw new Error('must not build replacement'); },
  } as unknown as Connection;
  await assert.rejects(executeResumableStep({ connection, state, statePath: join(directory, 'state.json'),
    adminAddress: Keypair.generate().publicKey.toBase58() }, 'funding', async () => false, Keypair.generate(), []),
  (error: unknown) => (error as { code?: string }).code === 'EXPIRED_SIGNATURE_UNRESOLVED');
  assert.equal(latestReads, 0);
});

test('confirmed authority funding remains complete after recipients spend fees', async () => {
  const state = {
    schema: 'dividendx-devnet-private-state-v1', runtimeId: 'x', rpcUrl: 'https://example.com',
    genesisHash: DEVNET_GENESIS_HASH, programId: PROGRAM_ID.toBase58(), deploymentDomainHex: DEPLOYMENT_DOMAIN_HEX,
    initialAdminLamports: '1000000000', publicKeys: {}, steps: { fund: { attempts: [{
      signature: 'confirmed-funding', blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 10,
      serializedTransactionBase64: Buffer.from('old').toString('base64'), preparedAt: new Date(0).toISOString(),
      submittedAt: new Date(0).toISOString(),
    }] } },
  } satisfies PrivateRuntimeState;
  const connection = {
    async getSignatureStatuses() { return { context: { slot: 1 }, value: [{ err: null, confirmationStatus: 'confirmed' }] }; },
  } as unknown as Connection;
  assert.equal(await persistedStepConfirmed({ connection, state, statePath: '/unused', adminAddress: 'unused' }, 'fund'), true);
});

test('signed transaction and exact signature are durable before first RPC send', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'devnet-runtime-prepare-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const statePath = join(directory, 'state.json');
  const payer = Keypair.generate();
  const state: PrivateRuntimeState = {
    schema: 'dividendx-devnet-private-state-v1', runtimeId: 'x', rpcUrl: 'https://example.com',
    genesisHash: DEVNET_GENESIS_HASH, programId: PROGRAM_ID.toBase58(), deploymentDomainHex: DEPLOYMENT_DOMAIN_HEX,
    initialAdminLamports: '1000000000', publicKeys: {}, steps: {},
  };
  const connection = {
    async getLatestBlockhash() { return { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 100 }; },
    async simulateTransaction() { return { context: { slot: 1 }, value: { err: null, logs: [], accounts: [{ lamports: 999_995_000 }] } }; },
    async sendRawTransaction() { throw new Error('lost RPC response'); },
  } as unknown as Connection;
  await assert.rejects(executeResumableStep({ connection, state, statePath,
    adminAddress: payer.publicKey.toBase58() }, 'prepared', async () => false, payer,
  [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 })]),
  /lost RPC response/);
  const durable = JSON.parse(await readFile(statePath, 'utf8')) as PrivateRuntimeState;
  const attempt = durable.steps.prepared!.attempts[0]!;
  assert.match(attempt.signature, /^[1-9A-HJ-NP-Za-km-z]+$/);
  assert.ok(attempt.serializedTransactionBase64.length > 20);
  assert.equal(attempt.submittedAt, null);
});

test('HTTP surface is read-only and has no advance route', () => {
  const registry = manifest();
  assert.deepEqual(routeManifestRequest('GET', '/manifest', registry), { status: 200, body: registry });
  assert.deepEqual(routeManifestRequest('POST', '/faucet', registry), { status: 403,
    body: { signatures: [], message: 'Public faucet is disabled; use the reviewed CLI test-funding command.' } });
  assert.deepEqual(routeManifestRequest('POST', '/advance', registry), { status: 404, body: { error: 'route not found' } });
  assert.deepEqual(routeManifestRequest('POST', '/admin', registry), { status: 404, body: { error: 'route not found' } });
});
