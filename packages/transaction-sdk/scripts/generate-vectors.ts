import { createHash } from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import anchorCore from '@anchor-lang/core';
import { PublicKey, SystemProgram, type TransactionInstruction } from '@solana/web3.js';
import { f64ToBits } from '../src/arithmetic.js';
import { DIVIDENDX_IDL } from '../src/idl.js';
import { DividendXInstructions, type InstructionAccounts } from '../src/instructions.js';
import { configPda, programDataAddress } from '../src/pdas.js';

const { convertIdlToCamelCase } = anchorCore;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const idl = convertIdlToCamelCase(DIVIDENDX_IDL);

function key(label: string): PublicKey {
  return new PublicKey(createHash('sha256').update(`dividendx-sdk-vector:${label}`).digest());
}

const accounts: Record<string, PublicKey> = {};
for (const instruction of idl.instructions) {
  for (const account of instruction.accounts) {
    if (!('accounts' in account)) accounts[account.name] ??= key(account.name);
  }
}
Object.assign(accounts, {
  config: configPda().address,
  program: new PublicKey(idl.address),
  programData: programDataAddress(),
  upgradeAuthority: key('upgradeAuthority'),
  systemProgram: SystemProgram.programId,
});
const accountMap: InstructionAccounts = accounts;
const digest = (byte: number) => new Uint8Array(32).fill(byte);
const guard = { expectedStateVersion: 9n, expiryUnixTimestamp: 1_800_000_000n, minimumRawOutput: 7n };
const builders = new DividendXInstructions(DIVIDENDX_IDL);
const named: [string, TransactionInstruction][] = [
  ['initialize_config', builders.admin.initializeConfig(accountMap, digest(1))],
  ['register_asset', builders.admin.registerAsset(accountMap, { issuerId: digest(2), symbol: 'KOx', attestor: accounts.attestor!, policyDigest: digest(3) })],
  ['set_asset_admission', builders.admin.setAssetAdmission(accountMap, true)],
  ['refresh_observation', builders.attestor.refreshObservation(accountMap, digest(4), 1_800_003_600n)],
  ['create_series', builders.permissionless.createSeries(accountMap, 2027)],
  ['deposit', builders.holder.deposit(accountMap, 10n, guard)],
  ['recombine', builders.holder.recombine(accountMap, 10n, guard)],
  ['upsert_event', builders.attestor.upsertEvent(accountMap, {
    eventId: digest(5), revision: 1n, exDate: 20270701, status: 'qualified',
    m0Bits: f64ToBits(1), m1Bits: f64ToBits(1.1), sourceFinal: true,
    originalEffectiveTimestamp: 1_800_000_000n, paymentDate: 20270715,
    observedSlot: 100n, evidenceDigest: digest(6),
  })],
  ['begin_finalization', builders.attestor.beginFinalization(accountMap, 1n, digest(7), digest(8))],
  ['accumulate_event', builders.permissionless.accumulateEvent(accountMap)],
  ['complete_finalization', builders.permissionless.completeFinalization(accountMap)],
  ['abort_finalization', builders.attestor.abortFinalization(accountMap, digest(9))],
  ['redeem', builders.holder.redeem(accountMap, 'dr', 10n, false, guard)],
];

const vectors = named.map(([name, instruction]) => ({
  name,
  programId: instruction.programId.toBase58(),
  accounts: instruction.keys.map((account) => ({
    pubkey: account.pubkey.toBase58(),
    isSigner: account.isSigner,
    isWritable: account.isWritable,
  })),
  dataHex: Buffer.from(instruction.data).toString('hex'),
}));
const output = resolve(packageRoot, 'test-vectors/instructions.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(vectors, null, 2)}\n`);
const protocolOutput = resolve(packageRoot, '../../tests/protocol/fixtures/sdk-instructions.json');
await mkdir(dirname(protocolOutput), { recursive: true });
await copyFile(output, protocolOutput);
process.stdout.write(`${output}\n`);
