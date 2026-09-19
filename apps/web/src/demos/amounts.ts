import type { DemoSnapshot, DemoWallet } from '../../../../packages/guided-runtime/src/contract';

export type BalanceKey = keyof Pick<DemoWallet, 'stockRaw' | 'ptRaw' | 'drRaw' | 'quoteRaw' | 'lpRaw'>;

export interface AmountContext {
  stockDecimals: number;
  claimDecimals: number;
  quoteDecimals: number;
  lpDecimals: number;
  stockMultiplierBits: bigint;
}

interface Rational { numerator: bigint; denominator: bigint }

// Browser-only copy of the wallet formatter's exact f64-bit algorithm. Importing
// the wallet module would also evaluate its signing dependencies on this page.
function positiveFiniteBinary64(bits: bigint): Rational {
  if (bits < 0n || bits > (1n << 64n) - 1n || bits >> 63n !== 0n) throw new Error('Invalid stock multiplier.');
  const rawExponent = (bits >> 52n) & 0x7ffn;
  const fraction = bits & ((1n << 52n) - 1n);
  if (rawExponent === 0x7ffn || (rawExponent === 0n && fraction === 0n)) throw new Error('Invalid stock multiplier.');
  const significand = rawExponent === 0n ? fraction : (1n << 52n) | fraction;
  const exponent = rawExponent === 0n ? -1074 : Number(rawExponent) - 1023 - 52;
  return exponent >= 0 ? { numerator: significand << BigInt(exponent), denominator: 1n } : { numerator: significand, denominator: 1n << BigInt(-exponent) };
}

function formatClaim(raw: bigint, decimals: number, places = decimals): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = (raw % divisor).toString().padStart(decimals, '0').slice(0, Math.min(decimals, places)).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function formatStock(raw: bigint, decimals: number, multiplierBits: bigint, places = 9): string {
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

export function amountContext(snapshot: DemoSnapshot): AmountContext {
  return {
    stockDecimals: snapshot.stockDecimals,
    claimDecimals: snapshot.claimDecimals,
    quoteDecimals: snapshot.quoteDecimals,
    lpDecimals: snapshot.lpDecimals,
    stockMultiplierBits: BigInt(snapshot.stockMultiplierBits),
  };
}

export function displayBalance(raw: string, key: BalanceKey, context: AmountContext): string {
  const value = BigInt(raw);
  if (key === 'stockRaw') return formatStock(value, context.stockDecimals, context.stockMultiplierBits, 9);
  if (key === 'quoteRaw') return formatClaim(value, context.quoteDecimals, context.quoteDecimals);
  if (key === 'lpRaw') return formatClaim(value, context.lpDecimals, context.lpDecimals);
  return formatClaim(value, context.claimDecimals, context.claimDecimals);
}

export function displayDelta(before: string, after: string, key: BalanceKey, context: AmountContext): string | null {
  const delta = BigInt(after) - BigInt(before);
  if (delta === 0n) return null;
  const value = displayBalance((delta < 0n ? -delta : delta).toString(), key, context);
  return `${delta > 0n ? '+' : '−'}${value}`;
}
