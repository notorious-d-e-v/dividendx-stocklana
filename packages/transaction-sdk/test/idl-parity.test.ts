import assert from 'node:assert/strict';
import test from 'node:test';
import anchorCore from '@anchor-lang/core';
import { PublicKey } from '@solana/web3.js';
import { concatBytes, i64Le, u32Le, u64Le } from '../src/bytes.js';
import { decodeProgramAccount, normalizeConfigAccount } from '../src/accounts.js';
import { f64ToBits } from '../src/arithmetic.js';
import { DIVIDENDX_IDL } from '../src/idl.js';
import { DividendXInstructions, type InstructionAccounts } from '../src/instructions.js';

const { BorshAccountsCoder, convertIdlToCamelCase } = anchorCore;
const idl = convertIdlToCamelCase(DIVIDENDX_IDL);

function key(seed: number): PublicKey {
  const bytes = new Uint8Array(32);
  bytes.fill(seed);
  return new PublicKey(bytes);
}

const allAccounts: InstructionAccounts = Object.fromEntries(
  Array.from(new Set(idl.instructions.flatMap((instruction) => instruction.accounts.map((account) => account.name))))
    .map((name, index) => [name, key(index + 1)]),
);
const digest = (byte: number) => new Uint8Array(32).fill(byte);
const guard = { expectedStateVersion: 9n, expiryUnixTimestamp: -2n, minimumRawOutput: 7n };
const eventInput = {
  eventId: digest(3),
  revision: 5n,
  exDate: 0,
  status: 'qualified' as const,
  m0Bits: f64ToBits(1),
  m1Bits: f64ToBits(1.1),
  sourceFinal: false,
  originalEffectiveTimestamp: -4n,
  paymentDate: 0,
  observedSlot: 6n,
  evidenceDigest: digest(7),
};

test('all generated-IDL instruction account metas and discriminators match SDK builders', () => {
  const builders = new DividendXInstructions(DIVIDENDX_IDL);
  const instructions = [
    builders.admin.initializeConfig(allAccounts, digest(1)),
    builders.admin.registerAsset(allAccounts, { issuerId: digest(2), symbol: 'KOx', attestor: key(30), policyDigest: digest(4) }),
    builders.admin.setAssetAdmission(allAccounts, true),
    builders.attestor.refreshObservation(allAccounts, digest(5), 100n),
    builders.permissionless.createSeries(allAccounts, 2027),
    builders.holder.deposit(allAccounts, 10n, guard),
    builders.holder.recombine(allAccounts, 10n, guard),
    builders.attestor.upsertEvent(allAccounts, eventInput),
    builders.attestor.beginFinalization(allAccounts, 8n, digest(8), digest(9)),
    builders.permissionless.accumulateEvent(allAccounts),
    builders.permissionless.completeFinalization(allAccounts),
    builders.attestor.abortFinalization(allAccounts, digest(10)),
    builders.holder.redeem(allAccounts, 'pt', 10n, false, guard),
  ];
  const expectedNames = [
    'initializeConfig', 'registerAsset', 'setAssetAdmission', 'refreshObservation', 'createSeries',
    'deposit', 'recombine', 'upsertEvent', 'beginFinalization', 'accumulateEvent',
    'completeFinalization', 'abortFinalization', 'redeem',
  ];
  assert.equal(instructions.length, idl.instructions.length);
  for (const [index, instruction] of instructions.entries()) {
    const name = expectedNames[index]!;
    const definition = idl.instructions.find((candidate) => candidate.name === name)!;
    assert.deepEqual(Array.from(instruction.data.subarray(0, 8)), definition.discriminator);
    assert.equal(instruction.keys.length, definition.accounts.length);
    for (const [accountIndex, meta] of instruction.keys.entries()) {
      const account = definition.accounts[accountIndex]!;
      assert.ok(!('accounts' in account), 'unexpected composite accounts in generated IDL');
      if ('accounts' in account) continue;
      assert.equal(meta.pubkey.toBase58(), (account.address ? new PublicKey(account.address) : allAccounts[account.name]!).toBase58());
      assert.equal(meta.isSigner, account.signer ?? false);
      assert.equal(meta.isWritable, account.writable ?? false);
    }
    assert.equal(builders.raw.coder.decode(instruction.data)?.name, name);
  }
});

test('deposit and event bytes match an independent Borsh construction', () => {
  const builders = new DividendXInstructions(DIVIDENDX_IDL);
  const deposit = builders.holder.deposit(allAccounts, 10n, guard);
  const depositDiscriminator = Uint8Array.from(idl.instructions.find((instruction) => instruction.name === 'deposit')!.discriminator);
  assert.deepEqual(
    deposit.data,
    Buffer.from(concatBytes(depositDiscriminator, u64Le(10n), u64Le(9n), i64Le(-2n), u64Le(7n))),
  );

  const upsert = builders.attestor.upsertEvent(allAccounts, eventInput);
  const upsertDiscriminator = Uint8Array.from(idl.instructions.find((instruction) => instruction.name === 'upsertEvent')!.discriminator);
  assert.deepEqual(upsert.data, Buffer.from(concatBytes(
    upsertDiscriminator,
    eventInput.eventId,
    u64Le(eventInput.revision),
    u32Le(eventInput.exDate),
    Uint8Array.of(1),
    u64Le(eventInput.m0Bits),
    u64Le(eventInput.m1Bits),
    Uint8Array.of(0),
    i64Le(eventInput.originalEffectiveTimestamp),
    u32Le(eventInput.paymentDate),
    u64Le(eventInput.observedSlot),
    eventInput.evidenceDigest,
  )));
});

test('generated account coder matches independent account bytes and keeps u64 lossless', async () => {
  const coder = new BorshAccountsCoder(idl);
  const admin = key(31);
  const configValue = { admin, deploymentDomain: Array.from(digest(11)), bump: 254 };
  const configEncoded = await coder.encode('config', configValue);
  const configDiscriminator = Uint8Array.from(idl.accounts!.find((account) => account.name === 'config')!.discriminator);
  assert.deepEqual(configEncoded, Buffer.from(concatBytes(configDiscriminator, admin.toBytes(), digest(11), Uint8Array.of(254))));
  assert.deepEqual(normalizeConfigAccount(key(1), decodeProgramAccount(DIVIDENDX_IDL, 'config', configEncoded)).deploymentDomain, digest(11));

  const headValue = {
    series: key(12),
    eventId: Array.from(digest(13)),
    index: 63,
    latestRevision: new anchorCore.BN('18446744073709551615'),
    latestRecordHash: Array.from(digest(14)),
    latestResolved: true,
    latestInYearQualified: false,
    bump: 253,
  };
  const headEncoded = await coder.encode('eventHead', headValue);
  const headDiscriminator = Uint8Array.from(idl.accounts!.find((account) => account.name === 'eventHead')!.discriminator);
  assert.deepEqual(headEncoded, Buffer.from(concatBytes(
    headDiscriminator,
    headValue.series.toBytes(),
    Uint8Array.from(headValue.eventId),
    Uint8Array.of(63),
    u64Le((1n << 64n) - 1n),
    Uint8Array.from(headValue.latestRecordHash),
    Uint8Array.of(1, 0, 253),
  )));
  const decoded = decodeProgramAccount(DIVIDENDX_IDL, 'eventHead', headEncoded);
  assert.equal(decoded.latestRevision, (1n << 64n) - 1n);
});

test('SDK validation rejects dates and authorities that the program rejects', () => {
  const builders = new DividendXInstructions(DIVIDENDX_IDL);
  assert.throws(() => builders.admin.registerAsset(allAccounts, {
    issuerId: digest(1), symbol: 'KOx', attestor: PublicKey.default, policyDigest: digest(2),
  }), /default public key/);
  assert.throws(() => builders.admin.registerAsset(allAccounts, {
    issuerId: digest(1), symbol: 'KOx', attestor: allAccounts.admin!, policyDigest: digest(2),
  }), /differ from admin/);
  assert.throws(() => builders.attestor.upsertEvent(allAccounts, {
    ...eventInput,
    status: 'pending',
    exDate: 20191231,
    m0Bits: 0n,
    m1Bits: 0n,
  }), /valid YYYYMMDD/);
  assert.throws(() => builders.attestor.upsertEvent(allAccounts, {
    ...eventInput,
    paymentDate: 21020101,
  }), /payment date/);
});
