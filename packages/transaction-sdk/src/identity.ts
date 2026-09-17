import { concatBytes, checkedDigest, u32Le } from './bytes.js';
import { invariant } from './errors.js';

const encoder = new TextEncoder();
const IDENTITY_PREFIX = encoder.encode('dividendx:identity:v1');

function canonicalComponent(value: string, label: string): Uint8Array {
  invariant(typeof value === 'string' && value.length > 0, 'INVALID_IDENTITY', `${label} cannot be empty`);
  invariant(value === value.normalize('NFC'), 'INVALID_IDENTITY', `${label} must use Unicode NFC`);
  const bytes = encoder.encode(value);
  invariant(bytes.length <= 1024, 'INVALID_IDENTITY', `${label} must encode to at most 1024 UTF-8 bytes`);
  return concatBytes(u32Le(bytes.length), bytes);
}

export async function identityHash(
  kind: 'issuer' | 'event',
  clusterDomain: string,
  sourceIdentifier: string,
): Promise<Uint8Array> {
  const preimage = concatBytes(
    IDENTITY_PREFIX,
    canonicalComponent(kind, 'identity kind'),
    canonicalComponent(clusterDomain, 'cluster domain'),
    canonicalComponent(sourceIdentifier, 'source identifier'),
  );
  const digest = await globalThis.crypto.subtle.digest('SHA-256', preimage.slice().buffer as ArrayBuffer);
  return checkedDigest(new Uint8Array(digest), `${kind} identity hash`);
}

export function issuerIdentityHash(clusterDomain: string, sourceIssuerId: string): Promise<Uint8Array> {
  return identityHash('issuer', clusterDomain, sourceIssuerId);
}

export function eventIdentityHash(clusterDomain: string, sourceEventId: string): Promise<Uint8Array> {
  return identityHash('event', clusterDomain, sourceEventId);
}
