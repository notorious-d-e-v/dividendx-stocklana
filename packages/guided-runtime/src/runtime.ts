import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Idl } from '@anchor-lang/core';
import { CpmmPoolInfoLayout, Percent, Raydium, TxVersion } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import {
  ACCOUNT_SIZE, ASSOCIATED_TOKEN_PROGRAM_ID, AccountLayout, AccountState, ExtensionType,
  TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction, createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction, createMintToCheckedInstruction,
  createUpdateMultiplierDataInstruction, getAccount, getAssociatedTokenAddressSync,
  getMintLen, getScaledUiAmountConfig, unpackAccount, unpackMint,
} from '@solana/spl-token';
import { Surfnet } from '@solana/surfpool';
import {
  Connection, Keypair, PublicKey, SYSVAR_CLOCK_PUBKEY, SystemProgram, Transaction, type Signer, type TransactionInstruction,
} from '@solana/web3.js';
import {
  CIRCLE_DEVNET_USDC_FREEZE_AUTHORITY, CIRCLE_DEVNET_USDC_MINT, CIRCLE_DEVNET_USDC_MINT_AUTHORITY,
  CIRCLE_USDC_REQUIRED_FUNDING_RAW, CIRCLE_USDC_SOURCE_URL,
  CLAIM_DECIMALS, COLLATERAL_DECIMALS, DIVIDENDX_ELF_SHA256, DIVIDENDX_PROGRAM_ID,
  PUBLIC_CLUSTER_GENESIS_HASHES, RAYDIUM_CAPTURED_ELF_SHA256,
  RAYDIUM_CONFIG, RAYDIUM_CPMM_PROGRAM_ID, RAYDIUM_CREATE_POOL_FEE_RECEIVER,
  SERIES_YEAR, TEST_QUOTE_DECIMALS, USDC_FLOW as GUIDED_FLOW,
  assertPrefinalBacking, assertRecombineDelta, assertSoleProviderWithdrawal, assertSwapDelta,
  assertSwapInstructionBounds, assertWithdrawBoundary, buildSimulateSend, quoteCreatorDisabledSwap,
  simulateSendAndConfirm, verifyExecutionEnvironment, writePrivateJson,
  type AssetBalances, type ExecutionManifest, type PreflightResult,
} from '@dividendx/amm-integration';
import {
  DIVIDENDX_IDL, DIVIDENDX_PROGRAM_ID as SDK_DIVIDENDX_PROGRAM_ID, DividendXInstructions,
  annualSeriesAddresses, assetPolicyPda, configPda, eventHeadPda, eventRevisionPda,
  decodeClockAccount, decodeProgramAccount, fetchClock, fetchQuoteSnapshot, fetchToken2022Snapshot,
  inspectMintProfile, issuerIdentityHash, normalizeAccumulatorAccount, normalizeAssetPolicyAccount,
  normalizeSeriesAccount, programDataAddress, quoteDeposit, quoteRecombine,
  quoteRedemption, requiredCustodyRaw,
} from '@dividendx/transaction-sdk';
import type { DemoSnapshot, DemoState, DemoStep, DemoTransaction } from './contract.js';
import {
  DEMO_STEPS, HttpError, type KnownAddresses, type PoolAddresses, type PublicReceipt,
  type RuntimeSigners,
} from './internal.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '../..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '../..');
const CAPTURE_PATH = resolve(REPOSITORY_ROOT, 'packages/amm-integration/fixtures/raydium-devnet-2026-09-17/capture.json');
const USDC_CAPTURE_PATH = resolve(PACKAGE_ROOT, 'fixtures/circle-devnet-usdc-2026-09-17.json');
const RAYDIUM_ELF_PATH = resolve(REPOSITORY_ROOT, 'packages/amm-integration/fixtures/raydium-devnet-2026-09-17/raydium-cpmm.so');
const DIVIDENDX_ELF_PATH = resolve(REPOSITORY_ROOT, 'target/deploy/dividendx.so');
const STATE_DIRECTORY = resolve(REPOSITORY_ROOT, '.local-tools/guided-runtime');
const STATE_PATH = resolve(STATE_DIRECTORY, 'current.json');
const CIRCLE_DEVNET_USDC_CAPTURE_SHA256 = '3c8a2c7c49c355902bf2b2cb4b5bded7772a7971bb7e8168b0873d2f9d2b42b6';
const CIRCLE_DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const CIRCLE_DEVNET_USDC_CAPTURE_SLOT = 499_830_485;
const LOCAL_USDC_PROVIDER_RAW = 10_000_000n;
const LOCAL_USDC_BUYER_RAW = 1_000_000n;
const PRE_YEAR_MS = Date.UTC(2026, 11, 15, 12);
const START_YEAR_MS = Date.UTC(2027, 0, 2, 12);
const END_YEAR_MS = Date.UTC(2028, 0, 2, 12);
const QUARTERS = [
  { month: 2, day: 15, multiplier: 1.01 },
  { month: 5, day: 15, multiplier: 1.02 },
  { month: 8, day: 15, multiplier: 1.03 },
  { month: 11, day: 15, multiplier: 1.04 },
] as const;

interface CaptureAccount { role: string; address: string; owner: string; lamports: number; space: number; data: string; dataSha256: string }
interface CaptureFixture {
  sourceSlot: number;
  program: { address: string; programData: string; deploySlot: number; file: string; sha256: string; bytes: number };
  accounts: CaptureAccount[];
}
interface UsdcCaptureFixture {
  schema: string; sourceUrl: string; sourceCluster: string; sourceGenesisHash: string;
  sourceSlot: number; mint: string; owner: string; lamports: number; executable: boolean;
  space: number; data: string; dataSha256: string; decimals: number; mintAuthority: string;
  freezeAuthority: string; supplyRaw: string;
}

function digest(value: string): Uint8Array { return new Uint8Array(createHash('sha256').update(value).digest()); }
function hash(data: Uint8Array): string { return createHash('sha256').update(data).digest('hex'); }
function f64Bits(value: number): bigint {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value, true);
  return view.getBigUint64(0, true);
}
function sdkPublicKey(address: PublicKey): PublicKey {
  const SdkPublicKey = SDK_DIVIDENDX_PROGRAM_ID.constructor as typeof PublicKey;
  return new SdkPublicKey(address.toBytes());
}
async function rawRpc(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10_000) });
  const body = await response.json() as { result?: unknown; error?: unknown };
  if (body.error) throw new Error(`${method} failed: ${JSON.stringify(body.error)}`);
  return body.result;
}
function toFeeConfig(preflight: PreflightResult) {
  const value = preflight.config;
  return {
    id: value.address, index: value.index, protocolFeeRate: Number(value.protocolFeeRate),
    tradeFeeRate: Number(value.tradeFeeRate), fundFeeRate: Number(value.fundFeeRate),
    createPoolFee: value.createPoolFee.toString(), creatorFeeRate: Number(value.creatorFeeRate),
  };
}
function tokenDescriptor(address: PublicKey, decimals: number) {
  return { address: address.toBase58(), decimals, programId: TOKEN_PROGRAM_ID.toBase58() };
}
const ZERO_PUBLIC_KEY = new PublicKey(new Uint8Array(32));
function encodeSyntheticTokenAccount(mint: PublicKey, owner: PublicKey, amount: bigint): Buffer {
  const data = Buffer.alloc(ACCOUNT_SIZE);
  AccountLayout.encode({ mint, owner, amount, delegateOption: 0, delegate: ZERO_PUBLIC_KEY,
    state: AccountState.Initialized, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n,
    closeAuthorityOption: 0, closeAuthority: ZERO_PUBLIC_KEY }, data);
  return data;
}
function stringifySafe(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => typeof entry === 'bigint' ? entry.toString() : entry);
}

export class GuidedDemoRuntime {
  readonly runtimeId = randomUUID();
  private surfnet: Surfnet | null = null;
  private drain: NodeJS.Timeout | null = null;
  private connection: Connection | null = null;
  private signers: RuntimeSigners | null = null;
  private known: KnownAddresses | null = null;
  private pool: PoolAddresses | null = null;
  private manifest: ExecutionManifest | null = null;
  private preflight: PreflightResult | null = null;
  private receipt: PublicReceipt | null = null;
  private swap: DemoSnapshot['swap'] = null;
  private state: DemoState = {
    schemaVersion: 2, runtimeId: this.runtimeId, revision: 0, sessionId: null, status: 'idle',
    activeStep: null, nextStep: null, completedSteps: [], snapshot: null, transactions: [], error: null,
  };

  publicState(): DemoState { return structuredClone(this.state); }
  publicReceipt(): PublicReceipt | null { return this.receipt ? structuredClone(this.receipt) : null; }

  private requireSession(): { connection: Connection; signers: RuntimeSigners; known: KnownAddresses; manifest: ExecutionManifest; receipt: PublicReceipt } {
    if (!this.connection || !this.signers || !this.known || !this.manifest || !this.receipt) throw new Error('SESSION_UNAVAILABLE');
    return { connection: this.connection, signers: this.signers, known: this.known, manifest: this.manifest, receipt: this.receipt };
  }

  private async persist(): Promise<void> {
    const value = { savedAt: new Date().toISOString(), state: this.state, receipt: this.receipt };
    await writePrivateJson(STATE_PATH, value);
    if (this.state.sessionId) await writePrivateJson(resolve(STATE_DIRECTORY, `${this.state.sessionId}.json`), value);
  }

  private async update(mutator: () => void): Promise<void> {
    mutator();
    this.state.revision += 1;
    if (this.receipt) this.receipt.transactions = structuredClone(this.state.transactions);
    await this.persist();
  }

  private async submitted(step: DemoStep | 'setup', name: string, signature: string): Promise<void> {
    await this.update(() => this.state.transactions.push({ step, name, signature, status: 'submitted', slot: null }));
  }

  private async confirmed(step: DemoStep | 'setup', name: string, signature: string, slot: number, status: 'confirmed' | 'finalized'): Promise<void> {
    await this.update(() => {
      const transaction = [...this.state.transactions].reverse().find((item) => item.signature === signature && item.name === name);
      if (!transaction) throw new Error('SUBMISSION_JOURNAL_MISSING');
      transaction.status = status;
      transaction.slot = slot;
    });
  }

  private async send(step: DemoStep | 'setup', name: string, payer: Keypair, instructions: readonly TransactionInstruction[], otherSigners: readonly Keypair[] = []): Promise<void> {
    const connection = this.connection;
    if (!connection) throw new Error('SESSION_UNAVAILABLE');
    const result = await buildSimulateSend(connection, name, payer, instructions, otherSigners,
      (submittedName, signature) => this.submitted(step, submittedName, signature));
    await this.confirmed(step, name, result.signature, result.slot, result.confirmationStatus);
  }

  private async sendRaydium(step: DemoStep, name: string, transaction: Transaction, signers: readonly Signer[]): Promise<void> {
    const { connection } = this.requireSession();
    const result = await simulateSendAndConfirm(connection, name, transaction, signers, 'confirmed',
      (submittedName, signature) => this.submitted(step, submittedName, signature));
    await this.confirmed(step, name, result.signature, result.slot, result.confirmationStatus);
  }

  async beginStart(expectedRuntimeId: string, expectedRevision: number): Promise<void> {
    if (expectedRuntimeId !== this.runtimeId || expectedRevision !== this.state.revision) throw new HttpError(409, 'stale runtime or revision');
    if (!['idle', 'complete', 'failed'].includes(this.state.status)) throw new HttpError(409, 'a demo operation is already active');
    this.stopSurfnet();
    const sessionId = randomUUID();
    this.connection = null; this.signers = null; this.known = null; this.pool = null; this.manifest = null; this.preflight = null; this.receipt = null; this.swap = null;
    await this.update(() => {
      this.state = { schemaVersion: 2, runtimeId: this.runtimeId, revision: this.state.revision,
        sessionId, status: 'preparing', activeStep: 'setup', nextStep: null, completedSteps: [], snapshot: null, transactions: [], error: null };
    });
    void this.runSetup(sessionId).catch((error) => this.fail(error));
  }

  async beginStep(expectedRuntimeId: string, sessionId: string, expectedRevision: number, step: DemoStep): Promise<void> {
    if (expectedRuntimeId !== this.runtimeId || sessionId !== this.state.sessionId || expectedRevision !== this.state.revision) throw new HttpError(409, 'stale runtime, session, or revision');
    if (this.state.status !== 'ready' || this.state.nextStep !== step) throw new HttpError(409, 'only the exact next step is accepted');
    await this.update(() => { this.state.status = 'running'; this.state.activeStep = step; this.state.nextStep = null; this.state.error = null; });
    void this.runStep(step).catch((error) => this.fail(error));
  }

  private async fail(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'unknown runtime failure';
    const failedStep = this.state.activeStep;
    const lastKnownObservedAt = this.state.snapshot?.observedAt ?? null;
    let observed: DemoSnapshot | null = null;
    try { observed = this.known && this.connection ? await this.snapshot() : null; } catch {}
    if (this.receipt) this.receipt.failure = { failedAt: new Date().toISOString(), step: failedStep,
      error: message.slice(0, 500), snapshot: observed, lastKnownObservedAt };
    await this.update(() => {
      this.state.status = 'failed'; this.state.activeStep = null; this.state.nextStep = null;
      this.state.error = message.slice(0, 500);
      if (observed) this.state.snapshot = observed;
    }).catch(() => undefined);
  }

  private async runSetup(sessionId: string): Promise<void> {
    const capture = JSON.parse(await readFile(CAPTURE_PATH, 'utf8')) as CaptureFixture;
    const usdcCapture = JSON.parse(await readFile(USDC_CAPTURE_PATH, 'utf8')) as UsdcCaptureFixture;
    const [dividendXElf, raydiumElf] = await Promise.all([readFile(DIVIDENDX_ELF_PATH), readFile(RAYDIUM_ELF_PATH)]);
    if (hash(dividendXElf) !== DIVIDENDX_ELF_SHA256 || hash(raydiumElf) !== RAYDIUM_CAPTURED_ELF_SHA256
      || capture.program.sha256 !== RAYDIUM_CAPTURED_ELF_SHA256 || capture.program.bytes !== raydiumElf.length) throw new Error('CAPTURE_HASH_MISMATCH');
    for (const account of capture.accounts) if (hash(Buffer.from(account.data, 'base64')) !== account.dataSha256
      || Buffer.from(account.data, 'base64').length !== account.space) throw new Error('CAPTURE_ACCOUNT_HASH_MISMATCH');
    const usdcData = Buffer.from(usdcCapture.data, 'base64');
    if (usdcCapture.schema !== 'dividendx-circle-devnet-usdc-capture-v1'
      || usdcCapture.sourceCluster !== 'devnet' || usdcCapture.sourceGenesisHash !== CIRCLE_DEVNET_GENESIS_HASH
      || usdcCapture.sourceSlot !== CIRCLE_DEVNET_USDC_CAPTURE_SLOT || usdcCapture.sourceUrl !== CIRCLE_USDC_SOURCE_URL
      || usdcCapture.mint !== CIRCLE_DEVNET_USDC_MINT.toBase58() || usdcCapture.owner !== TOKEN_PROGRAM_ID.toBase58()
      || usdcCapture.space !== 82 || usdcData.length !== usdcCapture.space
      || usdcCapture.dataSha256 !== CIRCLE_DEVNET_USDC_CAPTURE_SHA256
      || hash(usdcData) !== CIRCLE_DEVNET_USDC_CAPTURE_SHA256) throw new Error('USDC_CAPTURE_IDENTITY_MISMATCH');
    const capturedUsdcMint = unpackMint(CIRCLE_DEVNET_USDC_MINT, { data: usdcData, executable: false,
      lamports: usdcCapture.lamports, owner: TOKEN_PROGRAM_ID, rentEpoch: 0 }, TOKEN_PROGRAM_ID);
    if (capturedUsdcMint.decimals !== TEST_QUOTE_DECIMALS || capturedUsdcMint.supply.toString() !== usdcCapture.supplyRaw
      || !capturedUsdcMint.mintAuthority?.equals(CIRCLE_DEVNET_USDC_MINT_AUTHORITY)
      || !capturedUsdcMint.freezeAuthority?.equals(CIRCLE_DEVNET_USDC_FREEZE_AUTHORITY)
      || usdcCapture.mintAuthority !== CIRCLE_DEVNET_USDC_MINT_AUTHORITY.toBase58()
      || usdcCapture.freezeAuthority !== CIRCLE_DEVNET_USDC_FREEZE_AUTHORITY.toBase58()) throw new Error('USDC_CAPTURE_MINT_MISMATCH');

    const surfnet = this.surfnet = Surfnet.startWithConfig({ offline: true, blockProductionMode: 'transaction' });
    this.drain = setInterval(() => { try { surfnet.drainEvents(); } catch {} }, 50);
    this.drain.unref();
    const signers = this.signers = {
      admin: Keypair.generate(), attestor: Keypair.generate(), provider: Keypair.generate(), buyer: Keypair.generate(),
      collateralMint: Keypair.generate(),
    };
    surfnet.deploy({ programId: DIVIDENDX_PROGRAM_ID.toBase58(), soBytes: dividendXElf });
    await rawRpc(surfnet.rpcUrl, 'surfnet_setProgramAuthority', [DIVIDENDX_PROGRAM_ID.toBase58(), signers.admin.publicKey.toBase58()]);
    surfnet.deploy({ programId: RAYDIUM_CPMM_PROGRAM_ID.toBase58(), soBytes: raydiumElf });
    for (const account of capture.accounts) surfnet.setAccount(account.address, account.lamports, Buffer.from(account.data, 'base64'), account.owner);
    surfnet.setAccount(usdcCapture.mint, usdcCapture.lamports, usdcData, usdcCapture.owner);
    surfnet.fundSol(signers.admin.publicKey.toBase58(), 5_000_000_000);
    surfnet.timeTravelToTimestamp(PRE_YEAR_MS);
    const boundedFetch: typeof fetch = async (input, init = {}) => {
      const timeout = AbortSignal.timeout(10_000);
      const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      return fetch(input, { ...init, signal });
    };
    const connection = this.connection = new Connection(surfnet.rpcUrl, {
      commitment: 'confirmed', wsEndpoint: surfnet.wsUrl,
      confirmTransactionInitialTimeout: 15_000, disableRetryOnRateLimit: true, fetch: boundedFetch,
    });
    const genesisHash = await connection.getGenesisHash();
    if (PUBLIC_CLUSTER_GENESIS_HASHES.has(genesisHash)) throw new Error('LOCAL_USDC_FUNDING_REQUIRES_NON_PUBLIC_GENESIS');
    const providerQuote = getAssociatedTokenAddressSync(CIRCLE_DEVNET_USDC_MINT, signers.provider.publicKey);
    const buyerQuote = getAssociatedTokenAddressSync(CIRCLE_DEVNET_USDC_MINT, signers.buyer.publicKey);
    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
    surfnet.setAccount(providerQuote.toBase58(), tokenAccountRent,
      encodeSyntheticTokenAccount(CIRCLE_DEVNET_USDC_MINT, signers.provider.publicKey, LOCAL_USDC_PROVIDER_RAW), TOKEN_PROGRAM_ID.toBase58());
    surfnet.setAccount(buyerQuote.toBase58(), tokenAccountRent,
      encodeSyntheticTokenAccount(CIRCLE_DEVNET_USDC_MINT, signers.buyer.publicKey, LOCAL_USDC_BUYER_RAW), TOKEN_PROGRAM_ID.toBase58());
    const deploymentDomain = new PublicKey(genesisHash).toBytes();
    const manifest = this.manifest = {
      schema: 'dividendx-raydium-cpmm-v1', mode: 'local-clone', rpcUrl: surfnet.rpcUrl,
      expectedGenesisHash: genesisHash, expectedDividendXUpgradeAuthority: signers.admin.publicKey.toBase58(),
      deploymentDomainHex: Buffer.from(deploymentDomain).toString('hex'), expectedDividendXElfSha256: DIVIDENDX_ELF_SHA256,
      expectedRaydiumElfSha256: RAYDIUM_CAPTURED_ELF_SHA256, maxCreatePoolFeeLamports: '250000000',
      maxRunSpendLamports: '1500000000', expectedYear: SERIES_YEAR,
    };
    this.preflight = await verifyExecutionEnvironment(connection, manifest);
    const builders = new DividendXInstructions(DIVIDENDX_IDL as Idl);
    const config = configPda().address;
    this.receipt = {
      schemaVersion: 2, runtimeId: this.runtimeId, sessionId, boundary: 'offline-local-circle-devnet-usdc-clone',
      capture: { sourceCluster: 'devnet', sourceSlot: capture.sourceSlot, raydiumProgramData: capture.program.programData,
        raydiumDeploySlot: capture.program.deploySlot, raydiumElfSha256: RAYDIUM_CAPTURED_ELF_SHA256,
        dividendXElfSha256: DIVIDENDX_ELF_SHA256, configAccountSha256: capture.accounts[0]!.dataSha256,
        feeAccountSha256: capture.accounts[1]!.dataSha256,
        circleUsdc: { sourceUrl: usdcCapture.sourceUrl, sourceCluster: 'devnet', sourceGenesisHash: usdcCapture.sourceGenesisHash,
          sourceSlot: usdcCapture.sourceSlot, mint: usdcCapture.mint, owner: usdcCapture.owner,
          dataSha256: usdcCapture.dataSha256, supplyRaw: usdcCapture.supplyRaw, decimals: 6,
          mintAuthority: usdcCapture.mintAuthority, freezeAuthority: usdcCapture.freezeAuthority } },
      localFunding: { method: 'surfpool-set-account', providerRaw: '10000000', buyerRaw: '1000000',
        totalRaw: '11000000', publicFaucetTransfer: false },
      identities: {
        programs: { dividendX: DIVIDENDX_PROGRAM_ID.toBase58(), raydium: RAYDIUM_CPMM_PROGRAM_ID.toBase58(),
          raydiumConfig: RAYDIUM_CONFIG.toBase58(), raydiumFeeReceiver: RAYDIUM_CREATE_POOL_FEE_RECEIVER.toBase58() },
        wallets: { provider: signers.provider.publicKey.toBase58(), buyer: signers.buyer.publicKey.toBase58() },
        mints: { stock: signers.collateralMint.publicKey.toBase58(), pt: '', dr: '', quote: CIRCLE_DEVNET_USDC_MINT.toBase58(), lp: null },
        dividendX: { assetPolicy: '', series: '', accumulator: '', vault: '' },
        accounts: { providerStock: '', providerPt: '', providerDr: '', providerQuote: '', providerLp: null,
          buyerStock: '', buyerPt: '', buyerDr: '', buyerQuote: '', poolVaultA: null, poolVaultB: null, poolDrVault: null, poolQuoteVault: null },
        pool: null,
      },
      transactions: [], checkpoints: [], failure: null, limits: [
        'Local transactions using test assets and an accelerated test year.',
        'Raydium executes from captured genuine devnet bytecode; these signatures are not public devnet signatures.',
        'Test USDC uses an exact Circle devnet mint clone with synthetic local balances, not faucet transfers or public USDC.',
      ],
    };
    await this.persist();

    await this.send('setup', 'initialize_dividendx_config', signers.admin, [builders.admin.initializeConfig({
      config, program: DIVIDENDX_PROGRAM_ID, programData: programDataAddress(), upgradeAuthority: signers.admin.publicKey,
      systemProgram: SystemProgram.programId,
    }, deploymentDomain)]);
    await this.send('setup', 'fund_test_participants', signers.admin, [
      SystemProgram.transfer({ fromPubkey: signers.admin.publicKey, toPubkey: signers.provider.publicKey, lamports: 600_000_000 }),
      SystemProgram.transfer({ fromPubkey: signers.admin.publicKey, toPubkey: signers.buyer.publicKey, lamports: 50_000_000 }),
      SystemProgram.transfer({ fromPubkey: signers.admin.publicKey, toPubkey: signers.attestor.publicKey, lamports: 50_000_000 }),
    ]);
    const collateralSpace = getMintLen([ExtensionType.ScaledUiAmountConfig]);
    const collateralRent = await connection.getMinimumBalanceForRentExemption(collateralSpace);
    await this.send('setup', 'create_test_collateral_mint', signers.admin, [
      SystemProgram.createAccount({ fromPubkey: signers.admin.publicKey, newAccountPubkey: signers.collateralMint.publicKey,
        lamports: collateralRent, space: collateralSpace, programId: TOKEN_2022_PROGRAM_ID }),
      createInitializeScaledUiAmountConfigInstruction(signers.collateralMint.publicKey, signers.admin.publicKey, 1, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(signers.collateralMint.publicKey, COLLATERAL_DECIMALS, signers.admin.publicKey, null, TOKEN_2022_PROGRAM_ID),
    ], [signers.collateralMint]);
    const issuerId = await issuerIdentityHash(`surfnet-guided:${this.runtimeId}:${genesisHash}`, 'dividendx-guided-test-issuer');
    const assetPolicy = assetPolicyPda(issuerId, signers.collateralMint.publicKey).address;
    const series = annualSeriesAddresses(issuerId, signers.collateralMint.publicKey, SERIES_YEAR);
    await this.send('setup', 'register_test_asset', signers.admin, [builders.admin.registerAsset({
      config, admin: signers.admin.publicKey, collateralMint: signers.collateralMint.publicKey, assetPolicy,
      systemProgram: SystemProgram.programId,
    }, { issuerId, symbol: 'DXT', attestor: sdkPublicKey(signers.attestor.publicKey), policyDigest: digest('dividendx-guided-test-policy-v1') })]);
    await this.refreshObservation('setup', 'setup');
    await this.send('setup', 'create_2027_series', signers.admin, [builders.permissionless.createSeries({
      payer: signers.admin.publicKey, assetPolicy, series: series.series, accumulator: series.accumulator,
      ptMint: series.ptMint, drMint: series.drMint, collateralMint: signers.collateralMint.publicKey, vault: series.vault,
      tokenProgram: TOKEN_PROGRAM_ID, collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }, SERIES_YEAR)]);
    const known: KnownAddresses = this.known = {
      issuerId, assetPolicy, series,
      providerCollateral: getAssociatedTokenAddressSync(signers.collateralMint.publicKey, signers.provider.publicKey, false, TOKEN_2022_PROGRAM_ID),
      providerPt: getAssociatedTokenAddressSync(series.ptMint, signers.provider.publicKey),
      providerDr: getAssociatedTokenAddressSync(series.drMint, signers.provider.publicKey),
      providerQuote,
      buyerCollateral: getAssociatedTokenAddressSync(signers.collateralMint.publicKey, signers.buyer.publicKey, false, TOKEN_2022_PROGRAM_ID),
      buyerPt: getAssociatedTokenAddressSync(series.ptMint, signers.buyer.publicKey),
      buyerDr: getAssociatedTokenAddressSync(series.drMint, signers.buyer.publicKey),
      buyerQuote,
    };
    const ata = (address: PublicKey, owner: PublicKey, mint: PublicKey, program = TOKEN_PROGRAM_ID) =>
      createAssociatedTokenAccountIdempotentInstruction(signers.admin.publicKey, address, owner, mint, program);
    await this.send('setup', 'create_provider_token_accounts', signers.admin, [
      ata(known.providerCollateral, signers.provider.publicKey, signers.collateralMint.publicKey, TOKEN_2022_PROGRAM_ID),
      ata(known.providerPt, signers.provider.publicKey, series.ptMint), ata(known.providerDr, signers.provider.publicKey, series.drMint),
      createMintToCheckedInstruction(signers.collateralMint.publicKey, known.providerCollateral, signers.admin.publicKey, GUIDED_FLOW.collateralDepositRaw, COLLATERAL_DECIMALS, [], TOKEN_2022_PROGRAM_ID),
    ]);
    await this.send('setup', 'create_buyer_token_accounts', signers.admin, [
      ata(known.buyerCollateral, signers.buyer.publicKey, signers.collateralMint.publicKey, TOKEN_2022_PROGRAM_ID),
      ata(known.buyerPt, signers.buyer.publicKey, series.ptMint), ata(known.buyerDr, signers.buyer.publicKey, series.drMint),
    ]);
    const ids = this.receipt.identities;
    ids.mints.pt = series.ptMint.toBase58(); ids.mints.dr = series.drMint.toBase58();
    ids.dividendX = { assetPolicy: assetPolicy.toBase58(), series: series.series.toBase58(), accumulator: series.accumulator.toBase58(), vault: series.vault.toBase58() };
    ids.accounts = { ...ids.accounts, providerStock: known.providerCollateral.toBase58(), providerPt: known.providerPt.toBase58(),
      providerDr: known.providerDr.toBase58(), providerQuote: known.providerQuote.toBase58(), buyerStock: known.buyerCollateral.toBase58(),
      buyerPt: known.buyerPt.toBase58(), buyerDr: known.buyerDr.toBase58(), buyerQuote: known.buyerQuote.toBase58() };
    const snapshot = await this.snapshot();
    if (!snapshot.backingVerified) throw new Error('BACKING_VERIFICATION_FAILED');
    this.receipt.checkpoints.push({ step: 'setup', snapshot });
    await this.update(() => { this.state.status = 'ready'; this.state.activeStep = null; this.state.nextStep = 'split'; this.state.snapshot = snapshot; });
  }

  private async refreshObservation(step: DemoStep | 'setup', label: string): Promise<void> {
    const connection = this.connection;
    const signers = this.signers;
    if (!connection || !signers) throw new Error('SESSION_UNAVAILABLE');
    const builders = new DividendXInstructions(DIVIDENDX_IDL as Idl);
    const assetPolicy = this.known?.assetPolicy ?? assetPolicyPda(
      await issuerIdentityHash(`surfnet-guided:${this.runtimeId}:${await connection.getGenesisHash()}`, 'dividendx-guided-test-issuer'), signers.collateralMint.publicKey).address;
    const clock = await fetchClock(connection);
    await this.send(step, `refresh_test_asset_observation_${label}`, signers.attestor, [builders.attestor.refreshObservation({
      attestor: signers.attestor.publicKey, assetPolicy, collateralMint: signers.collateralMint.publicKey,
    }, digest(`dividendx-guided-observation:${label}`), clock.unixTimestamp + 7_200n)]);
  }

  private async runStep(step: DemoStep): Promise<void> {
    switch (step) {
      case 'split': await this.split(); break;
      case 'create-pool': await this.createPool(); break;
      case 'add-liquidity': await this.addLiquidity(); break;
      case 'buy-dr': await this.buyDr(); break;
      case 'remove-liquidity': await this.removeLiquidity(); break;
      case 'recombine': await this.recombine(); break;
      case 'settle-year': await this.settleYear(); break;
      case 'redeem-buyer': await this.redeem('buyer'); break;
      case 'redeem-provider': await this.redeem('provider'); break;
    }
    const snapshot = await this.snapshot();
    if (!snapshot.backingVerified) throw new Error('BACKING_VERIFICATION_FAILED');
    this.receipt!.checkpoints.push({ step, snapshot });
    const completed = [...this.state.completedSteps, step];
    const next = DEMO_STEPS[completed.length] ?? null;
    await this.update(() => {
      this.state.completedSteps = completed;
      this.state.snapshot = snapshot;
      this.state.activeStep = null;
      this.state.nextStep = next;
      this.state.status = next ? 'ready' : 'complete';
    });
  }

  private holderAccounts(owner: 'provider' | 'buyer') {
    const { signers, known } = this.requireSession();
    const holder = signers[owner].publicKey;
    return {
      holder, assetPolicy: known.assetPolicy, series: known.series.series,
      collateralMint: signers.collateralMint.publicKey, vault: known.series.vault,
      holderCollateral: owner === 'provider' ? known.providerCollateral : known.buyerCollateral,
      ptMint: known.series.ptMint, drMint: known.series.drMint,
      holderPt: owner === 'provider' ? known.providerPt : known.buyerPt,
      holderDr: owner === 'provider' ? known.providerDr : known.buyerDr,
      tokenProgram: TOKEN_PROGRAM_ID, collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
    };
  }

  private async split(): Promise<void> {
    const { connection, signers, known } = this.requireSession();
    const accounts = this.holderAccounts('provider');
    const snapshot = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL as Idl, { ...accounts, accumulator: known.series.accumulator });
    const quote = quoteDeposit(snapshot.series, snapshot.policy, snapshot.vaultRaw, GUIDED_FLOW.collateralDepositRaw,
      snapshot.holderCollateralRaw!, snapshot.clock, snapshot.clock.unixTimestamp + 300n);
    const builders = new DividendXInstructions(DIVIDENDX_IDL as Idl);
    await this.send('split', 'deposit_100_test_stock', signers.provider, [builders.holder.deposit(accounts, quote.inputRaw, quote.guard)]);
    const current = await this.readAmmBalances(false);
    if (current.collateral.vault !== GUIDED_FLOW.collateralDepositRaw || current.pt.supply !== GUIDED_FLOW.collateralDepositRaw
      || current.dr.supply !== GUIDED_FLOW.collateralDepositRaw) throw new Error('SPLIT_DELTA_FAILED');
  }

  private raydium(owner: Keypair): Promise<Raydium> {
    return Raydium.load({ connection: this.requireSession().connection, cluster: 'devnet', owner,
      disableLoadToken: true, disableFeatureCheck: true, blockhashCommitment: 'confirmed' });
  }

  private async createPool(): Promise<void> {
    const { connection, signers, known } = this.requireSession();
    const preflight = await verifyExecutionEnvironment(connection, this.manifest!);
    if (stringifySafe(preflight.config) !== stringifySafe(this.preflight!.config)) throw new Error('RAYDIUM_CONFIG_CHANGED');
    const raydium = await this.raydium(signers.provider);
    const dr = tokenDescriptor(known.series.drMint, CLAIM_DECIMALS);
    const quote = tokenDescriptor(CIRCLE_DEVNET_USDC_MINT, TEST_QUOTE_DECIMALS);
    const drFirst = Buffer.compare(known.series.drMint.toBuffer(), CIRCLE_DEVNET_USDC_MINT.toBuffer()) < 0;
    const mintA = drFirst ? dr : quote;
    const mintB = drFirst ? quote : dr;
    const created = await raydium.cpmm.createPool({
      programId: RAYDIUM_CPMM_PROGRAM_ID, poolFeeAccount: RAYDIUM_CREATE_POOL_FEE_RECEIVER,
      mintA, mintB, mintAAmount: new BN((drFirst ? GUIDED_FLOW.seedDrRaw : GUIDED_FLOW.seedQuoteRaw).toString()),
      mintBAmount: new BN((drFirst ? GUIDED_FLOW.seedQuoteRaw : GUIDED_FLOW.seedDrRaw).toString()), startTime: new BN(0),
      feeConfig: toFeeConfig(preflight), associatedOnly: true,
      ownerInfo: { feePayer: signers.provider.publicKey, useSOLBalance: false }, txVersion: TxVersion.LEGACY,
    });
    await this.sendRaydium('create-pool', 'create_cpmm_pool', created.transaction as Transaction, [signers.provider, ...created.signers]);
    await raydium.account.fetchWalletTokenAccounts({ forceUpdate: true, commitment: 'confirmed' });
    const poolData = await raydium.cpmm.getPoolInfoFromRpc(created.extInfo.address.poolId.toBase58());
    if (!poolData.rpcData.configId.equals(RAYDIUM_CONFIG) || poolData.rpcData.enableCreatorFee) throw new Error('POOL_IDENTITY_MISMATCH');
    const pool: PoolAddresses = this.pool = {
      poolId: created.extInfo.address.poolId, lpMint: created.extInfo.address.lpMint,
      vaultA: created.extInfo.address.vaultA, vaultB: created.extInfo.address.vaultB,
      drVault: poolData.rpcData.mintA.equals(known.series.drMint) ? created.extInfo.address.vaultA : created.extInfo.address.vaultB,
      quoteVault: poolData.rpcData.mintA.equals(CIRCLE_DEVNET_USDC_MINT) ? created.extInfo.address.vaultA : created.extInfo.address.vaultB,
      providerLp: getAssociatedTokenAddressSync(created.extInfo.address.lpMint, signers.provider.publicKey),
    };
    const openTime = BigInt(poolData.rpcData.openTime.toString());
    const clock = await fetchClock(connection);
    if (clock.unixTimestamp <= openTime) this.surfnet!.timeTravelToTimestamp(Number(openTime + 1n) * 1_000);
    const balances = await this.readAmmBalances(true);
    if (balances.dr.poolVault !== GUIDED_FLOW.seedDrRaw || balances.testQuote.poolVault !== GUIDED_FLOW.seedQuoteRaw) throw new Error('SEED_DELTA_FAILED');
    assertPrefinalBacking(balances);
    const ids = this.receipt!.identities;
    ids.pool = pool.poolId.toBase58(); ids.mints.lp = pool.lpMint.toBase58();
    ids.accounts.providerLp = pool.providerLp.toBase58(); ids.accounts.poolVaultA = pool.vaultA.toBase58();
    ids.accounts.poolVaultB = pool.vaultB.toBase58(); ids.accounts.poolDrVault = pool.drVault.toBase58();
    ids.accounts.poolQuoteVault = pool.quoteVault.toBase58();
  }

  private async addLiquidity(): Promise<void> {
    const { signers } = this.requireSession();
    const pool = this.pool;
    if (!pool) throw new Error('POOL_UNAVAILABLE');
    const before = await this.readAmmBalances(true);
    const raydium = await this.raydium(signers.provider);
    let info = await raydium.cpmm.getPoolInfoFromRpc(pool.poolId.toBase58());
    const added = await raydium.cpmm.addLiquidity({ poolInfo: info.poolInfo, poolKeys: info.poolKeys,
      inputAmount: new BN(GUIDED_FLOW.addDrRaw.toString()), baseIn: info.rpcData.mintA.equals(this.known!.series.drMint),
      slippage: new Percent(0, 10_000), txVersion: TxVersion.LEGACY });
    await this.sendRaydium('add-liquidity', 'add_cpmm_liquidity', added.transaction as Transaction, [signers.provider, ...added.signers]);
    await raydium.account.fetchWalletTokenAccounts({ forceUpdate: true, commitment: 'confirmed' });
    info = await raydium.cpmm.getPoolInfoFromRpc(pool.poolId.toBase58());
    const after = await this.readAmmBalances(true);
    if (before.dr.provider - after.dr.provider !== GUIDED_FLOW.addDrRaw
      || before.testQuote.provider - after.testQuote.provider !== GUIDED_FLOW.addQuoteRaw
      || after.dr.poolVault - before.dr.poolVault !== GUIDED_FLOW.addDrRaw
      || after.testQuote.poolVault - before.testQuote.poolVault !== GUIDED_FLOW.addQuoteRaw
      || after.lp.provider <= before.lp.provider) throw new Error('ADD_LIQUIDITY_DELTA_FAILED');
    assertPrefinalBacking(after);
  }

  private async buyDr(): Promise<void> {
    const { connection, signers, known } = this.requireSession();
    const pool = this.pool;
    if (!pool) throw new Error('POOL_UNAVAILABLE');
    const before = await this.readAmmBalances(true);
    const provider = await this.raydium(signers.provider);
    const info = await provider.cpmm.getPoolInfoFromRpc(pool.poolId.toBase58());
    const quoteIsA = info.rpcData.mintA.equals(CIRCLE_DEVNET_USDC_MINT);
    const inputReserve = BigInt((quoteIsA ? info.rpcData.baseReserve : info.rpcData.quoteReserve).toString());
    const outputReserve = BigInt((quoteIsA ? info.rpcData.quoteReserve : info.rpcData.baseReserve).toString());
    const preflight = await verifyExecutionEnvironment(connection, this.manifest!);
    const quote = quoteCreatorDisabledSwap(GUIDED_FLOW.buyerQuoteRaw, inputReserve, outputReserve,
      preflight.config, info.rpcData.enableCreatorFee, GUIDED_FLOW.slippageBps);
    const buyer = await this.raydium(signers.buyer);
    const swapped = await buyer.cpmm.swap({ poolInfo: info.poolInfo, poolKeys: info.poolKeys,
      inputAmount: new BN(GUIDED_FLOW.buyerQuoteRaw.toString()), swapResult: quote.sdkSwapResult,
      baseIn: quoteIsA, fixedOut: false, slippage: GUIDED_FLOW.slippageBps / 10_000, txVersion: TxVersion.LEGACY });
    assertSwapInstructionBounds(swapped.transaction as Transaction, GUIDED_FLOW.buyerQuoteRaw, quote.minimumOutput);
    await this.sendRaydium('buy-dr', 'buyer_swap_quote_for_dr', swapped.transaction as Transaction, [signers.buyer, ...swapped.signers]);
    const after = await this.readAmmBalances(true);
    assertSwapDelta(before, after, { inputQuote: GUIDED_FLOW.buyerQuoteRaw, outputDr: quote.outputAmount,
      minimumDr: quote.minimumOutput, protocolFee: quote.protocolFee, fundFee: quote.fundFee });
    this.swap = { inputQuoteRaw: GUIDED_FLOW.buyerQuoteRaw.toString(), outputDrRaw: quote.outputAmount.toString(), minimumDrRaw: quote.minimumOutput.toString() };
    if (after.dr.buyer <= 0n || !known.buyerDr) throw new Error('BUYER_DR_MISSING');
  }

  private async removeLiquidity(): Promise<void> {
    const { signers } = this.requireSession();
    const pool = this.pool;
    if (!pool) throw new Error('POOL_UNAVAILABLE');
    const before = await this.readAmmBalances(true);
    const raydium = await this.raydium(signers.provider);
    await raydium.account.fetchWalletTokenAccounts({ forceUpdate: true, commitment: 'confirmed' });
    const info = await raydium.cpmm.getPoolInfoFromRpc(pool.poolId.toBase58());
    const withdrawn = await raydium.cpmm.withdrawLiquidity({ poolInfo: info.poolInfo, poolKeys: info.poolKeys,
      lpAmount: new BN(before.lp.provider.toString()), slippage: new Percent(GUIDED_FLOW.slippageBps, 10_000), txVersion: TxVersion.LEGACY });
    await this.sendRaydium('remove-liquidity', 'withdraw_all_provider_lp', withdrawn.transaction as Transaction, [signers.provider, ...withdrawn.signers]);
    const after = await this.readAmmBalances(true);
    assertSoleProviderWithdrawal(before, after);
    assertWithdrawBoundary(after);
  }

  private async recombine(): Promise<void> {
    const { connection, signers, known } = this.requireSession();
    const before = await this.readAmmBalances(true);
    const amount = before.dr.provider < before.pt.provider ? before.dr.provider : before.pt.provider;
    const accounts = this.holderAccounts('provider');
    const snapshot = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL as Idl, { ...accounts, accumulator: known.series.accumulator });
    const quote = quoteRecombine(snapshot.series, snapshot.vaultRaw, amount, snapshot.holderPtRaw!, snapshot.holderDrRaw!,
      snapshot.clock.unixTimestamp, snapshot.clock.unixTimestamp + 300n);
    const builders = new DividendXInstructions(DIVIDENDX_IDL as Idl);
    await this.send('recombine', 'recombine_recovered_dr_with_pt', signers.provider,
      [builders.holder.recombine(accounts, amount, quote.guard)]);
    const after = await this.readAmmBalances(true);
    assertRecombineDelta(before, after, amount);
    assertPrefinalBacking(after);
  }

  private event(index: number) {
    const known = this.known!;
    const quarter = QUARTERS[index]!;
    const eventId = new Uint8Array(32).fill(index + 1);
    const previous = index === 0 ? 1 : QUARTERS[index - 1]!.multiplier;
    const effectiveMs = Date.UTC(2027, quarter.month, quarter.day, 12);
    const eventHead = eventHeadPda(known.series.series, eventId).address;
    return {
      effectiveMs, eventHead, eventRevision: eventRevisionPda(eventHead, 1n).address,
      input: {
        eventId, revision: 1n, exDate: 2027 * 10_000 + (quarter.month + 1) * 100 + quarter.day,
        status: 'qualified' as const, m0Bits: f64Bits(previous), m1Bits: f64Bits(quarter.multiplier), sourceFinal: true,
        originalEffectiveTimestamp: BigInt(effectiveMs / 1_000),
        paymentDate: 2027 * 10_000 + (quarter.month + 1) * 100 + quarter.day + 10,
        observedSlot: 0n, evidenceDigest: digest(`synthetic-guided-quarter:${index + 1}`),
      },
      multiplier: quarter.multiplier,
    };
  }

  private travelTo(timestampMs: number): void {
    if (!this.surfnet) throw new Error('SESSION_UNAVAILABLE');
    this.surfnet.timeTravelToTimestamp(timestampMs);
  }

  private async settleYear(): Promise<void> {
    const { connection, signers, known } = this.requireSession();
    const builders = new DividendXInstructions(DIVIDENDX_IDL as Idl);
    this.travelTo(START_YEAR_MS);
    await this.refreshObservation('settle-year', 'start-year');
    for (let index = 0; index < QUARTERS.length; index += 1) {
      const record = this.event(index);
      this.travelTo(record.effectiveMs + 1_000);
      const tokenSnapshot = await fetchToken2022Snapshot(connection, signers.collateralMint.publicKey);
      if (tokenSnapshot.scale.activeBits !== record.input.m1Bits) {
        if (tokenSnapshot.scale.activeBits !== record.input.m0Bits) throw new Error('TEST_MULTIPLIER_SEQUENCE_INVALID');
        await this.send('settle-year', `update_test_multiplier_q${index + 1}`, signers.admin, [
          createUpdateMultiplierDataInstruction(signers.collateralMint.publicKey, signers.admin.publicKey,
            record.multiplier, BigInt(record.effectiveMs / 1_000), [], TOKEN_2022_PROGRAM_ID),
        ]);
      }
      await this.refreshObservation('settle-year', `quarter-${index + 1}`);
      record.input.observedSlot = (await fetchClock(connection)).slot;
      await this.send('settle-year', `record_synthetic_dividend_q${index + 1}`, signers.attestor, [builders.attestor.upsertEvent({
        attestor: signers.attestor.publicKey, assetPolicy: known.assetPolicy, series: known.series.series,
        eventHead: record.eventHead, revision: record.eventRevision, systemProgram: SystemProgram.programId,
      }, record.input)]);
    }
    this.travelTo(END_YEAR_MS);
    await this.refreshObservation('settle-year', 'end-year');
    let snapshot = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL as Idl, {
      assetPolicy: known.assetPolicy, series: known.series.series, accumulator: known.series.accumulator,
      collateralMint: signers.collateralMint.publicKey, vault: known.series.vault,
    });
    if (snapshot.series.eventCount !== 4 || snapshot.series.unresolvedCount !== 0
      || snapshot.clock.unixTimestamp < snapshot.series.maturityUnixTimestamp) throw new Error('SYNTHETIC_JOURNAL_INCOMPLETE');
    await this.send('settle-year', 'begin_annual_finalization', signers.attestor, [builders.attestor.beginFinalization({
      attestor: signers.attestor.publicKey, assetPolicy: known.assetPolicy, series: known.series.series,
      accumulator: known.series.accumulator, collateralMint: signers.collateralMint.publicKey, vault: known.series.vault,
      ptMint: known.series.ptMint, drMint: known.series.drMint,
    }, snapshot.series.journalVersion, snapshot.series.journalHash, digest('synthetic-guided-coverage:2027'))]);
    for (let index = 0; index < QUARTERS.length; index += 1) {
      const record = this.event(index);
      await this.send('settle-year', `accumulate_synthetic_dividend_q${index + 1}`, signers.admin,
        [builders.permissionless.accumulateEvent({ keeper: signers.admin.publicKey, series: known.series.series,
          accumulator: known.series.accumulator, eventHead: record.eventHead, revision: record.eventRevision })]);
    }
    snapshot = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL as Idl, {
      assetPolicy: known.assetPolicy, series: known.series.series, accumulator: known.series.accumulator,
      collateralMint: signers.collateralMint.publicKey, vault: known.series.vault,
    });
    await this.send('settle-year', 'complete_annual_finalization', signers.admin, [builders.permissionless.completeFinalization({
      keeper: signers.admin.publicKey, assetPolicy: known.assetPolicy, series: known.series.series,
      accumulator: known.series.accumulator, collateralMint: signers.collateralMint.publicKey, vault: known.series.vault,
      ptMint: known.series.ptMint, drMint: known.series.drMint, tokenProgram: TOKEN_PROGRAM_ID,
    })]);
    const finalized = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL as Idl, {
      assetPolicy: known.assetPolicy, series: known.series.series, accumulator: known.series.accumulator,
      collateralMint: signers.collateralMint.publicKey, vault: known.series.vault,
    });
    if (finalized.series.phase !== 'finalized' || finalized.series.eventCount !== 4) throw new Error('FINALIZATION_FAILED');
  }

  private async redeem(owner: 'buyer' | 'provider'): Promise<void> {
    const { connection, signers, known } = this.requireSession();
    const side = owner === 'buyer' ? 'dr' : 'pt';
    const accounts = this.holderAccounts(owner);
    const snapshot = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL as Idl, { ...accounts, accumulator: known.series.accumulator });
    const claimAccount = side === 'dr' ? accounts.holderDr : accounts.holderPt;
    const amount = (await getAccount(connection, claimAccount, 'confirmed', TOKEN_PROGRAM_ID)).amount;
    if (amount <= 0n) throw new Error('REDEMPTION_CLAIM_MISSING');
    const quote = quoteRedemption(snapshot.series, snapshot.vaultRaw, side, amount, amount, false,
      snapshot.clock.unixTimestamp, snapshot.clock.unixTimestamp + 300n);
    const builders = new DividendXInstructions(DIVIDENDX_IDL as Idl);
    await this.send(owner === 'buyer' ? 'redeem-buyer' : 'redeem-provider',
      owner === 'buyer' ? 'buyer_redeem_purchased_dr' : 'provider_redeem_remaining_pt', signers[owner], [builders.holder.redeem({
        holder: signers[owner].publicKey, assetPolicy: known.assetPolicy, series: known.series.series,
        collateralMint: signers.collateralMint.publicKey, vault: known.series.vault,
        holderCollateral: owner === 'buyer' ? known.buyerCollateral : known.providerCollateral,
        claimMint: side === 'dr' ? known.series.drMint : known.series.ptMint,
        holderClaim: claimAccount, tokenProgram: TOKEN_PROGRAM_ID, collateralTokenProgram: TOKEN_2022_PROGRAM_ID,
      }, side, amount, false, quote.guard)]);
    if (owner === 'provider') await this.assertFinalResidual();
  }

  private async coherentRead() {
    const { connection, signers, known, manifest } = this.requireSession();
    const addresses = [
      SYSVAR_CLOCK_PUBKEY, known.assetPolicy, known.series.series, known.series.accumulator,
      signers.collateralMint.publicKey, known.series.vault,
      known.providerCollateral, known.providerPt, known.providerDr, known.providerQuote,
      known.buyerCollateral, known.buyerPt, known.buyerDr, known.buyerQuote,
      known.series.ptMint, known.series.drMint, CIRCLE_DEVNET_USDC_MINT,
      ...(this.pool ? [this.pool.vaultA, this.pool.vaultB, this.pool.lpMint, this.pool.providerLp, this.pool.poolId] : []),
    ];
    const response = await connection.getMultipleAccountsInfoAndContext(addresses, { commitment: 'confirmed' });
    if (response.value.some((info) => info === null)) throw new Error('COHERENT_SNAPSHOT_ACCOUNT_MISSING');
    const info = response.value as NonNullable<(typeof response.value)[number]>[];
    const owned = (index: number, owner: PublicKey, label: string) => {
      if (!info[index]!.owner.equals(owner)) throw new Error(`${label} owner mismatch`);
      return info[index]!;
    };
    const clock = decodeClockAccount(info[0]!, response.context.slot);
    const policy = normalizeAssetPolicyAccount(known.assetPolicy,
      decodeProgramAccount(DIVIDENDX_IDL as Idl, 'assetPolicy', owned(1, DIVIDENDX_PROGRAM_ID, 'asset policy').data));
    const series = normalizeSeriesAccount(known.series.series,
      decodeProgramAccount(DIVIDENDX_IDL as Idl, 'series', owned(2, DIVIDENDX_PROGRAM_ID, 'series').data));
    const accumulator = normalizeAccumulatorAccount(known.series.accumulator,
      decodeProgramAccount(DIVIDENDX_IDL as Idl, 'accumulator', owned(3, DIVIDENDX_PROGRAM_ID, 'accumulator').data));
    const stockMint = unpackMint(signers.collateralMint.publicKey, owned(4, TOKEN_2022_PROGRAM_ID, 'stock mint'), TOKEN_2022_PROGRAM_ID);
    const stockProfile = await inspectMintProfile(stockMint, clock);
    const vault = unpackAccount(known.series.vault, owned(5, TOKEN_2022_PROGRAM_ID, 'DividendX vault'), TOKEN_2022_PROGRAM_ID);
    const tokenAccount = (index: number, address: PublicKey, mint: PublicKey, authority: PublicKey, program = TOKEN_PROGRAM_ID) => {
      const account = unpackAccount(address, owned(index, program, `token account ${address.toBase58()}`), program);
      if (!account.mint.equals(mint) || !account.owner.equals(authority)) throw new Error(`token account ${address.toBase58()} identity mismatch`);
      return account;
    };
    const providerStock = tokenAccount(6, known.providerCollateral, signers.collateralMint.publicKey, signers.provider.publicKey, TOKEN_2022_PROGRAM_ID);
    const providerPt = tokenAccount(7, known.providerPt, known.series.ptMint, signers.provider.publicKey);
    const providerDr = tokenAccount(8, known.providerDr, known.series.drMint, signers.provider.publicKey);
    const providerQuote = tokenAccount(9, known.providerQuote, CIRCLE_DEVNET_USDC_MINT, signers.provider.publicKey);
    const buyerStock = tokenAccount(10, known.buyerCollateral, signers.collateralMint.publicKey, signers.buyer.publicKey, TOKEN_2022_PROGRAM_ID);
    const buyerPt = tokenAccount(11, known.buyerPt, known.series.ptMint, signers.buyer.publicKey);
    const buyerDr = tokenAccount(12, known.buyerDr, known.series.drMint, signers.buyer.publicKey);
    const buyerQuote = tokenAccount(13, known.buyerQuote, CIRCLE_DEVNET_USDC_MINT, signers.buyer.publicKey);
    const ptMint = unpackMint(known.series.ptMint, owned(14, TOKEN_PROGRAM_ID, 'PT mint'), TOKEN_PROGRAM_ID);
    const drMint = unpackMint(known.series.drMint, owned(15, TOKEN_PROGRAM_ID, 'DR mint'), TOKEN_PROGRAM_ID);
    const quoteMintInfo = owned(16, TOKEN_PROGRAM_ID, 'USDC mint');
    if (hash(quoteMintInfo.data) !== CIRCLE_DEVNET_USDC_CAPTURE_SHA256) throw new Error('USDC_MINT_BYTES_CHANGED');
    const quoteMint = unpackMint(CIRCLE_DEVNET_USDC_MINT, quoteMintInfo, TOKEN_PROGRAM_ID);
    if (quoteMint.decimals !== TEST_QUOTE_DECIMALS
      || !quoteMint.mintAuthority?.equals(CIRCLE_DEVNET_USDC_MINT_AUTHORITY)
      || !quoteMint.freezeAuthority?.equals(CIRCLE_DEVNET_USDC_FREEZE_AUTHORITY)) throw new Error('USDC_MINT_IDENTITY_CHANGED');
    if (!policy.collateralMint.equals(signers.collateralMint.publicKey) || !series.assetPolicy.equals(known.assetPolicy)
      || !series.collateralMint.equals(signers.collateralMint.publicKey) || !series.ptMint.equals(known.series.ptMint)
      || !series.drMint.equals(known.series.drMint) || !series.vault.equals(known.series.vault)
      || !accumulator.series.equals(known.series.series) || !vault.mint.equals(signers.collateralMint.publicKey)
      || !vault.owner.equals(known.series.series)) throw new Error('COHERENT_SNAPSHOT_IDENTITY_MISMATCH');
    let poolData: ReturnType<typeof CpmmPoolInfoLayout.decode> | null = null;
    let poolVaultA: ReturnType<typeof unpackAccount> | null = null;
    let poolVaultB: ReturnType<typeof unpackAccount> | null = null;
    let lpMint: ReturnType<typeof unpackMint> | null = null;
    let providerLp: ReturnType<typeof unpackAccount> | null = null;
    if (this.pool) {
      poolVaultA = unpackAccount(this.pool.vaultA, owned(17, TOKEN_PROGRAM_ID, 'pool vault A'), TOKEN_PROGRAM_ID);
      poolVaultB = unpackAccount(this.pool.vaultB, owned(18, TOKEN_PROGRAM_ID, 'pool vault B'), TOKEN_PROGRAM_ID);
      lpMint = unpackMint(this.pool.lpMint, owned(19, TOKEN_PROGRAM_ID, 'LP mint'), TOKEN_PROGRAM_ID);
      providerLp = tokenAccount(20, this.pool.providerLp, this.pool.lpMint, signers.provider.publicKey);
      poolData = CpmmPoolInfoLayout.decode(owned(21, RAYDIUM_CPMM_PROGRAM_ID, 'Raydium pool').data);
      if (!poolData.vaultA.equals(this.pool.vaultA) || !poolData.vaultB.equals(this.pool.vaultB)
        || !poolData.mintLp.equals(this.pool.lpMint)
        || !(poolData.mintA.equals(known.series.drMint) && poolData.mintB.equals(CIRCLE_DEVNET_USDC_MINT)
          || poolData.mintB.equals(known.series.drMint) && poolData.mintA.equals(CIRCLE_DEVNET_USDC_MINT))) {
        throw new Error('POOL_IDENTITY_MISMATCH');
      }
    }
    return { contextSlot: response.context.slot, genesisHash: manifest.expectedGenesisHash, clock, policy, series, accumulator,
      stockMint, stockProfile, vault, providerStock, providerPt, providerDr, providerQuote,
      buyerStock, buyerPt, buyerDr, buyerQuote, ptMint, drMint, quoteMint,
      poolData, poolVaultA, poolVaultB, lpMint, providerLp };
  }

  private async readAmmBalances(requirePool: boolean): Promise<AssetBalances> {
    const value = await this.coherentRead();
    if (requirePool && !value.poolData) throw new Error('POOL_UNAVAILABLE');
    let drPool = 0n; let quotePool = 0n; let lpInternal = 0n;
    let drProtocol = 0n; let drFund = 0n; let drCreator = 0n;
    let quoteProtocol = 0n; let quoteFund = 0n; let quoteCreator = 0n;
    if (value.poolData && value.poolVaultA && value.poolVaultB) {
      const drIsA = value.poolData.mintA.equals(this.known!.series.drMint);
      const raw = (key: keyof typeof value.poolData): bigint => BigInt((value.poolData![key] as { toString(): string }).toString());
      const drSuffix = drIsA ? 'MintA' : 'MintB'; const quoteSuffix = drIsA ? 'MintB' : 'MintA';
      drPool = drIsA ? value.poolVaultA.amount : value.poolVaultB.amount;
      quotePool = drIsA ? value.poolVaultB.amount : value.poolVaultA.amount;
      drProtocol = raw(`protocolFees${drSuffix}` as keyof typeof value.poolData); drFund = raw(`fundFees${drSuffix}` as keyof typeof value.poolData); drCreator = raw(`creatorFees${drSuffix}` as keyof typeof value.poolData);
      quoteProtocol = raw(`protocolFees${quoteSuffix}` as keyof typeof value.poolData); quoteFund = raw(`fundFees${quoteSuffix}` as keyof typeof value.poolData); quoteCreator = raw(`creatorFees${quoteSuffix}` as keyof typeof value.poolData);
      lpInternal = raw('lpAmount');
    }
    const controlledQuote = value.providerQuote.amount + value.buyerQuote.amount + quotePool;
    if (controlledQuote !== CIRCLE_USDC_REQUIRED_FUNDING_RAW) throw new Error('LOCAL_USDC_CONSERVATION_FAILED');
    const testQuote = { provider: value.providerQuote.amount, buyer: value.buyerQuote.amount, poolVault: quotePool,
      poolProtocolFees: quoteProtocol, poolFundFees: quoteFund, poolCreatorFees: quoteCreator, otherKnown: 0n,
      supply: value.quoteMint.supply, controlledTotal: CIRCLE_USDC_REQUIRED_FUNDING_RAW } as AssetBalances['testQuote'] & { controlledTotal: bigint };
    return {
      collateral: { provider: value.providerStock.amount, vault: value.vault.amount, supply: value.stockMint.supply },
      pt: { provider: value.providerPt.amount, otherKnown: value.buyerPt.amount, supply: value.ptMint.supply },
      dr: { provider: value.providerDr.amount, buyer: value.buyerDr.amount, poolVault: drPool,
        poolProtocolFees: drProtocol, poolFundFees: drFund, poolCreatorFees: drCreator, otherKnown: 0n, supply: value.drMint.supply },
      testQuote,
      lp: { provider: value.providerLp?.amount ?? 0n, mintSupply: value.lpMint?.supply ?? 0n, internalPoolLpAmount: lpInternal },
    };
  }

  private async snapshot(): Promise<DemoSnapshot> {
    const { connection, signers, known } = this.requireSession();
    const value = await this.coherentRead();
    let poolView: DemoSnapshot['pool'] = null;
    let providerLp = 0n;
    let poolDr = 0n;
    let poolQuote = 0n;
    if (value.poolData && value.poolVaultA && value.poolVaultB && value.lpMint && value.providerLp && this.pool) {
      const drIsA = value.poolData.mintA.equals(known.series.drMint);
      poolDr = drIsA ? value.poolVaultA.amount : value.poolVaultB.amount;
      poolQuote = drIsA ? value.poolVaultB.amount : value.poolVaultA.amount;
      providerLp = value.providerLp.amount;
      const internalLp = BigInt(value.poolData.lpAmount.toString());
      if (internalLp < value.lpMint.supply) throw new Error('LOCKED_LP_ACCOUNTING_INVALID');
      poolView = { address: this.pool.poolId.toBase58(), drRaw: poolDr.toString(), quoteRaw: poolQuote.toString(),
        lockedLpRaw: (internalLp - value.lpMint.supply).toString() };
    }
    const knownStock = value.providerStock.amount + value.buyerStock.amount + value.vault.amount;
    const knownPt = value.providerPt.amount + value.buyerPt.amount;
    const knownDr = value.providerDr.amount + value.buyerDr.amount + poolDr;
    const knownQuote = value.providerQuote.amount + value.buyerQuote.amount + poolQuote;
    const custodyHealthy = value.series.phase === 'finalized'
      ? value.vault.amount === requiredCustodyRaw(value.series)
      : value.vault.amount === value.ptMint.supply && value.ptMint.supply === value.drMint.supply;
    const backingVerified = knownStock === value.stockMint.supply && knownPt === value.ptMint.supply
      && knownDr === value.drMint.supply && knownQuote === CIRCLE_USDC_REQUIRED_FUNDING_RAW && custodyHealthy;
    return {
      observedAt: new Date().toISOString(), slot: Number(value.clock.slot), unixTimestamp: value.clock.unixTimestamp.toString(),
      genesisHash: value.genesisHash, rpcUrl: connection.rpcEndpoint,
      dividendXProgram: DIVIDENDX_PROGRAM_ID.toBase58(), raydiumProgram: RAYDIUM_CPMM_PROGRAM_ID.toBase58(),
      series: known.series.series.toBase58(), year: SERIES_YEAR, phase: value.series.phase,
      eventCount: value.series.eventCount, stockDecimals: value.stockMint.decimals, quoteDecimals: value.quoteMint.decimals,
      quoteAsset: { symbol: 'USDC', provenance: 'local-circle-devnet-clone', canonicalMint: CIRCLE_DEVNET_USDC_MINT.toBase58() },
      lpDecimals: value.lpMint?.decimals ?? 9, stockMultiplierBits: value.stockProfile.scale.activeBits.toString(),
      provider: { address: signers.provider.publicKey.toBase58(), stockRaw: value.providerStock.amount.toString(),
        ptRaw: value.providerPt.amount.toString(), drRaw: value.providerDr.amount.toString(),
        quoteRaw: value.providerQuote.amount.toString(), lpRaw: providerLp.toString() },
      buyer: { address: signers.buyer.publicKey.toBase58(), stockRaw: value.buyerStock.amount.toString(),
        ptRaw: value.buyerPt.amount.toString(), drRaw: value.buyerDr.amount.toString(),
        quoteRaw: value.buyerQuote.amount.toString(), lpRaw: '0' },
      mints: { stock: signers.collateralMint.publicKey.toBase58(), pt: known.series.ptMint.toBase58(), dr: known.series.drMint.toBase58(),
        quote: CIRCLE_DEVNET_USDC_MINT.toBase58(), lp: this.pool?.lpMint.toBase58() ?? null },
      pool: poolView, vaultRaw: value.vault.amount.toString(), ptSupplyRaw: value.ptMint.supply.toString(),
      drSupplyRaw: value.drMint.supply.toString(), backingVerified, swap: this.swap,
    };
  }

  private async assertFinalResidual(): Promise<void> {
    const { connection, known } = this.requireSession();
    const snapshot = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL as Idl, {
      assetPolicy: known.assetPolicy, series: known.series.series, accumulator: known.series.accumulator,
      collateralMint: this.signers!.collateralMint.publicKey, vault: known.series.vault,
    });
    const balances = await this.readAmmBalances(true);
    if (snapshot.series.phase !== 'finalized' || snapshot.vaultRaw !== requiredCustodyRaw(snapshot.series)
      || balances.pt.supply !== 0n || balances.dr.supply !== balances.dr.poolVault || balances.dr.poolVault <= 0n
      || balances.dr.provider !== 0n || balances.dr.buyer !== 0n || balances.lp.provider !== 0n
      || balances.lp.internalPoolLpAmount !== 100n) throw new Error('FINAL_RESIDUAL_BACKING_FAILED');
  }

  stopSurfnet(): void {
    if (this.drain) clearInterval(this.drain);
    this.drain = null;
    try { this.surfnet?.stop(); } catch {}
    this.surfnet = null;
  }

  stop(): void { this.stopSurfnet(); }
}
