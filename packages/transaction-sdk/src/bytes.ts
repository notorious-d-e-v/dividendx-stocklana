import { MAX_I64, MAX_U64, MIN_I64 } from './constants.js';
import { invariant } from './errors.js';

export function assertU64(value: bigint, label = 'value', allowZero = true): bigint {
  invariant(
    typeof value === 'bigint' && value >= (allowZero ? 0n : 1n) && value <= MAX_U64,
    'INVALID_AMOUNT',
    `${label} must be ${allowZero ? 'an unsigned' : 'a positive unsigned'} u64 bigint`,
  );
  return value;
}

export function assertI64(value: bigint, label = 'value'): bigint {
  invariant(
    typeof value === 'bigint' && value >= MIN_I64 && value <= MAX_I64,
    'INVALID_CLOCK',
    `${label} must be a signed i64 bigint`,
  );
  return value;
}

export function u16Le(value: number): Uint8Array {
  invariant(Number.isInteger(value) && value >= 0 && value <= 0xffff, 'INVALID_AMOUNT', 'value must be a u16');
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

export function u32Le(value: number): Uint8Array {
  invariant(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, 'INVALID_AMOUNT', 'value must be a u32');
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

export function u64Le(value: bigint): Uint8Array {
  assertU64(value);
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

export function i64Le(value: bigint): Uint8Array {
  assertI64(value);
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, value, true);
  return bytes;
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function bytesToBigIntLe(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) value = (value << 8n) | BigInt(bytes[index]!);
  return value;
}

export function bigintToMinimalLe(value: bigint): Uint8Array {
  invariant(value >= 0n, 'INVALID_AMOUNT', 'value must be non-negative');
  if (value === 0n) return Uint8Array.of(0);
  const bytes: number[] = [];
  let remainder = value;
  while (remainder > 0n) {
    bytes.push(Number(remainder & 0xffn));
    remainder >>= 8n;
  }
  return Uint8Array.from(bytes);
}

export function checkedDigest(value: Uint8Array, label = 'digest', allowZero = false): Uint8Array {
  invariant(value instanceof Uint8Array && value.length === 32, 'INVALID_DIGEST', `${label} must contain exactly 32 bytes`);
  invariant(allowZero || value.some((byte) => byte !== 0), 'INVALID_DIGEST', `${label} must be nonzero`);
  return new Uint8Array(value);
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(value: string, expectedLength?: number): Uint8Array {
  invariant(/^(?:[0-9a-fA-F]{2})*$/.test(value), 'INVALID_DIGEST', 'hex string is malformed');
  const bytes = Uint8Array.from(value.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
  invariant(expectedLength === undefined || bytes.length === expectedLength, 'INVALID_DIGEST', `hex string must encode ${expectedLength} bytes`);
  return bytes;
}
