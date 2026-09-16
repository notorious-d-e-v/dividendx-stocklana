/**
 * Executable annual-series accounting REFERENCE.
 *
 * This file is an arithmetic and lifecycle model used to validate the proposed
 * annual PT/DR design before a Solana program is specified. It is not a
 * transaction SDK, does not authenticate event sources, and intentionally uses
 * unlimited-precision bigint rationals. A bounded onchain numeric
 * representation and compute-conformance work remain required before SBF
 * implementation. Account collateralRaw records only collateral returned by
 * recombination or redemption; deposits are externally supplied, so a UI must
 * debit any separately seeded spendable balance itself.
 */

export type AnnualClaimSide = 'pt' | 'dr';
export type AnnualEventStatus =
  | 'qualified'
  | 'confirmed_zero'
  | 'cancelled'
  | 'pending'
  | 'unsupported';

export interface AnnualTermIdentity {
  chain: string;
  issuer: string;
  mint: string;
  symbol: string;
  year: number;
}

export interface AnnualEventRecord {
  id: string;
  revision: number;
  chain: string;
  issuer: string;
  mint: string;
  exDate: string | null;
  status: AnnualEventStatus;
  m0: string;
  m1: string;
  finalized: boolean;
}

export interface AnnualAccountState {
  /** Collateral returned by recombination/redemption; deposits are external inflows. */
  collateralRaw: bigint;
  ptRaw: bigint;
  drRaw: bigint;
}

export interface RationalIndex {
  numerator: bigint;
  denominator: bigint;
}

export interface AnnualAllocation {
  accountableRaw: bigint;
  index: RationalIndex;
  ptPoolRaw: bigint;
  drPoolRaw: bigint;
}

export interface AnnualFinalSnapshot extends AnnualAllocation {
  supplyDenominatorRaw: bigint;
}

export interface AnnualReferenceState {
  seriesId: string;
  ptSymbol: string;
  drSymbol: string;
  term: AnnualTermIdentity;
  startSeconds: number;
  maturitySeconds: number;
  accountableRaw: bigint;
  ptSupplyRaw: bigint;
  drSupplyRaw: bigint;
  externallyBurnedPtRaw: bigint;
  externallyBurnedDrRaw: bigint;
  redeemedPtClaimsRaw: bigint;
  redeemedDrClaimsRaw: bigint;
  custody: {
    actualRaw: bigint;
    donationsRaw: bigint;
    deficitRaw: bigint;
    blocked: boolean;
  };
  accounts: Record<string, AnnualAccountState>;
  events: Record<string, AnnualEventRecord>;
  finalized: boolean;
  finalSnapshot: AnnualFinalSnapshot | null;
  remainingPtPoolRaw: bigint;
  remainingDrPoolRaw: bigint;
}

export type AnnualReferenceErrorCode =
  | 'INVALID_IDENTITY'
  | 'INVALID_TIME'
  | 'INVALID_AMOUNT'
  | 'INVALID_ACCOUNT'
  | 'INVALID_EVENT'
  | 'EVENT_LIMIT'
  | 'REVISION_CONFLICT'
  | 'DEPOSITS_CLOSED'
  | 'INSUFFICIENT_BALANCE'
  | 'NOT_MATURE'
  | 'INCOMPLETE_JOURNAL'
  | 'FINALIZED'
  | 'POST_FINALIZED_AMENDMENT'
  | 'ZERO_PAYOUT'
  | 'CUSTODY_BLOCKED'
  | 'CUSTODY_DEFICIT';

export class AnnualReferenceError extends Error {
  readonly code: AnnualReferenceErrorCode;

  constructor(code: AnnualReferenceErrorCode, message: string) {
    super(message);
    this.name = 'AnnualReferenceError';
    this.code = code;
  }
}

const U64_MAX = 18_446_744_073_709_551_615n;
const MAX_EVENT_IDS = 64;
const MAX_TEXT_LENGTH = 128;
const MAX_FACTOR_LENGTH = 64;

function fail(code: AnnualReferenceErrorCode, message: string): never {
  throw new AnnualReferenceError(code, message);
}

function checkedText(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT_LENGTH) {
    fail('INVALID_IDENTITY', `${label} must contain 1-${MAX_TEXT_LENGTH} characters`);
  }
  return value;
}

function checkedAccountId(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT_LENGTH) {
    fail('INVALID_ACCOUNT', `Account ID must contain 1-${MAX_TEXT_LENGTH} characters`);
  }
  return value;
}

function checkedTermIdentity(term: AnnualTermIdentity): AnnualTermIdentity {
  if (!term || typeof term !== 'object') fail('INVALID_IDENTITY', 'Term identity is required');
  if (!Number.isInteger(term.year) || term.year < 1970 || term.year > 9998) {
    fail('INVALID_IDENTITY', 'Term year must be an integer from 1970 through 9998');
  }
  return {
    chain: checkedText(term.chain, 'Chain'),
    issuer: checkedText(term.issuer, 'Issuer'),
    mint: checkedText(term.mint, 'Mint'),
    symbol: checkedText(term.symbol, 'Symbol'),
    year: term.year,
  };
}

function checkedRaw(value: bigint, allowZero = false): bigint {
  if (typeof value !== 'bigint' || value < 0n || (!allowZero && value === 0n) || value > U64_MAX) {
    fail('INVALID_AMOUNT', `Raw amount must be ${allowZero ? 'an' : 'a positive'} unsigned u64`);
  }
  return value;
}

function addU64(left: bigint, right: bigint): bigint {
  const sum = left + right;
  checkedRaw(sum, true);
  return sum;
}

function checkedNow(nowSeconds: number): number {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    fail('INVALID_TIME', 'nowSeconds must be a non-negative integer UTC timestamp');
  }
  return nowSeconds;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function reduce(numerator: bigint, denominator: bigint): RationalIndex {
  if (numerator < 0n || denominator <= 0n) fail('INVALID_EVENT', 'Invalid rational index');
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function parsePositiveDecimal(value: string): RationalIndex {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_FACTOR_LENGTH
    || !/^\d+(?:\.\d+)?$/.test(value)
  ) {
    fail('INVALID_EVENT', `Multiplier must be a plain positive decimal of at most ${MAX_FACTOR_LENGTH} characters`);
  }
  const [whole, fraction = ''] = value.split('.');
  const numerator = BigInt(whole + fraction);
  if (numerator === 0n) fail('INVALID_EVENT', 'Multiplier must be positive');
  return reduce(numerator, 10n ** BigInt(fraction.length));
}

function compare(left: RationalIndex, right: RationalIndex): number {
  const delta = left.numerator * right.denominator - right.numerator * left.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function validCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function civilYear(value: string): number {
  return Number(value.slice(0, 4));
}

function canonicalRecord(record: AnnualEventRecord): string {
  return JSON.stringify([
    record.id,
    record.revision,
    record.chain,
    record.issuer,
    record.mint,
    record.exDate,
    record.status,
    record.m0,
    record.m1,
    record.finalized,
  ]);
}

function cloneRecord(record: AnnualEventRecord): AnnualEventRecord {
  return { ...record };
}

function cloneAccount(account: AnnualAccountState): AnnualAccountState {
  return { ...account };
}

export function annualSeriesId(term: AnnualTermIdentity): string {
  const checked = checkedTermIdentity(term);
  return JSON.stringify([checked.chain, checked.issuer, checked.mint, checked.year]);
}

export class AnnualReferenceModel {
  readonly term: AnnualTermIdentity;
  readonly seriesId: string;
  readonly ptSymbol: string;
  readonly drSymbol: string;
  readonly startSeconds: number;
  readonly maturitySeconds: number;

  private accountableRaw = 0n;
  private ptSupplyRaw = 0n;
  private drSupplyRaw = 0n;
  private externallyBurnedPtRaw = 0n;
  private externallyBurnedDrRaw = 0n;
  private redeemedPtClaimsRaw = 0n;
  private redeemedDrClaimsRaw = 0n;
  private actualCustodyRaw = 0n;
  private donationsRaw = 0n;
  private custodyBlocked = false;
  private readonly accounts = new Map<string, AnnualAccountState>();
  private readonly events = new Map<string, AnnualEventRecord>();
  private snapshot: AnnualFinalSnapshot | null = null;
  private remainingPtPoolRaw = 0n;
  private remainingDrPoolRaw = 0n;

  constructor(term: AnnualTermIdentity, accountIds: readonly string[]) {
    this.term = Object.freeze(checkedTermIdentity(term));
    if (!Array.isArray(accountIds) || accountIds.length < 2) {
      fail('INVALID_ACCOUNT', 'Reference model requires at least two accounts');
    }
    for (const rawId of accountIds) {
      const id = checkedAccountId(rawId);
      if (this.accounts.has(id)) fail('INVALID_ACCOUNT', `Duplicate account: ${id}`);
      this.accounts.set(id, { collateralRaw: 0n, ptRaw: 0n, drRaw: 0n });
    }
    this.seriesId = annualSeriesId(this.term);
    this.ptSymbol = `PT-${this.term.symbol}-${this.term.year}`;
    this.drSymbol = `DR-${this.term.symbol}-${this.term.year}`;
    this.startSeconds = Date.UTC(this.term.year, 0, 1) / 1_000;
    this.maturitySeconds = Date.UTC(this.term.year + 1, 0, 1) / 1_000;
  }

  getState(): AnnualReferenceState {
    const accounts = Object.fromEntries(
      [...this.accounts].map(([id, account]) => [id, cloneAccount(account)]),
    ) as Record<string, AnnualAccountState>;
    const events = Object.fromEntries(
      [...this.events].map(([id, event]) => [id, cloneRecord(event)]),
    ) as Record<string, AnnualEventRecord>;
    const obligation = this.snapshot
      ? this.remainingPtPoolRaw + this.remainingDrPoolRaw
      : this.accountableRaw;
    return {
      seriesId: this.seriesId,
      ptSymbol: this.ptSymbol,
      drSymbol: this.drSymbol,
      term: { ...this.term },
      startSeconds: this.startSeconds,
      maturitySeconds: this.maturitySeconds,
      accountableRaw: this.accountableRaw,
      ptSupplyRaw: this.ptSupplyRaw,
      drSupplyRaw: this.drSupplyRaw,
      externallyBurnedPtRaw: this.externallyBurnedPtRaw,
      externallyBurnedDrRaw: this.externallyBurnedDrRaw,
      redeemedPtClaimsRaw: this.redeemedPtClaimsRaw,
      redeemedDrClaimsRaw: this.redeemedDrClaimsRaw,
      custody: {
        actualRaw: this.actualCustodyRaw,
        donationsRaw: this.donationsRaw,
        deficitRaw: obligation > this.actualCustodyRaw ? obligation - this.actualCustodyRaw : 0n,
        blocked: this.custodyBlocked,
      },
      accounts,
      events,
      finalized: this.snapshot !== null,
      finalSnapshot: this.snapshot
        ? { ...this.snapshot, index: { ...this.snapshot.index } }
        : null,
      remainingPtPoolRaw: this.remainingPtPoolRaw,
      remainingDrPoolRaw: this.remainingDrPoolRaw,
    };
  }

  currentIndex(): RationalIndex {
    let index: RationalIndex = { numerator: 1n, denominator: 1n };
    for (const event of this.events.values()) {
      if (event.exDate === null || civilYear(event.exDate) !== this.term.year || event.status !== 'qualified') continue;
      const m0 = parsePositiveDecimal(event.m0);
      const m1 = parsePositiveDecimal(event.m1);
      index = reduce(
        index.numerator * m0.numerator * m1.denominator,
        index.denominator * m0.denominator * m1.numerator,
      );
    }
    return index;
  }

  previewAllocation(): AnnualAllocation {
    if (this.snapshot) {
      return {
        accountableRaw: this.snapshot.accountableRaw,
        index: { ...this.snapshot.index },
        ptPoolRaw: this.snapshot.ptPoolRaw,
        drPoolRaw: this.snapshot.drPoolRaw,
      };
    }
    const index = this.currentIndex();
    const drPoolRaw = this.accountableRaw * (index.denominator - index.numerator) / index.denominator;
    return {
      accountableRaw: this.accountableRaw,
      index,
      ptPoolRaw: this.accountableRaw - drPoolRaw,
      drPoolRaw,
    };
  }

  deposit(accountId: string, raw: bigint, nowSeconds: number): void {
    const account = this.requireAccount(accountId);
    const amount = checkedRaw(raw);
    const now = checkedNow(nowSeconds);
    if (this.snapshot) fail('FINALIZED', 'Series is finalized');
    if (now >= this.startSeconds) fail('DEPOSITS_CLOSED', 'Annual deposits close at the start of the calendar year');
    this.requireCustodyAvailable(true);
    const nextQ = addU64(this.accountableRaw, amount);
    const nextPtSupply = addU64(this.ptSupplyRaw, amount);
    const nextDrSupply = addU64(this.drSupplyRaw, amount);
    const nextCustody = addU64(this.actualCustodyRaw, amount);
    const nextPt = addU64(account.ptRaw, amount);
    const nextDr = addU64(account.drRaw, amount);
    this.accountableRaw = nextQ;
    this.ptSupplyRaw = nextPtSupply;
    this.drSupplyRaw = nextDrSupply;
    this.actualCustodyRaw = nextCustody;
    account.ptRaw = nextPt;
    account.drRaw = nextDr;
  }

  recordEvent(input: AnnualEventRecord): 'accepted' | 'idempotent' {
    if (this.snapshot) fail('POST_FINALIZED_AMENDMENT', 'Finalized pools cannot be repriced');
    const record = this.validateEvent(input);
    const previous = this.events.get(record.id);
    if (previous) {
      if (record.revision === previous.revision && canonicalRecord(record) === canonicalRecord(previous)) {
        return 'idempotent';
      }
      if (record.revision <= previous.revision) {
        fail('REVISION_CONFLICT', 'Event correction must have a strictly higher revision');
      }
    } else if (this.events.size >= MAX_EVENT_IDS) {
      fail('EVENT_LIMIT', `Annual journal supports at most ${MAX_EVENT_IDS} unique event IDs`);
    }
    this.events.set(record.id, record);
    return 'accepted';
  }

  transfer(fromId: string, toId: string, side: AnnualClaimSide, raw: bigint): void {
    const from = this.requireAccount(fromId);
    const to = this.requireAccount(toId);
    const amount = checkedRaw(raw);
    if (fromId === toId) fail('INVALID_ACCOUNT', 'Transfer accounts must differ');
    const field = side === 'pt' ? 'ptRaw' : side === 'dr' ? 'drRaw' : fail('INVALID_AMOUNT', 'Unknown claim side');
    if (from[field] < amount) fail('INSUFFICIENT_BALANCE', 'Insufficient claim balance');
    const nextTo = addU64(to[field], amount);
    from[field] -= amount;
    to[field] = nextTo;
  }

  recombine(accountId: string, raw: bigint): void {
    if (this.snapshot) fail('FINALIZED', 'Paired recombination ends at finalization');
    const account = this.requireAccount(accountId);
    const amount = checkedRaw(raw);
    if (account.ptRaw < amount || account.drRaw < amount) {
      fail('INSUFFICIENT_BALANCE', 'Recombination requires matching owned PT and DR');
    }
    this.requireCustodyAvailable(true);
    const nextCollateral = addU64(account.collateralRaw, amount);
    account.ptRaw -= amount;
    account.drRaw -= amount;
    account.collateralRaw = nextCollateral;
    this.ptSupplyRaw -= amount;
    this.drSupplyRaw -= amount;
    this.accountableRaw -= amount;
    this.actualCustodyRaw -= amount;
  }

  burn(accountId: string, side: AnnualClaimSide, raw: bigint): void {
    const account = this.requireAccount(accountId);
    const amount = checkedRaw(raw);
    const field = side === 'pt' ? 'ptRaw' : side === 'dr' ? 'drRaw' : fail('INVALID_AMOUNT', 'Unknown claim side');
    if (account[field] < amount) fail('INSUFFICIENT_BALANCE', 'Insufficient claim balance');
    account[field] -= amount;
    if (side === 'pt') {
      this.ptSupplyRaw -= amount;
      this.externallyBurnedPtRaw = addU64(this.externallyBurnedPtRaw, amount);
    } else {
      this.drSupplyRaw -= amount;
      this.externallyBurnedDrRaw = addU64(this.externallyBurnedDrRaw, amount);
    }
  }

  finalize(nowSeconds: number, ledgerComplete: boolean): AnnualFinalSnapshot {
    const now = checkedNow(nowSeconds);
    if (this.snapshot) fail('FINALIZED', 'Series is already finalized');
    if (now < this.maturitySeconds) fail('NOT_MATURE', 'Annual series has not reached maturity');
    if (ledgerComplete !== true) fail('INCOMPLETE_JOURNAL', 'A complete journal attestation is required');
    for (const event of this.events.values()) {
      if (event.exDate === null) fail('INCOMPLETE_JOURNAL', `Event ${event.id} has no validated ex-date`);
      if (!event.finalized) fail('INCOMPLETE_JOURNAL', `Event ${event.id} is not final`);
      if (event.status === 'pending' || event.status === 'unsupported') {
        fail('INCOMPLETE_JOURNAL', `Event ${event.id} remains ${event.status}`);
      }
    }
    this.requireCustodyAvailable(true);
    const allocation = this.previewAllocation();
    const snapshot: AnnualFinalSnapshot = {
      ...allocation,
      index: { ...allocation.index },
      supplyDenominatorRaw: this.accountableRaw,
    };
    this.snapshot = snapshot;
    this.remainingPtPoolRaw = snapshot.ptPoolRaw;
    this.remainingDrPoolRaw = snapshot.drPoolRaw;
    return { ...snapshot, index: { ...snapshot.index } };
  }

  previewRedemption(accountId: string, side: AnnualClaimSide, raw: bigint): bigint {
    const account = this.requireAccount(accountId);
    const amount = checkedRaw(raw);
    if (!this.snapshot) fail('NOT_MATURE', 'Redemption requires a finalized annual journal');
    const field = side === 'pt' ? 'ptRaw' : side === 'dr' ? 'drRaw' : fail('INVALID_AMOUNT', 'Unknown claim side');
    if (account[field] < amount) fail('INSUFFICIENT_BALANCE', 'Insufficient claim balance');
    const denominator = this.snapshot.supplyDenominatorRaw;
    if (denominator === 0n) return 0n;
    const pool = side === 'pt' ? this.snapshot.ptPoolRaw : this.snapshot.drPoolRaw;
    const burned = side === 'pt' ? this.redeemedPtClaimsRaw : this.redeemedDrClaimsRaw;
    return (burned + amount) * pool / denominator - burned * pool / denominator;
  }

  redeem(accountId: string, side: AnnualClaimSide, raw: bigint, options: { allowZero?: boolean } = {}): bigint {
    const account = this.requireAccount(accountId);
    const amount = checkedRaw(raw);
    const payout = this.previewRedemption(accountId, side, amount);
    if (payout === 0n && options.allowZero !== true) {
      fail('ZERO_PAYOUT', 'Zero-output claim closure requires explicit allowZero consent');
    }
    this.requireCustodyAvailable(true);
    const nextCollateral = addU64(account.collateralRaw, payout);
    if (side === 'pt') {
      if (payout > this.remainingPtPoolRaw) fail('CUSTODY_DEFICIT', 'PT pool is insufficient');
      account.ptRaw -= amount;
      this.ptSupplyRaw -= amount;
      this.redeemedPtClaimsRaw = addU64(this.redeemedPtClaimsRaw, amount);
      this.remainingPtPoolRaw -= payout;
    } else {
      if (payout > this.remainingDrPoolRaw) fail('CUSTODY_DEFICIT', 'DR pool is insufficient');
      account.drRaw -= amount;
      this.drSupplyRaw -= amount;
      this.redeemedDrClaimsRaw = addU64(this.redeemedDrClaimsRaw, amount);
      this.remainingDrPoolRaw -= payout;
    }
    account.collateralRaw = nextCollateral;
    this.actualCustodyRaw -= payout;
    return payout;
  }

  donate(raw: bigint): void {
    const amount = checkedRaw(raw);
    const nextActual = addU64(this.actualCustodyRaw, amount);
    const nextDonations = addU64(this.donationsRaw, amount);
    this.actualCustodyRaw = nextActual;
    this.donationsRaw = nextDonations;
  }

  setCustodyBlocked(blocked: boolean): void {
    this.custodyBlocked = Boolean(blocked);
  }

  /** Reference-only impairment input; it does not alter claims or allocations. */
  reportActualCustody(raw: bigint): void {
    this.actualCustodyRaw = checkedRaw(raw, true);
  }

  private requireAccount(accountId: string): AnnualAccountState {
    const id = checkedAccountId(accountId);
    const account = this.accounts.get(id);
    if (!account) fail('INVALID_ACCOUNT', `Unknown account: ${id}`);
    return account;
  }

  private requireCustodyAvailable(requireSolvent: boolean): void {
    if (this.custodyBlocked) fail('CUSTODY_BLOCKED', 'Custody operations are blocked');
    if (!requireSolvent) return;
    const obligation = this.snapshot
      ? this.remainingPtPoolRaw + this.remainingDrPoolRaw
      : this.accountableRaw;
    if (this.actualCustodyRaw < obligation) fail('CUSTODY_DEFICIT', 'Actual custody is below accounted obligations');
  }

  private validateEvent(input: AnnualEventRecord): AnnualEventRecord {
    if (!input || typeof input !== 'object') fail('INVALID_EVENT', 'Event record is required');
    const id = checkedText(input.id, 'Event ID');
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
      fail('INVALID_EVENT', 'Event revision must be a non-negative integer');
    }
    const chain = checkedText(input.chain, 'Event chain');
    const issuer = checkedText(input.issuer, 'Event issuer');
    const mint = checkedText(input.mint, 'Event mint');
    if (chain !== this.term.chain || issuer !== this.term.issuer || mint !== this.term.mint) {
      fail('INVALID_EVENT', 'Event identity does not match the annual series');
    }
    const statuses: readonly AnnualEventStatus[] = ['qualified', 'confirmed_zero', 'cancelled', 'pending', 'unsupported'];
    if (!statuses.includes(input.status)) fail('INVALID_EVENT', 'Unknown event status');
    if (input.exDate !== null && !validCivilDate(input.exDate)) {
      fail('INVALID_EVENT', 'exDate must be a valid exchange civil date in YYYY-MM-DD form');
    }
    const m0 = parsePositiveDecimal(input.m0);
    const m1 = parsePositiveDecimal(input.m1);
    if (compare(m1, m0) < 0 && input.status !== 'pending' && input.status !== 'unsupported') {
      fail('INVALID_EVENT', 'A multiplier decrease must be rejected or quarantined as unsupported');
    }
    if (typeof input.finalized !== 'boolean') fail('INVALID_EVENT', 'Event finalized flag must be boolean');
    return {
      id,
      revision: input.revision,
      chain,
      issuer,
      mint,
      exDate: input.exDate,
      status: input.status,
      m0: input.m0,
      m1: input.m1,
      finalized: input.finalized,
    };
  }
}
