import { MAX_EVENTS, MAX_RATIONAL_BYTES } from './constants.js';
import { assertI64, assertU64, bigintToMinimalLe } from './bytes.js';
import { invariant } from './errors.js';

export interface ExactRational {
  numerator: bigint;
  denominator: bigint;
}

export interface Binary64Value extends ExactRational {
  bits: bigint;
  significand: bigint;
  exponent2: number;
}

const FRACTION_MASK = (1n << 52n) - 1n;
const EXPONENT_MASK = 0x7ffn;

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function reduceRational(value: ExactRational): ExactRational {
  invariant(value.numerator >= 0n && value.denominator > 0n, 'INVALID_F64_BITS', 'rational must be non-negative with a positive denominator');
  const divisor = gcd(value.numerator, value.denominator);
  return { numerator: value.numerator / divisor, denominator: value.denominator / divisor };
}

export function f64ToBits(value: number): bigint {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, true);
  return new DataView(buffer).getBigUint64(0, true);
}

export function bitsToF64(bits: bigint): number {
  invariant(bits >= 0n && bits <= ((1n << 64n) - 1n), 'INVALID_F64_BITS', 'bits must be an unsigned u64');
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigUint64(0, bits, true);
  return new DataView(buffer).getFloat64(0, true);
}

export function decodeCanonicalMultiplier(bits: bigint): Binary64Value {
  invariant(bits >= 0n && bits <= ((1n << 64n) - 1n), 'INVALID_F64_BITS', 'multiplier bits must be an unsigned u64');
  const sign = bits >> 63n;
  const rawExponent = (bits >> 52n) & EXPONENT_MASK;
  const fraction = bits & FRACTION_MASK;
  invariant(sign === 0n, 'INVALID_F64_BITS', 'multiplier must be positive');
  invariant(rawExponent !== 0n, 'INVALID_F64_BITS', 'zero and subnormal multipliers are not supported');
  invariant(rawExponent !== EXPONENT_MASK, 'INVALID_F64_BITS', 'NaN and infinite multipliers are not supported');

  const significand = (1n << 52n) | fraction;
  const exponent2 = Number(rawExponent) - 1023 - 52;
  const rational = exponent2 >= 0
    ? { numerator: significand << BigInt(exponent2), denominator: 1n }
    : { numerator: significand, denominator: 1n << BigInt(-exponent2) };
  const reduced = reduceRational(rational);
  invariant(compareRationals(reduced, { numerator: 1n, denominator: 1n << 32n }) >= 0, 'INVALID_F64_BITS', 'multiplier is below 2^-32');
  invariant(compareRationals(reduced, { numerator: 1n << 32n, denominator: 1n }) < 0, 'INVALID_F64_BITS', 'multiplier must be below 2^32');
  return { bits, significand, exponent2, ...reduced };
}

export function compareRationals(left: ExactRational, right: ExactRational): -1 | 0 | 1 {
  const delta = left.numerator * right.denominator - right.numerator * left.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

export function eventRetentionRatio(m0Bits: bigint, m1Bits: bigint): ExactRational {
  const m0 = decodeCanonicalMultiplier(m0Bits);
  const m1 = decodeCanonicalMultiplier(m1Bits);
  invariant(compareRationals(m1, m0) >= 0, 'INVALID_F64_BITS', 'qualified event requires M1 >= M0');
  return reduceRational({
    numerator: m0.numerator * m1.denominator,
    denominator: m0.denominator * m1.numerator,
  });
}

export function multiplyRetentionRatios(events: readonly { m0Bits: bigint; m1Bits: bigint }[]): ExactRational {
  invariant(events.length <= MAX_EVENTS, 'INVALID_F64_BITS', `at most ${MAX_EVENTS} event factors are supported`);
  let result: ExactRational = { numerator: 1n, denominator: 1n };
  for (const event of events) {
    const ratio = eventRetentionRatio(event.m0Bits, event.m1Bits);
    result = reduceRational({
      numerator: result.numerator * ratio.numerator,
      denominator: result.denominator * ratio.denominator,
    });
    invariant(bigintToMinimalLe(result.numerator).length <= MAX_RATIONAL_BYTES, 'INVALID_F64_BITS', 'accumulator numerator exceeds 8192 bits');
    invariant(bigintToMinimalLe(result.denominator).length <= MAX_RATIONAL_BYTES, 'INVALID_F64_BITS', 'accumulator denominator exceeds 8192 bits');
  }
  return result;
}

export function allocationFromRetention(accountableRaw: bigint, retention: ExactRational): { ptRaw: bigint; drRaw: bigint } {
  assertU64(accountableRaw, 'accountable raw amount');
  const reduced = reduceRational(retention);
  invariant(reduced.numerator <= reduced.denominator, 'INVALID_F64_BITS', 'retention ratio cannot exceed one');
  const drRaw = accountableRaw * (reduced.denominator - reduced.numerator) / reduced.denominator;
  return { ptRaw: accountableRaw - drRaw, drRaw };
}

export function cumulativeRedemptionPayout(
  poolRaw: bigint,
  supplyDenominatorRaw: bigint,
  previouslyRedeemedClaimsRaw: bigint,
  burnRaw: bigint,
): bigint {
  assertU64(poolRaw, 'redemption pool');
  assertU64(supplyDenominatorRaw, 'supply denominator', false);
  assertU64(previouslyRedeemedClaimsRaw, 'previously redeemed claims');
  assertU64(burnRaw, 'burn amount', false);
  invariant(previouslyRedeemedClaimsRaw + burnRaw <= supplyDenominatorRaw, 'INVALID_AMOUNT', 'redemption exceeds the final nominal supply');
  return (previouslyRedeemedClaimsRaw + burnRaw) * poolRaw / supplyDenominatorRaw
    - previouslyRedeemedClaimsRaw * poolRaw / supplyDenominatorRaw;
}

export function decimalStringToRational(value: string): ExactRational {
  invariant(/^\d+(?:\.\d+)?$/.test(value), 'INVALID_F64_BITS', 'decimal multiplier must be a plain non-negative decimal');
  const [whole, fraction = ''] = value.split('.');
  return reduceRational({ numerator: BigInt(`${whole}${fraction}`), denominator: 10n ** BigInt(fraction.length) });
}

export function activeMultiplierBits(
  currentBits: bigint,
  pendingBits: bigint,
  pendingEffectiveTimestamp: bigint,
  clockUnixTimestamp: bigint,
): bigint {
  decodeCanonicalMultiplier(currentBits);
  decodeCanonicalMultiplier(pendingBits);
  assertI64(pendingEffectiveTimestamp, 'pending effective timestamp');
  assertI64(clockUnixTimestamp, 'clock Unix timestamp');
  return clockUnixTimestamp >= pendingEffectiveTimestamp ? pendingBits : currentBits;
}
