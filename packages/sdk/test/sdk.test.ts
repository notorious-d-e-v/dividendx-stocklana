import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DemoError,
  allocate,
  createDemoClient,
  formatScaled,
  formatUnits,
  parseUsdc,
  toRawAmount,
  type AssetDescriptor,
  type EventDescriptor,
} from '../src/index.ts';

const KO_ASSET_ID = 'xstocks:XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ';
const MU_ASSET_ID = 'backpack:MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1';
const KO_EVENT_ID = 'xstocks-kox-2026-09-15';
const MU_EVENT_ID = 'backpack-mu-2026-07-23';

function asset(overrides: Partial<AssetDescriptor> = {}): AssetDescriptor {
  const issuerId = overrides.issuerId ?? 'xstocks';
  const mint = overrides.mint ?? 'XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ';
  return {
    id: `${issuerId}:${mint}`, company: 'Coca-Cola', underlying: 'KO', symbol: 'KOx', issuerId, mint,
    decimals: 8, tokenProgram: 'Token-2022', snapshotAt: '2026-09-16T00:00:00Z', observedSlot: 447407258,
    effectiveMultiplier: '1.0225601246249238', sourceUrls: ['https://example.test/asset'], evidencePaths: ['evidence.json'],
    capabilities: { recognized: true, mintObserved: true, dividendDocumented: true, custodyTested: false, executionTested: false, liveEnabled: false },
    eventFixtureId: KO_EVENT_ID, statusDetail: 'Frozen replay', issuerControlNote: 'Issuer controls remain',
    ...overrides,
  };
}

function event(overrides: Partial<EventDescriptor> = {}): EventDescriptor {
  return {
    id: KO_EVENT_ID, assetId: KO_ASSET_ID, issuerEventId: '75c0c70e-1ae4-4ccd-ace6-d8990e1e8f9e', revision: 2,
    kind: 'cash_dividend', evidenceKind: 'issuer_api', m0: '1.0183317967386898', m1: '1.0225601246249238',
    actualEventAt: '2026-09-15T00:30:00Z', snapshotAt: '2026-09-16T00:00:00Z', issuerRecordStatus: 'Initial',
    companyPaymentDate: '2026-10-01', netCashflowUsd: '0.371', referencePriceUsd: '89.35',
    sourceUrls: ['https://example.test/event'], evidencePaths: ['event.json'], sourceDigest: 'sha256:test',
    finality: 'trusted_frozen_replay', ...overrides,
  };
}

function muAsset(): AssetDescriptor {
  return asset({
    issuerId: 'backpack', mint: 'MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1', id: MU_ASSET_ID,
    company: 'Micron', underlying: 'MU', symbol: 'MU.US', decimals: 6,
    effectiveMultiplier: '1.0001068649823912', eventFixtureId: MU_EVENT_ID,
  });
}

function muEvent(): EventDescriptor {
  return event({
    id: MU_EVENT_ID, assetId: MU_ASSET_ID, issuerEventId: null, revision: null,
    evidenceKind: 'onchain_reconstruction', m0: '1', m1: '1.000106726714702', issuerRecordStatus: null,
    netCashflowUsd: null, referencePriceUsd: null,
  });
}

function fixtures(): { assets: AssetDescriptor[]; events: EventDescriptor[] } {
  return { assets: [asset(), muAsset()], events: [event(), muEvent()] };
}

function code(error: unknown): string | undefined {
  return error instanceof DemoError ? error.code : undefined;
}

test('exact KOx historical allocations and display conversion', () => {
  assert.equal(toRawAmount('100', 8, '1.0183317967386898'), 9_819_982_084n);
  assert.deepEqual(allocate(9_819_982_084n, '1.0183317967386898', '1.0225601246249238'), {
    ptPoolRaw: 9_779_376_057n, drPoolRaw: 40_606_027n,
  });
  assert.deepEqual(allocate(10_000_000_000n, '1.0183317967386898', '1.0225601246249238'), {
    ptPoolRaw: 9_958_649_592n, drPoolRaw: 41_350_408n,
  });
  assert.equal(formatScaled(9_779_376_057n, 8, '1.0225601246249238', 4), '100.0000');
  assert.equal(formatScaled(40_606_027n, 8, '1.0225601246249238', 4), '0.4152');
});

test('Backpack historical allocation uses the event M1, not the later current factor', () => {
  const raw = toRawAmount('1000', 6, '1');
  assert.equal(raw, 1_000_000_000n);
  assert.deepEqual(allocate(raw, '1', '1.000106726714702'), {
    ptPoolRaw: 999_893_285n, drPoolRaw: 106_715n,
  });
  assert.notDeepEqual(allocate(raw, '1', '1.0001068649823912'), allocate(raw, '1', '1.000106726714702'));
});

test('plain decimal validation, precision, u64 overflow and 6/8/9 profiles', () => {
  for (const bad of ['', '-1', '+1', '1e3', ' 1', '1.', '.1', 'NaN', 'Infinity', '1.0000000000000000001']) {
    assert.throws(() => toRawAmount(bad, 18, '1'), (error) => code(error) === 'INVALID_AMOUNT');
  }
  assert.throws(() => toRawAmount('1.0000001', 6, '1'), (error) => code(error) === 'INVALID_AMOUNT');
  assert.throws(() => toRawAmount('18446744073709551616', 0, '1'), (error) => code(error) === 'INVALID_AMOUNT');
  assert.equal(toRawAmount('1.234567', 6, '1'), 1_234_567n);
  assert.equal(toRawAmount('1.23456789', 8, '1'), 123_456_789n);
  assert.equal(toRawAmount('1.234567891', 9, '1'), 1_234_567_891n);
  assert.equal(formatUnits(1_234_567n, 6), '1.234567');
  assert.equal(parseUsdc('30'), 30_000_000n);
  assert.deepEqual(allocate(17n, '1', '1'), { ptPoolRaw: 17n, drPoolRaw: 0n });
});

test('fixture identity, duplicates, missing evidence, invalid factors and unsupported kinds reject', () => {
  const good = asset();
  const goodEvent = event();
  assert.throws(() => createDemoClient([good, good], [goodEvent]), (error) => code(error) === 'INVALID_FIXTURE');
  assert.throws(() => createDemoClient([good], [goodEvent, goodEvent]), (error) => code(error) === 'INVALID_FIXTURE');
  assert.throws(() => createDemoClient([asset({ id: 'xstocks:wrong' })], [goodEvent]), (error) => code(error) === 'INVALID_FIXTURE');
  assert.throws(() => createDemoClient([good], [event({ assetId: 'xstocks:unknown' })]), (error) => code(error) === 'INVALID_FIXTURE');
  assert.throws(() => createDemoClient([good], [event({ kind: 'reverse_split' })]), (error) => code(error) === 'INVALID_FIXTURE');
  assert.throws(() => createDemoClient([good], [event({ sourceDigest: '' })]), (error) => code(error) === 'INVALID_FIXTURE');
  assert.throws(() => createDemoClient([good], [event({ m0: '2', m1: '1' })]), (error) => code(error) === 'INVALID_FIXTURE');
  assert.throws(() => createDemoClient([good], [event({ m0: '1', m1: '1' })]), (error) => code(error) === 'INVALID_FIXTURE');
});

test('zero preview works while a zero-effective deposit is rejected atomically', async () => {
  const client = createDemoClient([asset()], [event()]);
  assert.equal(client.preview(KO_ASSET_ID, '0').collateralRaw, 0n);
  const before = client.getState();
  await assert.rejects(client.deposit(KO_ASSET_ID, '0.00000002'), (error) => code(error) === 'INVALID_AMOUNT');
  assert.deepEqual(client.getState(), before);
});

async function depositedClient(now?: () => number) {
  const { assets, events } = fixtures();
  const client = createDemoClient(assets, events, { now });
  await client.deposit(KO_ASSET_ID, '100');
  return client;
}

test('deposit, open sale, cutoff, settlement and two-owner full redemption conserve everything', async () => {
  const client = await depositedClient();
  const deposited = client.getState();
  const series = deposited.series[KO_EVENT_ID];
  const initialCash = deposited.wallets.seller.usdc + deposited.wallets.buyer.usdc;
  const sold = series.drSupplyRaw / 2n;
  const quote = client.quoteSale(KO_EVENT_ID, sold, parseUsdc('30'));
  await client.acceptSale(quote.id);
  const afterSale = client.getState();
  assert.equal(afterSale.wallets.seller.usdc + afterSale.wallets.buyer.usdc, initialCash);
  assert.equal(afterSale.wallets.seller.claims[KO_EVENT_ID].dr + afterSale.wallets.buyer.claims[KO_EVENT_ID].dr, series.drSupplyRaw);
  await client.closeDeposits(KO_EVENT_ID);
  await assert.rejects(client.deposit(KO_ASSET_ID, '1'), (error) => code(error) === 'DEPOSITS_CLOSED');
  await client.settle(KO_EVENT_ID);
  await assert.rejects(client.settle(KO_EVENT_ID), (error) => code(error) === 'ALREADY_SETTLED');
  const settled = client.getState().series[KO_EVENT_ID];
  assert.equal(settled.originalPtPoolRaw + settled.originalDrPoolRaw, settled.originalSupplyRaw);
  await client.redeem(KO_EVENT_ID, 'buyer', 'dr', sold);
  const seller = client.getState().wallets.seller.claims[KO_EVENT_ID];
  await client.redeem(KO_EVENT_ID, 'seller', 'dr', seller.dr);
  await client.redeem(KO_EVENT_ID, 'seller', 'pt', seller.pt);
  const complete = client.getState().series[KO_EVENT_ID];
  assert.equal(complete.phase, 'complete');
  assert.equal(complete.ptPoolRaw + complete.drPoolRaw + complete.accountedCollateralRaw, 0n);
  await assert.rejects(client.redeem(KO_EVENT_ID, 'seller', 'pt', 1n), (error) => code(error) === 'WRONG_PHASE');
});

async function redeemOrder(order: readonly bigint[]): Promise<bigint[]> {
  const client = await depositedClient();
  await client.closeDeposits(KO_EVENT_ID);
  await client.settle(KO_EVENT_ID);
  const payouts: bigint[] = [];
  for (const amount of order) {
    const payout = client.previewRedemption(KO_EVENT_ID, 'seller', 'dr', amount);
    payouts.push(payout);
    await client.redeem(KO_EVENT_ID, 'seller', 'dr', amount);
  }
  return payouts;
}

test('cumulative floor differences conserve fractional redemptions in either order', async () => {
  const supply = 9_819_982_084n;
  const first = 3_000_000_000n;
  const second = supply - first;
  const forward = await redeemOrder([first, second]);
  const reverse = await redeemOrder([second, first]);
  assert.equal(forward[0] + forward[1], 40_606_027n);
  assert.equal(reverse[0] + reverse[1], 40_606_027n);
});

test('quotes reject, expire, stale, cannot replay, and reset invalidates IDs without mutation', async () => {
  let time = 1_000;
  const client = await depositedClient(() => time);
  const amount = 1_000_000n;
  const rejected = client.quoteSale(KO_EVENT_ID, amount, 1_000_000n);
  const beforeReject = client.getState();
  await assert.rejects(client.acceptSale(rejected.id, { reject: true }), (error) => code(error) === 'USER_REJECTED');
  assert.deepEqual(client.getState(), beforeReject);

  const expired = client.quoteSale(KO_EVENT_ID, amount, 1_000_000n);
  time = expired.expiresAt;
  await assert.rejects(client.acceptSale(expired.id), (error) => code(error) === 'EXPIRED_QUOTE');
  assert.deepEqual(client.getState(), beforeReject);

  time = 2_000;
  const stale = client.quoteSale(KO_EVENT_ID, amount, 1_000_000n);
  client.setCondition('stale');
  client.setCondition('ready');
  await assert.rejects(client.acceptSale(stale.id), (error) => code(error) === 'STALE_QUOTE');

  const used = client.quoteSale(KO_EVENT_ID, amount, 1_000_000n);
  await client.acceptSale(used.id);
  await assert.rejects(client.acceptSale(used.id), (error) => code(error) === 'MISSING_QUOTE');

  const old = client.quoteSale(KO_EVENT_ID, amount, 1_000_000n);
  client.reset();
  await assert.rejects(client.acceptSale(old.id), (error) => code(error) === 'STALE_QUOTE');
  assert.equal(client.getState().version, 0);
});

test('recombination needs both claims, supports recovery conditions, and cannot strand a zero DR pool', async () => {
  const client = await depositedClient();
  const sale = client.quoteSale(KO_EVENT_ID, 1_000_000n, 1_000_000n);
  await client.acceptSale(sale.id);
  await assert.rejects(client.recombine(KO_EVENT_ID, 'seller', client.getState().wallets.seller.claims[KO_EVENT_ID].pt),
    (error) => code(error) === 'INSUFFICIENT_BALANCE');
  client.setCondition('stale');
  await client.recombine(KO_EVENT_ID, 'seller', 1_000_000n);
  client.setCondition('paused');
  await assert.rejects(client.recombine(KO_EVENT_ID, 'buyer', 1n), (error) => code(error) === 'PAUSED_COLLATERAL');
});

test('stale and rejected event block deposit/settlement; stale does not rewrite settlement; paused blocks redemption', async () => {
  const client = await depositedClient();
  client.setCondition('stale');
  await assert.rejects(client.deposit(KO_ASSET_ID, '1'), (error) => code(error) === 'STALE_DATA');
  await client.closeDeposits(KO_EVENT_ID);
  await assert.rejects(client.settle(KO_EVENT_ID), (error) => code(error) === 'STALE_DATA');
  client.setCondition('rejected_event');
  await assert.rejects(client.settle(KO_EVENT_ID), (error) => code(error) === 'REJECTED_EVENT');
  client.setCondition('ready');
  await client.settle(KO_EVENT_ID);
  const frozen = client.getState().series[KO_EVENT_ID].originalDrPoolRaw;
  client.setCondition('stale');
  const claim = client.getState().wallets.seller.claims[KO_EVENT_ID].dr;
  await client.redeem(KO_EVENT_ID, 'seller', 'dr', claim);
  assert.equal(client.getState().series[KO_EVENT_ID].originalDrPoolRaw, frozen);

  const paused = await depositedClient();
  paused.setCondition('paused');
  await assert.rejects(paused.deposit(KO_ASSET_ID, '1'), (error) => code(error) === 'PAUSED_COLLATERAL');
  paused.setCondition('ready');
  await paused.closeDeposits(KO_EVENT_ID);
  await paused.settle(KO_EVENT_ID);
  paused.setCondition('paused');
  await assert.rejects(paused.redeem(KO_EVENT_ID, 'seller', 'pt', 1n), (error) => code(error) === 'PAUSED_COLLATERAL');
});

test('missing Ondo event fails with typed error and snapshots cannot mutate ledger', () => {
  const ondo = asset({ issuerId: 'ondo', mint: 'OndoMint', id: 'ondo:OndoMint', decimals: 9, eventFixtureId: null });
  const client = createDemoClient([ondo], []);
  assert.throws(() => client.preview(ondo.id, '1'), (error) => code(error) === 'MISSING_EVENT');
  const external = client.getState();
  external.wallets.buyer.usdc = 0n;
  external.wallets.seller.collateral[ondo.id] = 999n;
  external.receipts.push({ id: 'demo-tamper', kind: 'demo', action: 'sale', seriesId: 'x', timestamp: 0, summary: 'tamper', changes: [] });
  const internal = client.getState();
  assert.equal(internal.wallets.buyer.usdc, 1_000_000_000n);
  assert.equal(internal.wallets.seller.collateral[ondo.id], 0n);
  assert.equal(internal.receipts.length, 0);
});
