import anchorCore, { type Idl, type IdlInstructionAccount, type IdlInstructionAccountItem } from '@anchor-lang/core';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { assertI64, assertU64, checkedDigest } from './bytes.js';
import { CLAIM_SIDE, DIVIDENDX_PROGRAM_ID, EVENT_STATUS } from './constants.js';
import { eventRetentionRatio } from './arithmetic.js';
import { invariant } from './errors.js';
import type { EventInput, Guard } from './types.js';

const { BN, BorshInstructionCoder, convertIdlToCamelCase } = anchorCore;

export type InstructionAccounts = Readonly<Record<string, PublicKey>>;

export interface InstructionBuilderOptions {
  programId?: PublicKey;
}

function anchorValue(value: unknown): unknown {
  if (typeof value === 'bigint') return new BN(value.toString(10), 10);
  if (value instanceof PublicKey) return value;
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(anchorValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, anchorValue(entry)]));
  }
  return value;
}

function flattenAccounts(items: readonly IdlInstructionAccountItem[]): IdlInstructionAccount[] {
  return items.flatMap((item) => 'accounts' in item ? flattenAccounts(item.accounts) : [item]);
}

function instructionName(idl: Idl, requested: string): string {
  const direct = idl.instructions.find((instruction) => instruction.name === requested);
  if (direct) return direct.name;
  const snake = requested.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const matched = idl.instructions.find((instruction) => instruction.name === snake);
  invariant(matched, 'IDL_MISMATCH', `IDL does not define ${requested}`);
  return matched.name;
}

function validatedGuard(value: Guard): Record<string, unknown> {
  assertU64(value.expectedStateVersion, 'guard expected state version');
  assertI64(value.expiryUnixTimestamp, 'guard expiry');
  assertU64(value.minimumRawOutput, 'guard minimum raw output');
  return {
    expectedStateVersion: value.expectedStateVersion,
    expiryUnixTimestamp: value.expiryUnixTimestamp,
    minimumRawOutput: value.minimumRawOutput,
  };
}

function validCivilDate(date: number): boolean {
  if (date === 0) return true;
  const year = Math.floor(date / 10_000);
  const month = Math.floor(date / 100) % 100;
  const day = date % 100;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 2020 && year <= 2101
    && parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function validatedEventInput(input: EventInput): Record<string, unknown> {
  checkedDigest(input.eventId, 'event ID');
  assertU64(input.revision, 'event revision', false);
  invariant(validCivilDate(input.exDate), 'INVALID_IDENTITY', 'ex-date must be zero or a valid YYYYMMDD civil date');
  assertU64(input.m0Bits, 'M0 bits');
  assertU64(input.m1Bits, 'M1 bits');
  if (input.status === 'qualified') {
    eventRetentionRatio(input.m0Bits, input.m1Bits);
  } else {
    invariant(input.m0Bits === 0n && input.m1Bits === 0n, 'INVALID_F64_BITS', 'nonqualified events must encode both factor fields as zero');
  }
  assertI64(input.originalEffectiveTimestamp, 'original effective timestamp');
  invariant(validCivilDate(input.paymentDate), 'INVALID_IDENTITY', 'payment date must be zero or a valid YYYYMMDD civil date');
  assertU64(input.observedSlot, 'observed slot');
  checkedDigest(input.evidenceDigest, 'event evidence digest');
  return {
    eventId: input.eventId,
    revision: input.revision,
    exDate: input.exDate,
    status: EVENT_STATUS[input.status],
    m0Bits: input.m0Bits,
    m1Bits: input.m1Bits,
    sourceFinal: input.sourceFinal,
    originalEffectiveTime: input.originalEffectiveTimestamp,
    sourcePaymentDate: input.paymentDate,
    observedSlot: input.observedSlot,
    evidenceDigest: input.evidenceDigest,
  };
}

export class RawInstructionBuilder {
  readonly idl: Idl;
  readonly programId: PublicKey;
  readonly coder: InstanceType<typeof BorshInstructionCoder>;

  constructor(idl: Idl, options: InstructionBuilderOptions = {}) {
    this.idl = convertIdlToCamelCase(idl);
    this.programId = options.programId ?? DIVIDENDX_PROGRAM_ID;
    invariant(new PublicKey(this.idl.address).equals(this.programId), 'IDL_MISMATCH', `IDL address ${this.idl.address} does not match explicit program ID ${this.programId.toBase58()}`);
    this.coder = new BorshInstructionCoder(this.idl);
  }

  build(requestedName: string, args: Record<string, unknown>, accounts: InstructionAccounts): TransactionInstruction {
    const name = instructionName(this.idl, requestedName);
    const definition = this.idl.instructions.find((instruction) => instruction.name === name)!;
    const keys = flattenAccounts(definition.accounts).map((account) => {
      const address = account.address ? new PublicKey(account.address) : accounts[account.name];
      invariant(address || account.optional, 'IDL_MISMATCH', `${name} requires account ${account.name}`);
      return {
        pubkey: address ?? this.programId,
        isSigner: account.signer ?? false,
        isWritable: account.writable ?? false,
      };
    });
    return new TransactionInstruction({
      programId: this.programId,
      keys,
      data: this.coder.encode(name, anchorValue(args)),
    });
  }
}

export class AdminInstructionBuilder {
  constructor(private readonly raw: RawInstructionBuilder) {}

  initializeConfig(accounts: InstructionAccounts, deploymentDomain: Uint8Array): TransactionInstruction {
    return this.raw.build('initializeConfig', { domain: checkedDigest(deploymentDomain, 'deployment domain') }, accounts);
  }

  registerAsset(
    accounts: InstructionAccounts,
    args: { issuerId: Uint8Array; symbol: string; attestor: PublicKey; policyDigest: Uint8Array },
  ): TransactionInstruction {
    const symbolBytes = new TextEncoder().encode(args.symbol);
    invariant(symbolBytes.length > 0 && symbolBytes.length <= 16, 'INVALID_IDENTITY', 'asset symbol must contain 1-16 UTF-8 bytes');
    invariant(!args.attestor.equals(PublicKey.default), 'INVALID_PUBLIC_KEY', 'asset attestor cannot be the default public key');
    if (accounts.admin) invariant(!args.attestor.equals(accounts.admin), 'INVALID_PUBLIC_KEY', 'asset attestor must differ from admin');
    return this.raw.build('registerAsset', {
      issuerId: checkedDigest(args.issuerId, 'issuer ID'),
      symbol: args.symbol,
      attestor: args.attestor,
      policyDigest: checkedDigest(args.policyDigest, 'policy digest'),
    }, accounts);
  }

  setAssetAdmission(accounts: InstructionAccounts, enabled: boolean): TransactionInstruction {
    return this.raw.build('setAssetAdmission', { enabled }, accounts);
  }
}

export class AttestorInstructionBuilder {
  constructor(private readonly raw: RawInstructionBuilder) {}

  refreshObservation(accounts: InstructionAccounts, evidenceDigest: Uint8Array, validUntil: bigint): TransactionInstruction {
    return this.raw.build('refreshObservation', {
      evidenceDigest: checkedDigest(evidenceDigest, 'observation evidence digest'),
      validUntil: assertI64(validUntil, 'observation valid-until timestamp'),
    }, accounts);
  }

  upsertEvent(accounts: InstructionAccounts, input: EventInput): TransactionInstruction {
    return this.raw.build('upsertEvent', { input: validatedEventInput(input) }, accounts);
  }

  beginFinalization(
    accounts: InstructionAccounts,
    expectedJournalVersion: bigint,
    expectedJournalHash: Uint8Array,
    coverageDigest: Uint8Array,
  ): TransactionInstruction {
    return this.raw.build('beginFinalization', {
      expectedJournalVersion: assertU64(expectedJournalVersion, 'expected journal version'),
      expectedJournalHash: checkedDigest(expectedJournalHash, 'expected journal hash', true),
      coverageDigest: checkedDigest(coverageDigest, 'coverage digest'),
    }, accounts);
  }

  abortFinalization(accounts: InstructionAccounts, reasonDigest: Uint8Array): TransactionInstruction {
    return this.raw.build('abortFinalization', { reasonDigest: checkedDigest(reasonDigest, 'abort reason digest') }, accounts);
  }
}

export class HolderInstructionBuilder {
  constructor(private readonly raw: RawInstructionBuilder) {}

  deposit(accounts: InstructionAccounts, amount: bigint, guard: Guard): TransactionInstruction {
    return this.raw.build('deposit', { amount: assertU64(amount, 'deposit amount', false), guard: validatedGuard(guard) }, accounts);
  }

  recombine(accounts: InstructionAccounts, amount: bigint, guard: Guard): TransactionInstruction {
    return this.raw.build('recombine', { amount: assertU64(amount, 'recombine amount', false), guard: validatedGuard(guard) }, accounts);
  }

  redeem(
    accounts: InstructionAccounts,
    side: 'pt' | 'dr',
    amount: bigint,
    allowZero: boolean,
    guard: Guard,
  ): TransactionInstruction {
    if (!allowZero) invariant(guard.minimumRawOutput > 0n, 'INVALID_QUOTE', 'allowZero=false requires a positive minimum raw output');
    return this.raw.build('redeem', {
      side: CLAIM_SIDE[side] === 0 ? { pt: {} } : { dr: {} },
      amount: assertU64(amount, 'redeem amount', false),
      allowZero,
      guard: validatedGuard(guard),
    }, accounts);
  }
}

export class PermissionlessInstructionBuilder {
  constructor(private readonly raw: RawInstructionBuilder) {}

  createSeries(accounts: InstructionAccounts, year: number): TransactionInstruction {
    invariant(Number.isInteger(year) && year >= 2020 && year <= 2100, 'INVALID_IDENTITY', 'series year must be 2020-2100');
    return this.raw.build('createSeries', { year }, accounts);
  }

  accumulateEvent(accounts: InstructionAccounts): TransactionInstruction {
    return this.raw.build('accumulateEvent', {}, accounts);
  }

  completeFinalization(accounts: InstructionAccounts): TransactionInstruction {
    return this.raw.build('completeFinalization', {}, accounts);
  }
}

export class DividendXInstructions {
  readonly raw: RawInstructionBuilder;
  readonly admin: AdminInstructionBuilder;
  readonly attestor: AttestorInstructionBuilder;
  readonly holder: HolderInstructionBuilder;
  readonly permissionless: PermissionlessInstructionBuilder;

  constructor(idl: Idl, options: InstructionBuilderOptions = {}) {
    this.raw = new RawInstructionBuilder(idl, options);
    this.admin = new AdminInstructionBuilder(this.raw);
    this.attestor = new AttestorInstructionBuilder(this.raw);
    this.holder = new HolderInstructionBuilder(this.raw);
    this.permissionless = new PermissionlessInstructionBuilder(this.raw);
  }
}
