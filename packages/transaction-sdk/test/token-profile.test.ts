import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ExtensionType, type Mint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { concatBytes, u16Le } from '../src/bytes.js';
import { f64ToBits } from '../src/arithmetic.js';
import { inspectMintProfile } from '../src/token-profile.js';
import type { ChainClock } from '../src/types.js';

const MINT = new PublicKey('So11111111111111111111111111111111111111112');
const AUTHORITY = new PublicKey('Vote111111111111111111111111111111111111111');

function tlv(type: ExtensionType, data: Uint8Array): Uint8Array {
  return concatBytes(u16Le(type), u16Le(data.length), data);
}

test('multi-extension profile fingerprint matches the program byte contract', async () => {
  const scaled = new Uint8Array(56);
  scaled.set(AUTHORITY.toBytes(), 0);
  const scaledView = new DataView(scaled.buffer);
  scaledView.setBigUint64(32, f64ToBits(1), true);
  scaledView.setBigInt64(40, 500n, true);
  scaledView.setBigUint64(48, f64ToBits(1.25), true);
  const metadata = concatBytes(AUTHORITY.toBytes(), MINT.toBytes());
  const pausable = concatBytes(AUTHORITY.toBytes(), Uint8Array.of(0));
  const transferHook = concatBytes(AUTHORITY.toBytes(), new Uint8Array(32));
  const defaultState = Uint8Array.of(1);
  const entries = [
    [ExtensionType.PausableConfig, pausable],
    [ExtensionType.MetadataPointer, metadata],
    [ExtensionType.ScaledUiAmountConfig, scaled],
    [ExtensionType.DefaultAccountState, defaultState],
    [ExtensionType.TransferHook, transferHook],
  ] as const;
  const mint: Mint = {
    address: MINT,
    mintAuthority: AUTHORITY,
    supply: 0n,
    decimals: 6,
    isInitialized: true,
    freezeAuthority: null,
    tlvData: Buffer.from(concatBytes(...entries.map(([type, data]) => tlv(type, data)))),
  };
  const clock: ChainClock = {
    slot: 1n,
    epochStartTimestamp: 0n,
    epoch: 0n,
    leaderScheduleEpoch: 0n,
    unixTimestamp: 500n,
    contextSlot: 1,
  };
  const profile = await inspectMintProfile(mint, clock);
  assert.equal(profile.accountingFactorsSupported, true);
  assert.equal(profile.scale.activeBits, f64ToBits(1.25));

  const sorted = [...entries].sort(([left], [right]) => left - right);
  const expectedParts: Uint8Array[] = [
    new TextEncoder().encode('dividendx:mint-controls:v1'),
    MINT.toBytes(),
    Uint8Array.of(1), AUTHORITY.toBytes(),
    Uint8Array.of(0), new Uint8Array(32),
  ];
  for (const [type, data] of sorted) {
    expectedParts.push(u16Le(type));
    if (type === ExtensionType.MetadataPointer || type === ExtensionType.ScaledUiAmountConfig || type === ExtensionType.PausableConfig) {
      expectedParts.push(data.subarray(0, 32));
    } else {
      expectedParts.push(data);
    }
  }
  const expected = createHash('sha256').update(concatBytes(...expectedParts)).digest('hex');
  assert.equal(Buffer.from(profile.controlsFingerprint).toString('hex'), expected);
  assert.equal(profile.extensionsMask,
    (1n << BigInt(ExtensionType.PausableConfig))
      | (1n << BigInt(ExtensionType.MetadataPointer))
      | (1n << BigInt(ExtensionType.ScaledUiAmountConfig))
      | (1n << BigInt(ExtensionType.DefaultAccountState))
      | (1n << BigInt(ExtensionType.TransferHook)));

  scaledView.setBigUint64(32, f64ToBits(2 ** 32), true);
  const exitMint = { ...mint, tlvData: Buffer.from(concatBytes(...entries.map(([type, data]) => tlv(type, data)))) };
  const exitReadable = await inspectMintProfile(exitMint, clock);
  assert.equal(exitReadable.accountingFactorsSupported, false);
  assert.equal(exitReadable.scale.currentBits, f64ToBits(2 ** 32));
});
