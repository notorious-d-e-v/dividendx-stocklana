import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AnnualReferenceError,
  AnnualReferenceModel,
  annualSeriesId,
  type AnnualEventRecord,
  type AnnualTermIdentity,
} from '../src/annual-reference.ts';

const YEAR = 2027;
const START = Date.UTC(YEAR, 0, 1) / 1_000;
const MATURITY = Date.UTC(YEAR + 1, 0, 1) / 1_000;

const KO_TERM: AnnualTermIdentity = {
  chain: 'solana',
  issuer: 'xstocks',
  mint: 'XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ',
  symbol: 'KOx',
  year: YEAR,
};

function model(accounts: readonly string[] = ['alice', 'bob']): AnnualReferenceModel {
  return new AnnualReferenceModel(KO_TERM, accounts);
}

function event(id: string, overrides: Partial<AnnualEventRecord> = {}): AnnualEventRecord {
  return {
    id,
    revision: 1,
    chain: KO_TERM.chain,
    issuer: KO_TERM.issuer,
    mint: KO_TERM.mint,
    exDate: `${YEAR}-06-15`,
    status: 'qualified',
    m0: '1',
    m1: '1.1',
    finalized: true,
    ...overrides,
  };
}

function errorCode(error: unknown): string | undefined {
  return error instanceof AnnualReferenceError ? error.code : undefined;
}

function deposited(raw = 100n, accounts: readonly string[] = ['alice', 'bob']): AnnualReferenceModel {
  const reference = model(accounts);
  reference.deposit('alice', raw, START - 1);
  return reference;
}

test('identity, symbols and UTC term boundaries are exact', () => {
  const reference = model();
  const state = reference.getState();
  assert.equal(state.seriesId, JSON.stringify(['solana', 'xstocks', KO_TERM.mint, 2027]));
  assert.equal(state.ptSymbol, 'PT-KOx-2027');
  assert.equal(state.drSymbol, 'DR-KOx-2027');
  assert.equal(state.startSeconds, START);
  assert.equal(state.maturitySeconds, MATURITY);
});

test('series IDs use validated, unambiguous identity tuple encoding', () => {
  const left = annualSeriesId({ chain: 'solana:xstocks', issuer: 'desk', mint: 'mint', symbol: 'X', year: YEAR });
  const right = annualSeriesId({ chain: 'solana', issuer: 'xstocks:desk', mint: 'mint', symbol: 'X', year: YEAR });
  assert.notEqual(left, right);
  assert.deepEqual(JSON.parse(left), ['solana:xstocks', 'desk', 'mint', YEAR]);
  assert.throws(
    () => annualSeriesId({ ...KO_TERM, mint: '' }),
    (cause) => errorCode(cause) === 'INVALID_IDENTITY',
  );
});

test('four dividends use one product index instead of summed event floors', () => {
  const reference = deposited(10_000n);
  for (let index = 0; index < 4; index += 1) {
    reference.recordEvent(event(`dividend-${index}`, { exDate: `${YEAR}-0${index + 2}-01` }));
  }
  const allocation = reference.previewAllocation();
  assert.deepEqual(allocation.index, { numerator: 10_000n, denominator: 14_641n });
  assert.equal(allocation.drPoolRaw, 3_169n);
  const naiveSumOfPerEventFloors = 4n * (10_000n / 11n);
  assert.equal(naiveSumOfPerEventFloors, 3_636n);
  assert.notEqual(allocation.drPoolRaw, naiveSumOfPerEventFloors);
  assert.equal(allocation.ptPoolRaw + allocation.drPoolRaw, 10_000n);
});

test('event insertion permutations produce the same reduced index and allocation', () => {
  const records = [
    event('a', { m0: '1', m1: '1.03' }),
    event('b', { m0: '1.01', m1: '1.07' }),
    event('c', { m0: '2', m1: '2.02' }),
    event('d', { m0: '3.1', m1: '3.2' }),
  ];
  const orders = [
    [0, 1, 2, 3],
    [3, 2, 1, 0],
    [1, 3, 0, 2],
    [2, 0, 3, 1],
  ];
  const allocations = orders.map((order) => {
    const reference = deposited(1_000_000n);
    for (const index of order) reference.recordEvent(records[index]!);
    return reference.previewAllocation();
  });
  for (const allocation of allocations.slice(1)) assert.deepEqual(allocation, allocations[0]);
});

test('the cumulative product retains tiny fractions that per-event floors lose', () => {
  const reference = deposited(30n);
  for (let index = 0; index < 4; index += 1) {
    reference.recordEvent(event(`tiny-${index}`, { m1: '1.01' }));
  }
  assert.equal(30n * 1n / 101n, 0n);
  assert.equal(reference.previewAllocation().drPoolRaw, 1n);
});

test('civil ex-date membership includes both year boundaries and excludes next year', () => {
  const reference = deposited(1_000n);
  reference.recordEvent(event('first', { exDate: '2027-01-01', m1: '1.1' }));
  reference.recordEvent(event('last', { exDate: '2027-12-31', m1: '1.1' }));
  reference.recordEvent(event('next', { exDate: '2028-01-01', m1: '2' }));
  assert.deepEqual(reference.previewAllocation().index, { numerator: 100n, denominator: 121n });
  assert.throws(() => reference.finalize(MATURITY - 1, true), (cause) => errorCode(cause) === 'NOT_MATURE');
  // Recording just before this call models evidence delivered after 31 December.
  const snapshot = reference.finalize(MATURITY, true);
  assert.deepEqual(snapshot.index, { numerator: 100n, denominator: 121n });
  assert.equal(snapshot.drPoolRaw, 173n);
});

test('event revisions replace contributions and may move ex-date across years', () => {
  const reference = deposited();
  const initial = event('corrected', { exDate: '2027-12-31', m1: '2' });
  assert.equal(reference.recordEvent(initial), 'accepted');
  assert.equal(reference.recordEvent({ ...initial }), 'idempotent');
  assert.equal(reference.previewAllocation().drPoolRaw, 50n);
  const moved = { ...initial, revision: 2, exDate: '2028-01-01' };
  assert.equal(reference.recordEvent(moved), 'accepted');
  assert.equal(reference.previewAllocation().drPoolRaw, 0n);
  const before = reference.getState();
  assert.throws(
    () => reference.recordEvent({ ...moved, m1: '3' }),
    (cause) => errorCode(cause) === 'REVISION_CONFLICT',
  );
  assert.throws(
    () => reference.recordEvent({ ...initial, revision: 1 }),
    (cause) => errorCode(cause) === 'REVISION_CONFLICT',
  );
  assert.deepEqual(reference.getState(), before);
});

test('pending, missing-date and unsupported records block finalization until corrected', () => {
  const reference = deposited();
  reference.recordEvent(event('pending', { exDate: null, status: 'pending', finalized: false }));
  assert.throws(() => reference.finalize(MATURITY, true), (cause) => errorCode(cause) === 'INCOMPLETE_JOURNAL');
  reference.recordEvent(event('pending', {
    revision: 2,
    status: 'confirmed_zero',
    m1: '1',
    finalized: true,
  }));
  reference.recordEvent(event('cancelled', { status: 'cancelled', m1: '1' }));
  assert.equal(reference.finalize(MATURITY, true).drPoolRaw, 0n);

  const quarantined = deposited();
  quarantined.recordEvent(event('decrease', { status: 'unsupported', m0: '2', m1: '1' }));
  assert.throws(() => quarantined.finalize(MATURITY, true), (cause) => errorCode(cause) === 'INCOMPLETE_JOURNAL');
  const before = quarantined.getState();
  assert.throws(
    () => quarantined.recordEvent(event('bad-decrease', { status: 'qualified', m0: '2', m1: '1' })),
    (cause) => errorCode(cause) === 'INVALID_EVENT',
  );
  assert.deepEqual(quarantined.getState(), before);
});

test('finalization needs an explicit complete attestation and final latest records', () => {
  const reference = deposited();
  reference.recordEvent(event('not-final', { finalized: false }));
  assert.throws(() => reference.finalize(MATURITY, true), (cause) => errorCode(cause) === 'INCOMPLETE_JOURNAL');
  reference.recordEvent(event('not-final', { revision: 2, finalized: true }));
  assert.throws(() => reference.finalize(MATURITY, false), (cause) => errorCode(cause) === 'INCOMPLETE_JOURNAL');
  const before = reference.getState();
  assert.throws(() => reference.redeem('alice', 'dr', 1n), (cause) => errorCode(cause) === 'NOT_MATURE');
  assert.deepEqual(reference.getState(), before);
  reference.finalize(MATURITY, true);
});

test('multiple depositors mint equal pairs only before the calendar year starts', () => {
  const reference = model(['alice', 'bob', 'carol']);
  reference.deposit('alice', 60n, START - 10);
  reference.deposit('bob', 40n, START - 1);
  assert.equal(reference.getState().accountableRaw, 100n);
  assert.deepEqual(reference.getState().accounts.alice, { collateralRaw: 0n, ptRaw: 60n, drRaw: 60n });
  const before = reference.getState();
  assert.throws(() => reference.deposit('carol', 1n, START), (cause) => errorCode(cause) === 'DEPOSITS_CLOSED');
  assert.deepEqual(reference.getState(), before);
});

test('paired recombination after one event returns raw and reprices only remaining Q', () => {
  const reference = model(['alice', 'bob']);
  reference.deposit('alice', 100n, START - 1);
  reference.deposit('bob', 100n, START - 1);
  reference.recordEvent(event('one'));
  assert.equal(reference.previewAllocation().drPoolRaw, 18n);
  reference.recombine('alice', 40n);
  let state = reference.getState();
  assert.equal(state.accountableRaw, 160n);
  assert.equal(state.accounts.alice.collateralRaw, 40n);
  assert.equal(reference.previewAllocation().drPoolRaw, 14n);
  for (const id of ['two', 'three', 'four']) reference.recordEvent(event(id));
  state = reference.getState();
  assert.equal(state.accounts.alice.ptRaw, 60n);
  assert.equal(state.accounts.alice.drRaw, 60n);
  const snapshot = reference.finalize(MATURITY, true);
  assert.equal(snapshot.supplyDenominatorRaw, 160n);
  assert.equal(snapshot.ptPoolRaw + snapshot.drPoolRaw, 160n);
});

test('DR transfers before and after finalization carry the unredeemed bearer right', () => {
  const reference = deposited();
  reference.recordEvent(event('dividend', { m1: '2' }));
  reference.transfer('alice', 'bob', 'dr', 40n);
  reference.finalize(MATURITY, true);
  reference.transfer('alice', 'bob', 'dr', 10n);
  assert.equal(reference.getState().accounts.bob.drRaw, 50n);
  assert.equal(reference.redeem('bob', 'dr', 50n), 25n);
  assert.equal(reference.getState().accounts.alice.drRaw, 50n);
  assert.equal(reference.getState().accounts.bob.collateralRaw, 25n);
});

function roundingReference(): AnnualReferenceModel {
  const reference = deposited(10n);
  reference.recordEvent(event('two-thirds', { m1: '3' }));
  reference.finalize(MATURITY, true);
  return reference;
}

test('independent cumulative redemptions conserve pools across partition order', () => {
  const forward = roundingReference();
  const forwardPayouts = [forward.redeem('alice', 'dr', 3n), forward.redeem('alice', 'dr', 7n)];
  assert.deepEqual(forwardPayouts, [1n, 5n]);
  assert.equal(forwardPayouts[0] + forwardPayouts[1], 6n);

  const reverse = roundingReference();
  const reversePayouts = [reverse.redeem('alice', 'dr', 7n), reverse.redeem('alice', 'dr', 3n)];
  assert.deepEqual(reversePayouts, [4n, 2n]);
  assert.equal(reversePayouts[0] + reversePayouts[1], 6n);
  assert.equal(reverse.redeem('alice', 'pt', 10n), 4n);
});

test('direct burns reserve backing, do not change S, and donations remain excess', () => {
  const reference = deposited();
  reference.recordEvent(event('half', { m1: '2' }));
  reference.burn('alice', 'dr', 20n);
  reference.donate(7n);
  const snapshot = reference.finalize(MATURITY, true);
  assert.equal(snapshot.supplyDenominatorRaw, 100n);
  assert.equal(snapshot.drPoolRaw, 50n);
  reference.burn('alice', 'pt', 10n);
  assert.equal(reference.redeem('alice', 'dr', 80n), 40n);
  assert.equal(reference.redeem('alice', 'pt', 90n), 45n);
  const state = reference.getState();
  assert.equal(state.externallyBurnedDrRaw, 20n);
  assert.equal(state.externallyBurnedPtRaw, 10n);
  assert.equal(state.remainingDrPoolRaw, 10n);
  assert.equal(state.remainingPtPoolRaw, 5n);
  assert.equal(state.custody.actualRaw, 22n);
  assert.equal(state.custody.donationsRaw, 7n);
  assert.equal(state.custody.deficitRaw, 0n);
});

test('zero annual outcome requires explicit consent to close DR claims', () => {
  const reference = deposited();
  reference.recordEvent(event('zero', { status: 'confirmed_zero', m1: '1' }));
  reference.finalize(MATURITY, true);
  const before = reference.getState();
  assert.throws(() => reference.redeem('alice', 'dr', 100n), (cause) => errorCode(cause) === 'ZERO_PAYOUT');
  assert.deepEqual(reference.getState(), before);
  assert.equal(reference.redeem('alice', 'dr', 100n, { allowZero: true }), 0n);
  assert.equal(reference.redeem('alice', 'pt', 100n), 100n);
});

test('single-event KOx and MU arithmetic matches the legacy reference exactly', () => {
  const ko = deposited(9_819_982_084n);
  ko.recordEvent(event('synthetic-kox', {
    exDate: '2027-03-15',
    m0: '1.0183317967386898',
    m1: '1.0225601246249238',
  }));
  assert.deepEqual(
    { ptPoolRaw: ko.previewAllocation().ptPoolRaw, drPoolRaw: ko.previewAllocation().drPoolRaw },
    { ptPoolRaw: 9_779_376_057n, drPoolRaw: 40_606_027n },
  );

  const mu = new AnnualReferenceModel({
    chain: 'solana', issuer: 'backpack', mint: 'MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1', symbol: 'MU.US', year: YEAR,
  }, ['alice', 'bob']);
  mu.deposit('alice', 1_000_000_000n, START - 1);
  mu.recordEvent({
    id: 'synthetic-mu', revision: 1, chain: 'solana', issuer: 'backpack',
    mint: 'MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1', exDate: '2027-07-23',
    status: 'qualified', m0: '1', m1: '1.000106726714702', finalized: true,
  });
  assert.deepEqual(
    { ptPoolRaw: mu.previewAllocation().ptPoolRaw, drPoolRaw: mu.previewAllocation().drPoolRaw },
    { ptPoolRaw: 999_893_285n, drPoolRaw: 106_715n },
  );
});

test('final pools reject later revisions and returned snapshots cannot mutate state', () => {
  const reference = deposited();
  reference.recordEvent(event('fixed'));
  reference.finalize(MATURITY, true);
  const external = reference.getState();
  external.accounts.alice.drRaw = 0n;
  external.events.fixed.m1 = '9';
  external.finalSnapshot!.drPoolRaw = 0n;
  const internal = reference.getState();
  assert.equal(internal.accounts.alice.drRaw, 100n);
  assert.equal(internal.events.fixed.m1, '1.1');
  assert.equal(internal.finalSnapshot!.drPoolRaw, 9n);
  const before = reference.getState();
  assert.throws(
    () => reference.recordEvent(event('fixed', { revision: 2, m1: '2' })),
    (cause) => errorCode(cause) === 'POST_FINALIZED_AMENDMENT',
  );
  assert.deepEqual(reference.getState(), before);
});

test('custody blocking and deficits stop custody outflows without changing claims', () => {
  const reference = deposited();
  reference.setCustodyBlocked(true);
  let before = reference.getState();
  assert.throws(() => reference.recombine('alice', 1n), (cause) => errorCode(cause) === 'CUSTODY_BLOCKED');
  assert.deepEqual(reference.getState(), before);
  reference.setCustodyBlocked(false);
  reference.reportActualCustody(99n);
  before = reference.getState();
  assert.equal(before.custody.deficitRaw, 1n);
  assert.throws(() => reference.finalize(MATURITY, true), (cause) => errorCode(cause) === 'CUSTODY_DEFICIT');
  assert.deepEqual(reference.getState(), before);
});

test('a deposit cannot conceal an existing custody deficit', () => {
  const reference = deposited();
  reference.reportActualCustody(99n);
  const before = reference.getState();
  assert.throws(
    () => reference.deposit('bob', 10n, START - 1),
    (cause) => errorCode(cause) === 'CUSTODY_DEFICIT',
  );
  assert.deepEqual(reference.getState(), before);
});

test('__proto__ account and event IDs remain isolated own snapshot fields', () => {
  const reference = model(['__proto__', 'bob']);
  reference.deposit('__proto__', 10n, START - 1);
  reference.recordEvent(event('__proto__'));
  const external = reference.getState();
  assert.equal(Object.hasOwn(external.accounts, '__proto__'), true);
  assert.equal(Object.hasOwn(external.events, '__proto__'), true);
  assert.equal(external.accounts.__proto__.ptRaw, 10n);
  assert.equal(external.events.__proto__.id, '__proto__');
  external.accounts.__proto__.ptRaw = 0n;
  external.events.__proto__.m1 = '9';
  const internal = reference.getState();
  assert.equal(internal.accounts.__proto__.ptRaw, 10n);
  assert.equal(internal.events.__proto__.m1, '1.1');
});

test('journal enforces 64 unique IDs and bounded, valid inputs', () => {
  const reference = deposited();
  for (let index = 0; index < 64; index += 1) {
    reference.recordEvent(event(`event-${index}`, { status: 'cancelled', m1: '1' }));
  }
  const before = reference.getState();
  assert.throws(() => reference.recordEvent(event('event-64')), (cause) => errorCode(cause) === 'EVENT_LIMIT');
  assert.deepEqual(reference.getState(), before);
  assert.throws(
    () => model().recordEvent(event('bad-date', { exDate: '2027-02-29' })),
    (cause) => errorCode(cause) === 'INVALID_EVENT',
  );
  assert.throws(
    () => model().recordEvent(event('long-factor', { m1: `1.${'0'.repeat(64)}` })),
    (cause) => errorCode(cause) === 'INVALID_EVENT',
  );
});

test('seeded redemption partitions conserve the full DR pool', () => {
  const reference = deposited(10_000n);
  reference.recordEvent(event('randomized', { m1: '1.37' }));
  const pool = reference.finalize(MATURITY, true).drPoolRaw;
  let seed = 0x5eed;
  let remaining = 10_000n;
  let paid = 0n;
  while (remaining > 0n) {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    const upper = remaining > 311n ? 311n : remaining;
    const part = BigInt(seed % Number(upper)) + 1n;
    paid += reference.redeem('alice', 'dr', part, { allowZero: true });
    remaining -= part;
  }
  assert.equal(paid, pool);
  assert.equal(reference.getState().remainingDrPoolRaw, 0n);
});
