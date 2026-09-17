import { createHash } from 'node:crypto';
import type { Idl } from '@anchor-lang/core';
import { CpmmPoolInfoLayout, Percent, Raydium, TxVersion } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID, ExtensionType, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction, createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction, createMintToCheckedInstruction, createTransferCheckedInstruction, getAccount,
  getAssociatedTokenAddressSync, getMintLen, getScaledUiAmountConfig, unpackAccount, unpackMint,
} from '@solana/spl-token';
import { type Connection, type Keypair, PublicKey, SystemProgram, type Transaction, type TransactionInstruction } from '@solana/web3.js';
import {
  DIVIDENDX_IDL, DIVIDENDX_PROGRAM_ID as SDK_DIVIDENDX_PROGRAM_ID, DividendXInstructions,
  annualSeriesAddresses, assetPolicyPda, configPda,
  fetchClock, fetchProgramAccountsCoherently, fetchQuoteSnapshot, issuerIdentityHash,
  normalizeConfigAccount, programDataAddress, quoteDeposit, quoteRecombine,
} from '@dividendx/transaction-sdk';
import {
  CIRCLE_DEVNET_USDC_FREEZE_AUTHORITY, CIRCLE_DEVNET_USDC_MINT, CIRCLE_DEVNET_USDC_MINT_AUTHORITY,
  CIRCLE_USDC_REQUIRED_FUNDING_RAW, CIRCLE_USDC_SOURCE_URL, CLAIM_DECIMALS, COLLATERAL_DECIMALS,
  DEVNET_GENESIS_HASH, DIVIDENDX_PROGRAM_ID, FLOW, RAYDIUM_CONFIG,
  RAYDIUM_CAPTURED_ELF_SHA256, RAYDIUM_CAPTURED_PROGRAM_DATA, RAYDIUM_CONFIG_OBSERVATION_SLOT,
  RAYDIUM_CPMM_PROGRAM_ID, RAYDIUM_CREATE_POOL_FEE_RECEIVER, RAYDIUM_PROGRAM_DEPLOY_SLOT,
  SERIES_YEAR, TEST_QUOTE_DECIMALS, USDC_FLOW, type QuoteMode,
} from './constants.js';
import {
  assertPrefinalBacking, assertRecombineDelta, assertSoleProviderWithdrawal, assertSwapDelta,
  assertWithdrawBoundary,
} from './accounting.js';
import { invariant } from './errors.js';
import {
  type CircleUsdcFundingPreflight, validateCircleDevnetUsdcMintInfo, verifyCircleDevnetUsdcFunding,
  verifyExecutionEnvironment,
} from './guards.js';
import { quoteCreatorDisabledSwap, assertSwapInstructionBounds } from './quote.js';
import { simulateSendAndConfirm, buildSimulateSend } from './transactions.js';
import type { AssetBalances, ConfirmedStepReceipt, ExecutionManifest, PreflightResult } from './types.js';

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function tokenDescriptor(address: PublicKey, decimals: number) {
  return { address: address.toBase58(), decimals, programId: TOKEN_PROGRAM_ID.toBase58() };
}

function sdkPublicKey(address: PublicKey): PublicKey {
  const SdkPublicKey = SDK_DIVIDENDX_PROGRAM_ID.constructor as typeof PublicKey;
  return new SdkPublicKey(address.toBytes());
}

function toFeeConfig(preflight: PreflightResult) {
  const value = preflight.config;
  return {
    id: value.address, index: value.index, protocolFeeRate: Number(value.protocolFeeRate),
    tradeFeeRate: Number(value.tradeFeeRate), fundFeeRate: Number(value.fundFeeRate),
    createPoolFee: value.createPoolFee.toString(), creatorFeeRate: Number(value.creatorFeeRate),
  };
}

export interface FlowSigners {
  admin: Keypair;
  attestor: Keypair;
  provider: Keypair;
  buyer: Keypair;
  collateralMint: Keypair;
  testQuoteMint?: Keypair;
}

type FlowAmounts = typeof FLOW;

interface QuotePlan {
  mode: QuoteMode;
  mint: PublicKey;
  flow: FlowAmounts;
  circle: CircleUsdcFundingPreflight | null;
  sourceAfterRaw: bigint | null;
}

interface KnownAddresses {
  issuerId: Uint8Array;
  assetPolicy: PublicKey;
  series: ReturnType<typeof annualSeriesAddresses>;
  providerCollateral: PublicKey;
  providerPt: PublicKey;
  providerDr: PublicKey;
  providerQuote: PublicKey;
  buyerDr: PublicKey;
  buyerQuote: PublicKey;
  quoteMint: PublicKey;
  quoteControlledTotal: bigint | null;
}

export interface QuoteAssetReceipt {
  mode: QuoteMode;
  label: 'Worthless test quote' | 'Test USDC';
  mint: string;
  decimals: 6;
  tokenProgram: string;
  globalSupplyRaw: string;
  controlledTotalRaw: string;
  provenance: null | {
    source: 'Circle';
    sourceUrl: string;
    cluster: 'devnet';
    observationSlot: number;
    accountDataLength: 82;
    initialized: true;
    observedSupplyRaw: string;
    mintDataSha256: string;
    mintAuthority: string;
    freezeAuthority: string;
  };
  funding: {
    method: 'mint-to-test-accounts' | 'admin-transfer-checked';
    sourceAccount: string | null;
    sourceBeforeRaw: string | null;
    sourceAfterRaw: string | null;
    providerAccount: string;
    providerFundedRaw: string;
    buyerAccount: string;
    buyerFundedRaw: string;
  };
}

export interface FlowReceipt {
  schema: 'dividendx-raydium-cpmm-receipt-v1';
  boundary: 'public-devnet' | 'local-captured-devnet-bytecode';
  generatedAt: string;
  preflight: PreflightResult;
  identities: Record<string, string>;
  amounts: Record<string, string | number>;
  transactions: ConfirmedStepReceipt[];
  checkpoints: Record<string, AssetBalances>;
  exactSwap: Record<string, string>;
  quoteAsset: QuoteAssetReceipt;
  captureProvenance: null | Record<string, string | number>;
  limits: string[];
}

async function requireFreshRun(connection: Connection, signers: FlowSigners, quote: QuotePlan,
  assetPolicy: PublicKey, series: PublicKey): Promise<void> {
  const addresses = [signers.collateralMint.publicKey, assetPolicy, series];
  if (quote.mode === 'mock') addresses.push(quote.mint);
  const infos = await connection.getMultipleAccountsInfo(addresses, 'confirmed');
  invariant(infos.every((info) => info === null), 'RUN_STATE_ALREADY_EXISTS',
    'this bounded runner requires a fresh state directory; persisted keys remain available for manual recovery');
}

async function buildQuotePlan(connection: Connection, manifest: ExecutionManifest, signers: FlowSigners,
  mode: QuoteMode): Promise<QuotePlan> {
  if (mode === 'mock') {
    invariant(signers.testQuoteMint !== undefined, 'MOCK_QUOTE_SIGNER_MISSING');
    return { mode, mint: signers.testQuoteMint.publicKey, flow: FLOW, circle: null, sourceAfterRaw: null };
  }
  invariant(manifest.mode === 'devnet' && manifest.expectedGenesisHash === DEVNET_GENESIS_HASH,
    'CIRCLE_USDC_REQUIRES_PUBLIC_DEVNET');
  invariant(signers.testQuoteMint === undefined, 'CIRCLE_USDC_SYNTHETIC_MINT_REFUSED');
  const circle = await verifyCircleDevnetUsdcFunding(connection, signers.admin.publicKey,
    signers.provider.publicKey, signers.buyer.publicKey);
  return { mode, mint: CIRCLE_DEVNET_USDC_MINT, flow: USDC_FLOW, circle, sourceAfterRaw: null };
}

async function prepareDividendX(connection: Connection, manifest: ExecutionManifest, signers: FlowSigners, quotePlan: QuotePlan,
  record: (receipt: ConfirmedStepReceipt) => Promise<void>,
  submitted: (name: string, signature: string) => Promise<void>): Promise<KnownAddresses> {
  const clock = await fetchClock(connection);
  const year = new Date(Number(clock.unixTimestamp) * 1_000).getUTCFullYear() + 1;
  invariant(year === SERIES_YEAR && manifest.expectedYear === SERIES_YEAR, 'YEAR_MISMATCH',
    'this frozen 2027 proof expires once chain time no longer permits a pre-year series');
  const issuerId = await issuerIdentityHash(`${manifest.mode}:${manifest.expectedGenesisHash}`, 'dividendx-raydium-test-issuer');
  const assetPolicy = assetPolicyPda(issuerId, signers.collateralMint.publicKey).address;
  const series = annualSeriesAddresses(issuerId, signers.collateralMint.publicKey, SERIES_YEAR);
  await requireFreshRun(connection, signers, quotePlan, assetPolicy, series.series);

  const builders = new DividendXInstructions(DIVIDENDX_IDL as Idl);
  const config = configPda().address;
  const configInfo = await connection.getAccountInfo(config, 'confirmed');
  if (configInfo === null) {
    await record(await buildSimulateSend(connection, 'initialize_dividendx_config', signers.admin, [
      builders.admin.initializeConfig({
        config, program: DIVIDENDX_PROGRAM_ID, programData: programDataAddress(),
        upgradeAuthority: signers.admin.publicKey, systemProgram: SystemProgram.programId,
      }, Buffer.from(manifest.deploymentDomainHex, 'hex')),
    ], [], submitted));
  } else {
    const snapshot = await fetchProgramAccountsCoherently(connection, DIVIDENDX_IDL as Idl,
      [{ address: config, accountName: 'config' }]);
    const current = normalizeConfigAccount(config, snapshot.accounts[0]!.value);
    invariant(current.admin.equals(signers.admin.publicKey)
      && Buffer.from(current.deploymentDomain).equals(Buffer.from(manifest.deploymentDomainHex, 'hex')),
    'DIVIDENDX_CONFIG_MISMATCH');
  }

  const providerTarget = 600_000_000;
  const buyerTarget = 50_000_000;
  const attestorTarget = 50_000_000;
  const [providerLamports, buyerLamports, attestorLamports] = await Promise.all([
    connection.getBalance(signers.provider.publicKey, 'confirmed'), connection.getBalance(signers.buyer.publicKey, 'confirmed'),
    connection.getBalance(signers.attestor.publicKey, 'confirmed'),
  ]);
  const funding: TransactionInstruction[] = [];
  if (providerLamports < providerTarget) funding.push(SystemProgram.transfer({
    fromPubkey: signers.admin.publicKey, toPubkey: signers.provider.publicKey, lamports: providerTarget - providerLamports,
  }));
  if (buyerLamports < buyerTarget) funding.push(SystemProgram.transfer({
    fromPubkey: signers.admin.publicKey, toPubkey: signers.buyer.publicKey, lamports: buyerTarget - buyerLamports,
  }));
  if (attestorLamports < attestorTarget) funding.push(SystemProgram.transfer({
    fromPubkey: signers.admin.publicKey, toPubkey: signers.attestor.publicKey, lamports: attestorTarget - attestorLamports,
  }));
  if (funding.length) await record(await buildSimulateSend(connection, 'fund_test_participants', signers.admin, funding, [], submitted));

  const collateralSpace = getMintLen([ExtensionType.ScaledUiAmountConfig]);
  const collateralRent = await connection.getMinimumBalanceForRentExemption(collateralSpace);
  await record(await buildSimulateSend(connection, 'create_test_collateral_mint', signers.admin, [
    SystemProgram.createAccount({ fromPubkey: signers.admin.publicKey, newAccountPubkey: signers.collateralMint.publicKey,
      lamports: collateralRent, space: collateralSpace, programId: TOKEN_2022_PROGRAM_ID }),
    createInitializeScaledUiAmountConfigInstruction(signers.collateralMint.publicKey, signers.admin.publicKey, 1, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(signers.collateralMint.publicKey, COLLATERAL_DECIMALS, signers.admin.publicKey, null, TOKEN_2022_PROGRAM_ID),
  ], [signers.collateralMint], submitted));
  if (quotePlan.mode === 'mock') {
    invariant(signers.testQuoteMint !== undefined, 'MOCK_QUOTE_SIGNER_MISSING');
    const quoteRent = await connection.getMinimumBalanceForRentExemption(82);
    await record(await buildSimulateSend(connection, 'create_worthless_test_quote_mint', signers.admin, [
      SystemProgram.createAccount({ fromPubkey: signers.admin.publicKey, newAccountPubkey: quotePlan.mint,
        lamports: quoteRent, space: 82, programId: TOKEN_PROGRAM_ID }),
      createInitializeMintInstruction(quotePlan.mint, TEST_QUOTE_DECIMALS, signers.admin.publicKey, null, TOKEN_PROGRAM_ID),
    ], [signers.testQuoteMint], submitted));
  }

  await record(await buildSimulateSend(connection, 'register_test_asset', signers.admin, [
    builders.admin.registerAsset({ config, admin: signers.admin.publicKey, collateralMint: signers.collateralMint.publicKey,
      assetPolicy, systemProgram: SystemProgram.programId }, {
      issuerId, symbol: 'DXT', attestor: sdkPublicKey(signers.attestor.publicKey),
      policyDigest: await digest('dividendx-raydium-test-policy-v1'),
    }),
  ], [], submitted));
  const freshClock = await fetchClock(connection);
  await record(await buildSimulateSend(connection, 'refresh_test_asset_observation', signers.attestor, [
    builders.attestor.refreshObservation({ attestor: signers.attestor.publicKey, assetPolicy,
      collateralMint: signers.collateralMint.publicKey }, await digest('dividendx-raydium-test-observation-v1'),
    freshClock.unixTimestamp + 7_200n),
  ], [], submitted));
  await record(await buildSimulateSend(connection, 'create_2027_series', signers.admin, [
    builders.permissionless.createSeries({ payer: signers.admin.publicKey, assetPolicy, series: series.series,
      accumulator: series.accumulator, ptMint: series.ptMint, drMint: series.drMint,
      collateralMint: signers.collateralMint.publicKey, vault: series.vault, tokenProgram: TOKEN_PROGRAM_ID,
      collateralTokenProgram: TOKEN_2022_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId }, SERIES_YEAR),
  ], [], submitted));

  const providerCollateral = getAssociatedTokenAddressSync(signers.collateralMint.publicKey, signers.provider.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const providerPt = getAssociatedTokenAddressSync(series.ptMint, signers.provider.publicKey);
  const providerDr = getAssociatedTokenAddressSync(series.drMint, signers.provider.publicKey);
  const providerQuote = getAssociatedTokenAddressSync(quotePlan.mint, signers.provider.publicKey);
  const buyerDr = getAssociatedTokenAddressSync(series.drMint, signers.buyer.publicKey);
  const buyerQuote = getAssociatedTokenAddressSync(quotePlan.mint, signers.buyer.publicKey);
  const ata = (payer: PublicKey, address: PublicKey, owner: PublicKey, mint: PublicKey, program = TOKEN_PROGRAM_ID) =>
    createAssociatedTokenAccountIdempotentInstruction(payer, address, owner, mint, program);
  const providerInstructions = [
    ata(signers.admin.publicKey, providerCollateral, signers.provider.publicKey, signers.collateralMint.publicKey, TOKEN_2022_PROGRAM_ID),
    ata(signers.admin.publicKey, providerPt, signers.provider.publicKey, series.ptMint),
    ata(signers.admin.publicKey, providerDr, signers.provider.publicKey, series.drMint),
    ata(signers.admin.publicKey, providerQuote, signers.provider.publicKey, quotePlan.mint),
    createMintToCheckedInstruction(signers.collateralMint.publicKey, providerCollateral, signers.admin.publicKey,
      quotePlan.flow.collateralDepositRaw, COLLATERAL_DECIMALS, [], TOKEN_2022_PROGRAM_ID),
  ];
  if (quotePlan.mode === 'mock') providerInstructions.push(createMintToCheckedInstruction(quotePlan.mint, providerQuote,
    signers.admin.publicKey, quotePlan.flow.seedQuoteRaw + quotePlan.flow.addQuoteRaw, TEST_QUOTE_DECIMALS));
  await record(await buildSimulateSend(connection, 'create_provider_token_accounts', signers.admin,
    providerInstructions, [], submitted));
  const buyerInstructions = [
    ata(signers.admin.publicKey, buyerDr, signers.buyer.publicKey, series.drMint),
    ata(signers.admin.publicKey, buyerQuote, signers.buyer.publicKey, quotePlan.mint),
  ];
  if (quotePlan.mode === 'mock') buyerInstructions.push(createMintToCheckedInstruction(quotePlan.mint, buyerQuote,
    signers.admin.publicKey, quotePlan.flow.buyerQuoteRaw, TEST_QUOTE_DECIMALS));
  await record(await buildSimulateSend(connection, 'create_buyer_token_accounts', signers.admin,
    buyerInstructions, [], submitted));
  if (quotePlan.circle) {
    invariant(providerQuote.equals(quotePlan.circle.providerAccount)
      && buyerQuote.equals(quotePlan.circle.buyerAccount), 'CIRCLE_USDC_FUNDING_ACCOUNT_INVALID');
    await record(await buildSimulateSend(connection, 'fund_circle_devnet_usdc_accounts', signers.admin, [
      createTransferCheckedInstruction(quotePlan.circle.sourceAccount, quotePlan.mint, providerQuote,
        signers.admin.publicKey, quotePlan.flow.seedQuoteRaw + quotePlan.flow.addQuoteRaw, TEST_QUOTE_DECIMALS),
      createTransferCheckedInstruction(quotePlan.circle.sourceAccount, quotePlan.mint, buyerQuote,
        signers.admin.publicKey, quotePlan.flow.buyerQuoteRaw, TEST_QUOTE_DECIMALS),
    ], [], submitted));
    const funded = await connection.getMultipleAccountsInfoAndContext(
      [quotePlan.circle.sourceAccount, providerQuote, buyerQuote], { commitment: 'confirmed' },
    );
    invariant(funded.value.every((info) => info !== null), 'CIRCLE_USDC_FUNDING_ACCOUNT_INVALID');
    const [sourceInfo, providerInfo, buyerInfo] = funded.value as NonNullable<(typeof funded.value)[number]>[];
    const source = unpackAccount(quotePlan.circle.sourceAccount, sourceInfo!, TOKEN_PROGRAM_ID);
    const providerFunded = unpackAccount(providerQuote, providerInfo!, TOKEN_PROGRAM_ID);
    const buyerFunded = unpackAccount(buyerQuote, buyerInfo!, TOKEN_PROGRAM_ID);
    quotePlan.sourceAfterRaw = source.amount;
    invariant(source.isInitialized && !source.isFrozen && source.mint.equals(quotePlan.mint)
      && source.owner.equals(signers.admin.publicKey)
      && providerFunded.isInitialized && !providerFunded.isFrozen && providerFunded.mint.equals(quotePlan.mint)
      && providerFunded.owner.equals(signers.provider.publicKey)
      && buyerFunded.isInitialized && !buyerFunded.isFrozen && buyerFunded.mint.equals(quotePlan.mint)
      && buyerFunded.owner.equals(signers.buyer.publicKey)
      && source.amount === quotePlan.circle.sourceBalanceRaw - CIRCLE_USDC_REQUIRED_FUNDING_RAW
      && providerFunded.amount === quotePlan.flow.seedQuoteRaw + quotePlan.flow.addQuoteRaw
      && buyerFunded.amount === quotePlan.flow.buyerQuoteRaw,
    'CIRCLE_USDC_FUNDING_DELTA_INVALID');
  }

  const holderAccounts = { holder: signers.provider.publicKey, assetPolicy, series: series.series,
    collateralMint: signers.collateralMint.publicKey, vault: series.vault, holderCollateral: providerCollateral,
    ptMint: series.ptMint, drMint: series.drMint, holderPt: providerPt, holderDr: providerDr,
    tokenProgram: TOKEN_PROGRAM_ID, collateralTokenProgram: TOKEN_2022_PROGRAM_ID };
  const snapshot = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL as Idl,
    { ...holderAccounts, accumulator: series.accumulator });
  const quote = quoteDeposit(snapshot.series, snapshot.policy, snapshot.vaultRaw, quotePlan.flow.collateralDepositRaw,
    snapshot.holderCollateralRaw!, snapshot.clock, snapshot.clock.unixTimestamp + 300n);
  await record(await buildSimulateSend(connection, 'deposit_100_test_stock', signers.provider, [
    builders.holder.deposit(holderAccounts, quote.inputRaw, quote.guard),
  ], [], submitted));
  return { issuerId, assetPolicy, series, providerCollateral, providerPt, providerDr, providerQuote, buyerDr, buyerQuote,
    quoteMint: quotePlan.mint,
    quoteControlledTotal: quotePlan.mode === 'circle-devnet-usdc' ? CIRCLE_USDC_REQUIRED_FUNDING_RAW : null };
}

interface PoolAddresses { poolId: PublicKey; lpMint: PublicKey; vaultA: PublicKey; vaultB: PublicKey }

async function validateFlowMints(connection: Connection, signers: FlowSigners, known: KnownAddresses,
  quotePlan: QuotePlan): Promise<void> {
  const addresses = [signers.collateralMint.publicKey, known.series.ptMint, known.series.drMint, known.quoteMint];
  const response = await connection.getMultipleAccountsInfoAndContext(addresses, { commitment: 'confirmed' });
  invariant(response.value.every((info) => info !== null), 'MINT_IDENTITY_INVALID');
  const [collateralInfo, ptInfo, drInfo, quoteInfo] = response.value as NonNullable<(typeof response.value)[number]>[];
  invariant(collateralInfo!.owner.equals(TOKEN_2022_PROGRAM_ID) && ptInfo!.owner.equals(TOKEN_PROGRAM_ID)
    && drInfo!.owner.equals(TOKEN_PROGRAM_ID) && quoteInfo!.owner.equals(TOKEN_PROGRAM_ID), 'MINT_PROGRAM_INVALID');
  const collateral = unpackMint(addresses[0]!, collateralInfo!, TOKEN_2022_PROGRAM_ID);
  const pt = unpackMint(addresses[1]!, ptInfo!, TOKEN_PROGRAM_ID);
  const dr = unpackMint(addresses[2]!, drInfo!, TOKEN_PROGRAM_ID);
  const quote = unpackMint(addresses[3]!, quoteInfo!, TOKEN_PROGRAM_ID);
  invariant(collateral.decimals === COLLATERAL_DECIMALS && getScaledUiAmountConfig(collateral) !== null
    && collateral.freezeAuthority === null, 'COLLATERAL_MINT_PROFILE_INVALID');
  invariant(pt.decimals === CLAIM_DECIMALS && dr.decimals === CLAIM_DECIMALS
    && pt.mintAuthority?.equals(known.series.series) && dr.mintAuthority?.equals(known.series.series)
    && pt.freezeAuthority === null && dr.freezeAuthority === null, 'CLAIM_MINT_PROFILE_INVALID');
  if (quotePlan.mode === 'circle-devnet-usdc') {
    validateCircleDevnetUsdcMintInfo(quoteInfo!);
  } else {
    invariant(quote.decimals === TEST_QUOTE_DECIMALS && quote.freezeAuthority === null, 'QUOTE_MINT_PROFILE_INVALID');
  }
}

async function readBalances(connection: Connection, signers: FlowSigners, known: KnownAddresses,
  pool: PoolAddresses): Promise<AssetBalances> {
  const providerLp = getAssociatedTokenAddressSync(pool.lpMint, signers.provider.publicKey);
  const addresses = [known.providerCollateral, known.series.vault, known.providerPt, known.providerDr, known.buyerDr,
    known.providerQuote, known.buyerQuote, pool.vaultA, pool.vaultB, signers.collateralMint.publicKey,
    known.series.ptMint, known.series.drMint, known.quoteMint, pool.lpMint, providerLp, pool.poolId];
  const response = await connection.getMultipleAccountsInfoAndContext(addresses, { commitment: 'confirmed' });
  invariant(response.value.every((info) => info !== null), 'ACCOUNTING_ACCOUNT_MISSING');
  const infos = response.value as NonNullable<(typeof response.value)[number]>[];
  const collateral = unpackAccount(addresses[0]!, infos[0]!, TOKEN_2022_PROGRAM_ID);
  const vault = unpackAccount(addresses[1]!, infos[1]!, TOKEN_2022_PROGRAM_ID);
  const pt = unpackAccount(addresses[2]!, infos[2]!, TOKEN_PROGRAM_ID);
  const providerDr = unpackAccount(addresses[3]!, infos[3]!, TOKEN_PROGRAM_ID);
  const buyerDr = unpackAccount(addresses[4]!, infos[4]!, TOKEN_PROGRAM_ID);
  const providerQuote = unpackAccount(addresses[5]!, infos[5]!, TOKEN_PROGRAM_ID);
  const buyerQuote = unpackAccount(addresses[6]!, infos[6]!, TOKEN_PROGRAM_ID);
  const vaultA = unpackAccount(addresses[7]!, infos[7]!, TOKEN_PROGRAM_ID);
  const vaultB = unpackAccount(addresses[8]!, infos[8]!, TOKEN_PROGRAM_ID);
  const collateralMint = unpackMint(addresses[9]!, infos[9]!, TOKEN_2022_PROGRAM_ID);
  const ptMint = unpackMint(addresses[10]!, infos[10]!, TOKEN_PROGRAM_ID);
  const drMint = unpackMint(addresses[11]!, infos[11]!, TOKEN_PROGRAM_ID);
  const quoteMint = unpackMint(addresses[12]!, infos[12]!, TOKEN_PROGRAM_ID);
  const lpMint = unpackMint(addresses[13]!, infos[13]!, TOKEN_PROGRAM_ID);
  const providerLpAccount = unpackAccount(addresses[14]!, infos[14]!, TOKEN_PROGRAM_ID);
  invariant(infos[15]!.owner.equals(RAYDIUM_CPMM_PROGRAM_ID), 'POOL_IDENTITY_MISMATCH');
  const poolData = CpmmPoolInfoLayout.decode(infos[15]!.data);
  invariant(poolData.vaultA.equals(pool.vaultA) && poolData.vaultB.equals(pool.vaultB)
    && poolData.mintLp.equals(pool.lpMint), 'POOL_IDENTITY_MISMATCH');
  const mintA = poolData.mintA;
  const drIsA = mintA.equals(known.series.drMint);
  const drVault = drIsA ? vaultA.amount : vaultB.amount;
  const quoteVault = drIsA ? vaultB.amount : vaultA.amount;
  const raw = (key: keyof typeof poolData): bigint => BigInt((poolData[key] as { toString(): string }).toString());
  const suffix = drIsA ? 'MintA' : 'MintB';
  const quoteSuffix = drIsA ? 'MintB' : 'MintA';
  return {
    collateral: { provider: collateral.amount, vault: vault.amount, supply: collateralMint.supply },
    pt: { provider: pt.amount, otherKnown: 0n, supply: ptMint.supply },
    dr: { provider: providerDr.amount, buyer: buyerDr.amount, poolVault: drVault,
      poolProtocolFees: raw(`protocolFees${suffix}` as keyof typeof poolData), poolFundFees: raw(`fundFees${suffix}` as keyof typeof poolData),
      poolCreatorFees: raw(`creatorFees${suffix}` as keyof typeof poolData), otherKnown: 0n, supply: drMint.supply },
    testQuote: { provider: providerQuote.amount, buyer: buyerQuote.amount, poolVault: quoteVault,
      poolProtocolFees: raw(`protocolFees${quoteSuffix}` as keyof typeof poolData), poolFundFees: raw(`fundFees${quoteSuffix}` as keyof typeof poolData),
      poolCreatorFees: raw(`creatorFees${quoteSuffix}` as keyof typeof poolData), otherKnown: 0n, supply: quoteMint.supply,
      ...(known.quoteControlledTotal === null ? {} : { controlledTotal: known.quoteControlledTotal }) },
    lp: { provider: providerLpAccount.amount, mintSupply: lpMint.supply, internalPoolLpAmount: raw('lpAmount') },
  };
}

function assertSeedAndAdd(before: AssetBalances, after: AssetBalances, flow: FlowAmounts): void {
  invariant(before.dr.provider - after.dr.provider === flow.addDrRaw
    && before.testQuote.provider - after.testQuote.provider === flow.addQuoteRaw
    && after.dr.poolVault - before.dr.poolVault === flow.addDrRaw
    && after.testQuote.poolVault - before.testQuote.poolVault === flow.addQuoteRaw
    && after.lp.provider > before.lp.provider, 'ADD_LIQUIDITY_DELTA_FAILED');
  assertPrefinalBacking(after);
}

async function waitForPoolOpen(connection: Connection, openTime: bigint): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if ((await fetchClock(connection)).unixTimestamp >= openTime) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error('POOL_OPEN_TIMEOUT');
}

export interface FlowProgress {
  submitted: { name: string; signature: string }[];
  transactions: ConfirmedStepReceipt[];
  checkpoints: Record<string, AssetBalances>;
}

export async function runAmmFlow(connection: Connection, manifest: ExecutionManifest, signers: FlowSigners,
  progress?: (value: FlowProgress) => Promise<void>, quoteMode: QuoteMode = 'mock'): Promise<FlowReceipt> {
  const receipts: ConfirmedStepReceipt[] = [];
  const submissions: { name: string; signature: string }[] = [];
  const checkpoints: Record<string, AssetBalances> = {};
  const publish = async () => progress?.({ submitted: [...submissions], transactions: [...receipts], checkpoints: structuredClone(checkpoints) });
  const submitted = async (name: string, signature: string) => { submissions.push({ name, signature }); await publish(); };
  const record = async (receipt: ConfirmedStepReceipt) => { receipts.push(receipt); await publish(); };
  const controlled = [signers.admin, signers.attestor, signers.provider, signers.buyer];
  const initialBalances = await Promise.all(controlled.map((signer) => connection.getBalance(signer.publicKey, 'confirmed')));
  const initialLamports = initialBalances.reduce((sum, amount) => sum + BigInt(amount), 0n);
  invariant(BigInt(manifest.maxRunSpendLamports) >= 300_000_000n && initialLamports >= 300_000_000n,
    'RUN_SPEND_BUDGET');
  const topup = (current: number, target: number) => BigInt(Math.max(0, target - current));
  const requiredAdmin = topup(initialBalances[2]!, 600_000_000) + topup(initialBalances[3]!, 50_000_000)
    + topup(initialBalances[1]!, 50_000_000) + 100_000_000n;
  invariant(BigInt(initialBalances[0]!) >= requiredAdmin, 'INSUFFICIENT_ADMIN_SOL');
  const preflight = await verifyExecutionEnvironment(connection, manifest);
  const quotePlan = await buildQuotePlan(connection, manifest, signers, quoteMode);
  const flow = quotePlan.flow;
  const known = await prepareDividendX(connection, manifest, signers, quotePlan, record, submitted);
  await validateFlowMints(connection, signers, known, quotePlan);
  const freshPreflight = await verifyExecutionEnvironment(connection, manifest);
  invariant(JSON.stringify(freshPreflight.config, (_key, value) => typeof value === 'bigint' ? value.toString() : value)
    === JSON.stringify(preflight.config, (_key, value) => typeof value === 'bigint' ? value.toString() : value),
  'RAYDIUM_CONFIG_CHANGED');

  const raydiumProvider = await Raydium.load({ connection, cluster: 'devnet', owner: signers.provider,
    disableLoadToken: true, disableFeatureCheck: true, blockhashCommitment: 'confirmed' });
  const dr = tokenDescriptor(known.series.drMint, CLAIM_DECIMALS);
  const quoteToken = tokenDescriptor(known.quoteMint, TEST_QUOTE_DECIMALS);
  const drFirst = Buffer.compare(known.series.drMint.toBuffer(), known.quoteMint.toBuffer()) < 0;
  const mintA = drFirst ? dr : quoteToken;
  const mintB = drFirst ? quoteToken : dr;
  const amountA = drFirst ? flow.seedDrRaw : flow.seedQuoteRaw;
  const amountB = drFirst ? flow.seedQuoteRaw : flow.seedDrRaw;
  const created = await raydiumProvider.cpmm.createPool({ programId: RAYDIUM_CPMM_PROGRAM_ID,
    poolFeeAccount: RAYDIUM_CREATE_POOL_FEE_RECEIVER, mintA, mintB, mintAAmount: new BN(amountA.toString()),
    mintBAmount: new BN(amountB.toString()), startTime: new BN(0), feeConfig: toFeeConfig(freshPreflight),
    associatedOnly: true, ownerInfo: { feePayer: signers.provider.publicKey, useSOLBalance: false }, txVersion: TxVersion.LEGACY });
  await record(await simulateSendAndConfirm(connection, 'create_cpmm_pool', created.transaction,
    [signers.provider, ...created.signers], 'confirmed', submitted));
  await raydiumProvider.account.fetchWalletTokenAccounts({ forceUpdate: true, commitment: 'confirmed' });
  const pool: PoolAddresses = { poolId: created.extInfo.address.poolId, lpMint: created.extInfo.address.lpMint,
    vaultA: created.extInfo.address.vaultA, vaultB: created.extInfo.address.vaultB };
  let info = await raydiumProvider.cpmm.getPoolInfoFromRpc(pool.poolId.toBase58());
  invariant(info.rpcData.configId.equals(RAYDIUM_CONFIG) && info.rpcData.mintA.equals(new PublicKey(mintA.address))
    && info.rpcData.mintB.equals(new PublicKey(mintB.address)) && !info.rpcData.enableCreatorFee,
  'POOL_IDENTITY_MISMATCH');
  checkpoints.seeded = await readBalances(connection, signers, known, pool);
  invariant(checkpoints.seeded.dr.poolVault === flow.seedDrRaw
    && checkpoints.seeded.testQuote.poolVault === flow.seedQuoteRaw, 'SEED_DELTA_FAILED');
  assertPrefinalBacking(checkpoints.seeded);
  await publish();

  const added = await raydiumProvider.cpmm.addLiquidity({ poolInfo: info.poolInfo, poolKeys: info.poolKeys,
    inputAmount: new BN(flow.addDrRaw.toString()), baseIn: info.rpcData.mintA.equals(known.series.drMint),
    slippage: new Percent(0, 10_000), txVersion: TxVersion.LEGACY });
  await record(await simulateSendAndConfirm(connection, 'add_cpmm_liquidity', added.transaction,
    [signers.provider, ...added.signers], 'confirmed', submitted));
  await raydiumProvider.account.fetchWalletTokenAccounts({ forceUpdate: true, commitment: 'confirmed' });
  info = await raydiumProvider.cpmm.getPoolInfoFromRpc(pool.poolId.toBase58());
  checkpoints.added = await readBalances(connection, signers, known, pool);
  assertSeedAndAdd(checkpoints.seeded, checkpoints.added, flow);
  await publish();
  await waitForPoolOpen(connection, BigInt(info.rpcData.openTime.toString()));

  const quoteIsA = info.rpcData.mintA.equals(known.quoteMint);
  const inputReserve = BigInt((quoteIsA ? info.rpcData.baseReserve : info.rpcData.quoteReserve).toString());
  const outputReserve = BigInt((quoteIsA ? info.rpcData.quoteReserve : info.rpcData.baseReserve).toString());
  invariant(!info.rpcData.enableCreatorFee, 'CREATOR_FEE_POOL_REFUSED');
  const swapPreflight = await verifyExecutionEnvironment(connection, manifest);
  const swapQuote = quoteCreatorDisabledSwap(flow.buyerQuoteRaw, inputReserve, outputReserve,
    swapPreflight.config, info.rpcData.enableCreatorFee, flow.slippageBps);
  const raydiumBuyer = await Raydium.load({ connection, cluster: 'devnet', owner: signers.buyer,
    disableLoadToken: true, disableFeatureCheck: true, blockhashCommitment: 'confirmed' });
  const swapped = await raydiumBuyer.cpmm.swap({ poolInfo: info.poolInfo, poolKeys: info.poolKeys,
    inputAmount: new BN(flow.buyerQuoteRaw.toString()), swapResult: swapQuote.sdkSwapResult,
    baseIn: quoteIsA, fixedOut: false, slippage: flow.slippageBps / 10_000, txVersion: TxVersion.LEGACY });
  assertSwapInstructionBounds(swapped.transaction as Transaction, flow.buyerQuoteRaw, swapQuote.minimumOutput);
  await record(await simulateSendAndConfirm(connection, 'buyer_swap_quote_for_dr', swapped.transaction,
    [signers.buyer, ...swapped.signers], 'confirmed', submitted));
  info = await raydiumProvider.cpmm.getPoolInfoFromRpc(pool.poolId.toBase58());
  checkpoints.swapped = await readBalances(connection, signers, known, pool);
  assertSwapDelta(checkpoints.added, checkpoints.swapped, {
    inputQuote: flow.buyerQuoteRaw, outputDr: swapQuote.outputAmount, minimumDr: swapQuote.minimumOutput,
    protocolFee: swapQuote.protocolFee, fundFee: swapQuote.fundFee,
  });
  await publish();

  const lpRaw = checkpoints.swapped.lp.provider;
  invariant(lpRaw > 0n, 'LP_BALANCE_MISSING');
  await raydiumProvider.account.fetchWalletTokenAccounts({ forceUpdate: true, commitment: 'confirmed' });
  const withdrawn = await raydiumProvider.cpmm.withdrawLiquidity({ poolInfo: info.poolInfo, poolKeys: info.poolKeys,
    lpAmount: new BN(lpRaw.toString()), slippage: new Percent(flow.slippageBps, 10_000), txVersion: TxVersion.LEGACY });
  await record(await simulateSendAndConfirm(connection, 'withdraw_all_provider_lp', withdrawn.transaction,
    [signers.provider, ...withdrawn.signers], 'confirmed', submitted));
  info = await raydiumProvider.cpmm.getPoolInfoFromRpc(pool.poolId.toBase58());
  checkpoints.withdrawn = await readBalances(connection, signers, known, pool);
  assertSoleProviderWithdrawal(checkpoints.swapped, checkpoints.withdrawn);
  assertWithdrawBoundary(checkpoints.withdrawn);
  await publish();

  const recombineRaw = checkpoints.withdrawn.dr.provider < checkpoints.withdrawn.pt.provider
    ? checkpoints.withdrawn.dr.provider : checkpoints.withdrawn.pt.provider;
  invariant(recombineRaw > 0n, 'RECOMBINE_AMOUNT_INVALID');
  const builders = new DividendXInstructions(DIVIDENDX_IDL as Idl);
  const holderAccounts = { holder: signers.provider.publicKey, assetPolicy: known.assetPolicy,
    series: known.series.series, collateralMint: signers.collateralMint.publicKey, vault: known.series.vault,
    holderCollateral: known.providerCollateral, ptMint: known.series.ptMint, drMint: known.series.drMint,
    holderPt: known.providerPt, holderDr: known.providerDr, tokenProgram: TOKEN_PROGRAM_ID,
    collateralTokenProgram: TOKEN_2022_PROGRAM_ID };
  const recombineSnapshot = await fetchQuoteSnapshot(connection, DIVIDENDX_IDL as Idl,
    { ...holderAccounts, accumulator: known.series.accumulator });
  const recombineQuote = quoteRecombine(recombineSnapshot.series, recombineSnapshot.vaultRaw, recombineRaw,
    recombineSnapshot.holderPtRaw!, recombineSnapshot.holderDrRaw!, recombineSnapshot.clock.unixTimestamp,
    recombineSnapshot.clock.unixTimestamp + 300n);
  await record(await buildSimulateSend(connection, 'recombine_recovered_dr_with_pt', signers.provider, [
    builders.holder.recombine(holderAccounts, recombineRaw, recombineQuote.guard),
  ], [], submitted));
  info = await raydiumProvider.cpmm.getPoolInfoFromRpc(pool.poolId.toBase58());
  checkpoints.recombined = await readBalances(connection, signers, known, pool);
  assertRecombineDelta(checkpoints.withdrawn, checkpoints.recombined, recombineRaw);
  assertPrefinalBacking(checkpoints.recombined);
  await publish();

  const finalLamports = (await Promise.all(controlled.map((signer) => connection.getBalance(signer.publicKey, 'confirmed'))))
    .reduce((sum, amount) => sum + BigInt(amount), 0n);
  invariant(initialLamports - finalLamports <= BigInt(manifest.maxRunSpendLamports),
    'RUN_SPEND_BUDGET');
  const controlledQuoteRaw = flow.seedQuoteRaw + flow.addQuoteRaw + flow.buyerQuoteRaw;
  const quoteAsset: QuoteAssetReceipt = {
    mode: quotePlan.mode, label: quotePlan.mode === 'circle-devnet-usdc' ? 'Test USDC' : 'Worthless test quote',
    mint: known.quoteMint.toBase58(), decimals: TEST_QUOTE_DECIMALS, tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
    globalSupplyRaw: checkpoints.recombined.testQuote.supply.toString(), controlledTotalRaw: controlledQuoteRaw.toString(),
    provenance: quotePlan.circle ? {
      source: 'Circle', sourceUrl: CIRCLE_USDC_SOURCE_URL, cluster: 'devnet',
      observationSlot: quotePlan.circle.contextSlot, accountDataLength: 82, initialized: true,
      observedSupplyRaw: quotePlan.circle.mintSupplyRaw.toString(), mintDataSha256: quotePlan.circle.mintDataSha256,
      mintAuthority: CIRCLE_DEVNET_USDC_MINT_AUTHORITY.toBase58(),
      freezeAuthority: CIRCLE_DEVNET_USDC_FREEZE_AUTHORITY.toBase58(),
    } : null,
    funding: {
      method: quotePlan.circle ? 'admin-transfer-checked' : 'mint-to-test-accounts',
      sourceAccount: quotePlan.circle?.sourceAccount.toBase58() ?? null,
      sourceBeforeRaw: quotePlan.circle?.sourceBalanceRaw.toString() ?? null,
      sourceAfterRaw: quotePlan.sourceAfterRaw?.toString() ?? null,
      providerAccount: known.providerQuote.toBase58(),
      providerFundedRaw: (flow.seedQuoteRaw + flow.addQuoteRaw).toString(),
      buyerAccount: known.buyerQuote.toBase58(), buyerFundedRaw: flow.buyerQuoteRaw.toString(),
    },
  };
  return {
    schema: 'dividendx-raydium-cpmm-receipt-v1',
    boundary: manifest.mode === 'devnet' ? 'public-devnet' : 'local-captured-devnet-bytecode',
    generatedAt: new Date().toISOString(), preflight: freshPreflight,
    identities: { admin: signers.admin.publicKey.toBase58(), attestor: signers.attestor.publicKey.toBase58(),
      provider: signers.provider.publicKey.toBase58(), buyer: signers.buyer.publicKey.toBase58(),
      collateralMint: signers.collateralMint.publicKey.toBase58(), ptMint: known.series.ptMint.toBase58(),
      drMint: known.series.drMint.toBase58(), testQuoteMint: known.quoteMint.toBase58(),
      collateralTokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(), claimTokenProgram: TOKEN_PROGRAM_ID.toBase58(),
      testQuoteTokenProgram: TOKEN_PROGRAM_ID.toBase58(), pool: pool.poolId.toBase58(), lpMint: pool.lpMint.toBase58() },
    amounts: { ...Object.fromEntries(Object.entries(flow).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value])),
      recombinedRaw: recombineRaw.toString() }, transactions: receipts, checkpoints,
    exactSwap: { quoteInputRaw: flow.buyerQuoteRaw.toString(), quotedDrOutputRaw: swapQuote.outputAmount.toString(),
      minimumDrOutputRaw: swapQuote.minimumOutput.toString(), actualDrOutputRaw: swapQuote.outputAmount.toString(),
      tradeFeeRaw: swapQuote.tradeFee.toString(), protocolFeeRaw: swapQuote.protocolFee.toString(),
      fundFeeRaw: swapQuote.fundFee.toString(), creatorFeeRaw: '0' },
    quoteAsset,
    captureProvenance: manifest.mode === 'local-clone' ? {
      sourceCluster: 'devnet', sourceProgramData: RAYDIUM_CAPTURED_PROGRAM_DATA.toBase58(),
      sourceProgramDeploySlot: RAYDIUM_PROGRAM_DEPLOY_SLOT,
      sourceConfigObservationSlot: RAYDIUM_CONFIG_OBSERVATION_SLOT,
      capturedLoaderPayloadSha256: RAYDIUM_CAPTURED_ELF_SHA256,
    } : null,
    limits: [quotePlan.mode === 'circle-devnet-usdc'
      ? 'Artificial DR/Test USDC ratio; devnet faucet units have no mainnet value or redemption right.'
      : 'Artificial DR/test-quote ratio; test quote has no value or redemption right.',
      'No Raydium website or indexer listing is claimed.', 'Public 2027 claims cannot mature during this run; independent redemption is outside this receipt.'],
  };
}
