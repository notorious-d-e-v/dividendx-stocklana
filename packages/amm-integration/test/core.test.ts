import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { DIVIDENDX_IDL, DividendXInstructions, configPda } from '@dividendx/transaction-sdk';
import {
  FLOW, RAYDIUM_CPMM_PROGRAM_ID, assertControlledConservation, assertRecombineDelta,
  assertSoleProviderWithdrawal, assertSwapDelta, assertSwapInstructionBounds, assertWithdrawBoundary, minimumOutput,
  quoteCreatorDisabledSwap,
} from '../src/index.js';
import { loadOrCreateStateSigner } from '../src/state.js';
import type { AmmConfigSnapshot, AssetBalances } from '../src/types.js';

const config: AmmConfigSnapshot = {
  address: '5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy', bump: 253, disableCreatePool: false,
  index: 0, tradeFeeRate: 2500n, protocolFeeRate: 120000n, fundFeeRate: 40000n,
  createPoolFee: 150000000n, protocolOwner: 'DRay33UmULQCeawH3dVpJfN3uqLj6Qtq4ymSRx2pAgGK',
  fundOwner: 'DRay33UmULQCeawH3dVpJfN3uqLj6Qtq4ymSRx2pAgGK', creatorFeeRate: 2500n,
};

function balances(): AssetBalances {
  return {
    collateral: { provider: 0n, vault: 10_000n, supply: 10_000n },
    pt: { provider: 10_000n, otherKnown: 0n, supply: 10_000n },
    dr: { provider: 1_000n, buyer: 2_000n, poolVault: 7_000n, poolProtocolFees: 0n, poolFundFees: 0n, poolCreatorFees: 0n, otherKnown: 0n, supply: 10_000n },
    testQuote: { provider: 1_000n, buyer: 2_000n, poolVault: 7_000n, poolProtocolFees: 0n, poolFundFees: 0n, poolCreatorFees: 0n, otherKnown: 0n, supply: 10_000n },
    lp: { provider: 0n, mintSupply: 0n, internalPoolLpAmount: 100n },
  };
}

test('creator-disabled quote ignores configured creator rate and enforces min out', () => {
  const quote = quoteCreatorDisabledSwap(FLOW.buyerQuoteRaw, 200n * 10n ** 6n, 100n * 10n ** 8n,
    config, false, FLOW.slippageBps);
  assert.equal(quote.creatorFee, 0n);
  assert.equal(quote.tradeFee, 50_000n);
  assert.equal(quote.protocolFee, 6_000n);
  assert.equal(quote.fundFee, 2_000n);
  assert.equal(quote.minimumOutput, minimumOutput(quote.outputAmount, 50));
  assert.ok(quote.outputAmount > 0n);
  assert.throws(() => quoteCreatorDisabledSwap(1n, 100n, 100n, config, true, 50), /creator-fee-disabled/);
});

test('pinned SDK dependency builds a register instruction across package dependency realms', () => {
  const admin = Keypair.generate();
  const attestor = Keypair.generate();
  const mint = Keypair.generate();
  const policy = Keypair.generate();
  const SdkPublicKey = new DividendXInstructions(DIVIDENDX_IDL).raw.programId.constructor as typeof PublicKey;
  assert.doesNotThrow(() => new DividendXInstructions(DIVIDENDX_IDL).admin.registerAsset({
    config: configPda().address, admin: admin.publicKey, collateralMint: mint.publicKey,
    assetPolicy: policy.publicKey, systemProgram: SystemProgram.programId,
  }, { issuerId: new Uint8Array(32).fill(1), symbol: 'DXT',
    attestor: new SdkPublicKey(attestor.publicKey.toBytes()), policyDigest: new Uint8Array(32).fill(2) }));
});

test('swap instruction contains the exact input and nonzero minimum output', () => {
  const data = Buffer.alloc(24);
  Buffer.from([143, 190, 90, 218, 196, 30, 51, 222]).copy(data);
  data.writeBigUInt64LE(20_000_000n, 8);
  data.writeBigUInt64LE(9_000_000n, 16);
  const transaction = new Transaction().add(new TransactionInstruction({ programId: RAYDIUM_CPMM_PROGRAM_ID, keys: [], data }));
  assert.doesNotThrow(() => assertSwapInstructionBounds(transaction, 20_000_000n, 9_000_000n));
  assert.throws(() => assertSwapInstructionBounds(transaction, 20_000_000n, 0n));
  Buffer.from([55, 217, 98, 86, 163, 74, 180, 173]).copy(data);
  assert.throws(() => assertSwapInstructionBounds(new Transaction().add(new TransactionInstruction({ programId: RAYDIUM_CPMM_PROGRAM_ID, keys: [], data })), 20_000_000n, 9_000_000n));
});

test('four-asset accounting includes buyer and locked pool residual', () => {
  const before = balances();
  assert.doesNotThrow(() => assertControlledConservation(before));
  assert.doesNotThrow(() => assertWithdrawBoundary(before));
  const afterSwap = structuredClone(before);
  afterSwap.dr.buyer += 500n;
  afterSwap.dr.poolVault -= 500n;
  afterSwap.testQuote.buyer -= 1_000n;
  afterSwap.testQuote.poolVault += 1_000n;
  assert.equal(assertSwapDelta(before, afterSwap, {
    inputQuote: 1_000n, outputDr: 500n, minimumDr: 499n, protocolFee: 0n, fundFee: 0n,
  }), 500n);

  const afterRecombine = structuredClone(afterSwap);
  afterRecombine.collateral.provider += 500n;
  afterRecombine.collateral.vault -= 500n;
  afterRecombine.pt.provider -= 500n;
  afterRecombine.pt.supply -= 500n;
  afterRecombine.dr.provider -= 500n;
  afterRecombine.dr.supply -= 500n;
  afterRecombine.collateral.supply = 10_000n;
  assert.doesNotThrow(() => assertRecombineDelta(afterSwap, afterRecombine, 500n));
});

test('controlled quote conservation does not equate official USDC balances to global supply', () => {
  const before = balances();
  before.testQuote.controlledTotal = before.testQuote.provider + before.testQuote.buyer + before.testQuote.poolVault;
  before.testQuote.supply = 1_000_000_000_000n;
  assert.doesNotThrow(() => assertControlledConservation(before));
  const after = structuredClone(before);
  after.dr.buyer += 500n;
  after.dr.poolVault -= 500n;
  after.testQuote.buyer -= 1_000n;
  after.testQuote.poolVault += 1_000n;
  after.testQuote.supply += 50_000n;
  assert.doesNotThrow(() => assertSwapDelta(before, after, {
    inputQuote: 1_000n, outputDr: 500n, minimumDr: 499n, protocolFee: 0n, fundFee: 0n,
  }));
  after.testQuote.buyer += 1n;
  assert.throws(() => assertControlledConservation(after), /QUOTE_CONSERVATION_FAILED/);
});

test('state signers persist privately without exposing secret material', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'amm-state-'));
  const directory = join(parent, 'private');
  const first = await loadOrCreateStateSigner(directory, 'provider');
  const second = await loadOrCreateStateSigner(directory, 'provider');
  assert.equal(first.publicKey.toBase58(), second.publicKey.toBase58());
  assert.equal((await stat(directory)).mode & 0o077, 0);
  assert.equal((await stat(join(directory, 'provider.json'))).mode & 0o077, 0);
  assert.equal((JSON.parse(await readFile(join(directory, 'provider.json'), 'utf8')) as number[]).length, 64);
});

test('sole-provider withdrawal preserves fees and exact locked-LP residuals', () => {
  const before = balances();
  before.dr = { provider: 0n, buyer: 0n, poolVault: 10_000n, poolProtocolFees: 6n,
    poolFundFees: 2n, poolCreatorFees: 0n, otherKnown: 0n, supply: 10_000n };
  before.testQuote = { ...before.dr };
  before.lp = { provider: 900n, mintSupply: 900n, internalPoolLpAmount: 1_000n };
  const after = structuredClone(before);
  after.dr.provider = 8_992n;
  after.dr.poolVault = 1_008n;
  after.testQuote.provider = 8_992n;
  after.testQuote.poolVault = 1_008n;
  after.lp = { provider: 0n, mintSupply: 0n, internalPoolLpAmount: 100n };
  assert.doesNotThrow(() => assertSoleProviderWithdrawal(before, after));
  after.dr.poolVault += 1n;
  assert.throws(() => assertSoleProviderWithdrawal(before, after));
});
