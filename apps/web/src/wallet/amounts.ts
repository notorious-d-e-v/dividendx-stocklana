import { MAX_U64 } from '@dividendx/transaction-sdk';

interface Rational { numerator: bigint; denominator: bigint }

function positiveFiniteBinary64(bits: bigint): Rational {
  if (bits < 0n || bits > MAX_U64 || bits >> 63n !== 0n) throw new Error('Stock multiplier is not a positive finite f64.');
  const rawExponent = (bits >> 52n) & 0x7ffn;
  const fraction = bits & ((1n << 52n) - 1n);
  if (rawExponent === 0x7ffn || (rawExponent === 0n && fraction === 0n)) throw new Error('Stock multiplier is not a positive finite f64.');
  const significand = rawExponent === 0n ? fraction : (1n << 52n) | fraction;
  const exponent = rawExponent === 0n ? -1074 : Number(rawExponent) - 1023 - 52;
  return exponent >= 0 ? { numerator: significand << BigInt(exponent), denominator: 1n } : { numerator: significand, denominator: 1n << BigInt(-exponent) };
}

export function parseRawAmount(value: string, decimals: number): bigint {
  if (!/^\d+(?:\.\d*)?$/.test(value)) throw new Error('Enter a plain positive decimal amount.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`This token supports at most ${decimals} decimal places.`);
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction || '').padEnd(decimals, '0') || '0');
  if (raw <= 0n) throw new Error('Amount must be greater than zero.');
  if (raw > MAX_U64) throw new Error('Amount exceeds the onchain u64 limit.');
  return raw;
}

export function formatClaim(raw: bigint, decimals: number, places = decimals): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = (raw % divisor).toString().padStart(decimals, '0').slice(0, Math.min(decimals, places)).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function formatStock(raw: bigint, decimals: number, multiplierBits: bigint, places = 9): string {
  if (raw === 0n) return '0';
  const multiplier = positiveFiniteBinary64(multiplierBits);
  const numerator = raw * multiplier.numerator;
  const denominator = multiplier.denominator * 10n ** BigInt(decimals);
  const whole = numerator / denominator;
  let remainder = numerator % denominator;
  let fraction = '';
  for (let index = 0; index < places && remainder !== 0n; index += 1) {
    remainder *= 10n;
    fraction += (remainder / denominator).toString();
    remainder %= denominator;
  }
  fraction = fraction.replace(/0+$/, '');
  if (!fraction && whole === 0n && numerator > 0n) return `<${`0.${'0'.repeat(Math.max(0, places - 1))}1`}`;
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Converts a displayed scaled stock amount to raw units, rounding down once to an exact integer. */
export function parseStockAmount(value: string, decimals: number, multiplierBits: bigint): bigint {
  if (!/^\d+(?:\.\d*)?$/.test(value)) throw new Error('Enter a plain positive decimal amount.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > 18) throw new Error('Stock input supports at most 18 decimal places.');
  const displayNumerator = BigInt(`${whole}${fraction}`);
  const displayDenominator = 10n ** BigInt(fraction.length);
  const multiplier = positiveFiniteBinary64(multiplierBits);
  const raw = displayNumerator * 10n ** BigInt(decimals) * multiplier.denominator / (displayDenominator * multiplier.numerator);
  if (raw <= 0n) throw new Error('Amount is below one raw stock-token unit.');
  if (raw > MAX_U64) throw new Error('Amount exceeds the onchain u64 limit.');
  return raw;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
