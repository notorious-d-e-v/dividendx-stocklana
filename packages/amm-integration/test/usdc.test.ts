import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_SIZE, AccountLayout, AccountState, MINT_SIZE, MintLayout, TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { type AccountInfo, type Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  CIRCLE_DEVNET_USDC_FREEZE_AUTHORITY, CIRCLE_DEVNET_USDC_MINT, CIRCLE_DEVNET_USDC_MINT_AUTHORITY,
  CIRCLE_USDC_REQUIRED_FUNDING_RAW, USDC_FLOW, validateCircleDevnetUsdcMintInfo,
  verifyCircleDevnetUsdcFunding,
} from '../src/index.js';

const zero = new PublicKey(new Uint8Array(32));

function info(data: Buffer, owner = TOKEN_PROGRAM_ID): AccountInfo<Buffer> {
  return { data, owner, executable: false, lamports: 1, rentEpoch: 0 };
}

function mintData(decimals = 6, mintAuthority = CIRCLE_DEVNET_USDC_MINT_AUTHORITY): Buffer {
  const data = Buffer.alloc(MINT_SIZE);
  MintLayout.encode({
    mintAuthorityOption: 1, mintAuthority,
    supply: 1_000_000_000n, decimals, isInitialized: true,
    freezeAuthorityOption: 1, freezeAuthority: CIRCLE_DEVNET_USDC_FREEZE_AUTHORITY,
  }, data);
  return data;
}

function tokenAccountData(mint: PublicKey, owner: PublicKey, amount: bigint): Buffer {
  const data = Buffer.alloc(ACCOUNT_SIZE);
  AccountLayout.encode({
    mint, owner, amount, delegateOption: 0, delegate: zero, state: AccountState.Initialized,
    isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: zero,
  }, data);
  return data;
}

function connectionWith(value: (AccountInfo<Buffer> | null)[]): Connection {
  return { getMultipleAccountsInfoAndContext: async () => ({ context: { slot: 499_829_920 }, value }) } as unknown as Connection;
}

test('Circle quote constants use the reviewed mint and bounded 4/6/1 USDC flow', () => {
  assert.equal(CIRCLE_DEVNET_USDC_MINT.toBase58(), '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  assert.equal(USDC_FLOW.seedQuoteRaw, 4_000_000n);
  assert.equal(USDC_FLOW.addQuoteRaw, 6_000_000n);
  assert.equal(USDC_FLOW.buyerQuoteRaw, 1_000_000n);
  assert.equal(USDC_FLOW.seedQuoteRaw + USDC_FLOW.addQuoteRaw + USDC_FLOW.buyerQuoteRaw,
    CIRCLE_USDC_REQUIRED_FUNDING_RAW);
});

test('Circle mint validator rejects unsupported owner and profile', () => {
  assert.match(validateCircleDevnetUsdcMintInfo(info(mintData())), /^[0-9a-f]{64}$/);
  assert.throws(() => validateCircleDevnetUsdcMintInfo(info(mintData(), Keypair.generate().publicKey)),
    /CIRCLE_USDC_MINT_INVALID/);
  assert.throws(() => validateCircleDevnetUsdcMintInfo(info(mintData(9))), /CIRCLE_USDC_MINT_INVALID/);
  assert.throws(() => validateCircleDevnetUsdcMintInfo(info(mintData(6, Keypair.generate().publicKey))),
    /CIRCLE_USDC_MINT_INVALID/);
});

test('Circle funding preflight requires 11 USDC and fresh recipient accounts', async () => {
  const admin = Keypair.generate().publicKey;
  const provider = Keypair.generate().publicKey;
  const buyer = Keypair.generate().publicKey;
  const source = tokenAccountData(
    CIRCLE_DEVNET_USDC_MINT, admin, CIRCLE_USDC_REQUIRED_FUNDING_RAW + 5n,
  );
  const accepted = await verifyCircleDevnetUsdcFunding(connectionWith([info(mintData()), info(source), null, null]),
    admin, provider, buyer);
  assert.equal(accepted.sourceBalanceRaw, CIRCLE_USDC_REQUIRED_FUNDING_RAW + 5n);
  assert.equal(accepted.mintSupplyRaw, 1_000_000_000n);
  await assert.rejects(verifyCircleDevnetUsdcFunding(connectionWith([
    info(mintData()),
    info(tokenAccountData(CIRCLE_DEVNET_USDC_MINT, admin,
      CIRCLE_USDC_REQUIRED_FUNDING_RAW - 1n)),
    null, null,
  ]), admin, provider, buyer), /CIRCLE_USDC_FUNDING_INSUFFICIENT/);
  await assert.rejects(verifyCircleDevnetUsdcFunding(connectionWith([
    info(mintData()), info(source), info(tokenAccountData(
      CIRCLE_DEVNET_USDC_MINT, provider, 0n)), null,
  ]), admin, provider, buyer), /CIRCLE_USDC_RECIPIENT_NOT_FRESH/);
});
