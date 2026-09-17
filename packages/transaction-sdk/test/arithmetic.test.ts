import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeMultiplierBits,
  allocationFromRetention,
  bitsToF64,
  cumulativeRedemptionPayout,
  decimalStringToRational,
  decodeCanonicalMultiplier,
  eventRetentionRatio,
  f64ToBits,
  multiplyRetentionRatios,
} from '../src/arithmetic.js';

test('canonical f64 bits preserve the exact binary rational rather than a decimal display value', () => {
  const bits = f64ToBits(1.1);
  assert.equal(bits, 0x3ff1_9999_9999_999an);
  assert.equal(bitsToF64(bits), 1.1);
  const binary = decodeCanonicalMultiplier(bits);
  const decimal = decimalStringToRational('1.1');
  assert.notEqual(binary.numerator * decimal.denominator, decimal.numerator * binary.denominator);
  assert.equal(binary.numerator, 2_476_979_795_053_773n);
  assert.equal(binary.denominator, 2_251_799_813_685_248n);
});

test('active multiplier uses pending bits at timestamp equality', () => {
  const current = f64ToBits(1);
  const pending = f64ToBits(1.25);
  assert.equal(activeMultiplierBits(current, pending, 100n, 99n), current);
  assert.equal(activeMultiplierBits(current, pending, 100n, 100n), pending);
});

test('retention product compounds events and rounds the final pool once', () => {
  const first = { m0Bits: f64ToBits(1), m1Bits: f64ToBits(1.1) };
  const second = { m0Bits: f64ToBits(1.1), m1Bits: f64ToBits(1.21) };
  const retention = multiplyRetentionRatios([first, second]);
  const direct = eventRetentionRatio(f64ToBits(1), f64ToBits(1.21));
  assert.equal(retention.numerator * direct.denominator, direct.numerator * retention.denominator);
  const allocation = allocationFromRetention(1_000_000n, retention);
  assert.equal(allocation.ptRaw + allocation.drRaw, 1_000_000n);
  assert.equal(allocation.drRaw, 173_553n);
});

test('rejects invalid and decreasing binary64 event factors', () => {
  assert.throws(() => decodeCanonicalMultiplier(0n), /subnormal/);
  assert.throws(() => decodeCanonicalMultiplier(0x7ff0_0000_0000_0000n), /infinite/);
  assert.throws(() => eventRetentionRatio(f64ToBits(2), f64ToBits(1)), /M1 >= M0/);
  assert.throws(() => decodeCanonicalMultiplier(f64ToBits(2 ** 32)), /below 2\^32/);
});

test('cumulative redemption telescopes to the full pool', () => {
  const pool = 173_553n;
  const supply = 1_000_000n;
  const first = cumulativeRedemptionPayout(pool, supply, 0n, 333_333n);
  const second = cumulativeRedemptionPayout(pool, supply, 333_333n, 666_667n);
  assert.equal(first + second, pool);
});

test('reviewed KOx and MU canonical-bit vectors match exact raw pools', () => {
  const vectors = [
    {
      q: 9_819_982_084n,
      m0Bits: 4_607_264_977_872_978_803n,
      m1Bits: 4_607_284_020_568_871_647n,
      ptRaw: 9_779_376_057n,
      drRaw: 40_606_027n,
    },
    {
      q: 100_000_000n,
      m0Bits: 4_607_182_418_800_017_408n,
      m1Bits: 4_607_182_899_454_409_970n,
      ptRaw: 99_989_329n,
      drRaw: 10_671n,
    },
  ];
  for (const vector of vectors) {
    assert.deepEqual(
      allocationFromRetention(vector.q, eventRetentionRatio(vector.m0Bits, vector.m1Bits)),
      { ptRaw: vector.ptRaw, drRaw: vector.drRaw },
    );
  }
});

test('64-event reviewed extremes stay below 8192 bits and preserve fractional allocation', () => {
  const cases = [
    {
      event: { m0Bits: 4_463_067_230_724_161_536n, m1Bits: 4_751_297_606_875_873_279n },
      expected: { ptRaw: 1n, drRaw: 18_446_744_073_709_551_614n },
    },
    {
      event: { m0Bits: 4_607_182_418_800_017_408n, m1Bits: 4_607_182_418_800_017_409n },
      expected: { ptRaw: 18_446_744_073_709_289_472n, drRaw: 262_143n },
    },
  ];
  for (const vector of cases) {
    const ratio = multiplyRetentionRatios(Array.from({ length: 64 }, () => vector.event));
    assert.ok(ratio.numerator.toString(2).length <= 8192);
    assert.ok(ratio.denominator.toString(2).length <= 8192);
    assert.deepEqual(allocationFromRetention((1n << 64n) - 1n, ratio), vector.expected);
  }
});
