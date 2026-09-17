import { PublicKey } from '@solana/web3.js';
import { checkedDigest, concatBytes, hex, u16Le, u32Le } from './bytes.js';
import { invariant } from './errors.js';

const encoder = new TextEncoder();

export interface DeploymentIdentity {
  clusterGenesisHash: string;
  programId: PublicKey;
  deploymentDomain: Uint8Array;
}

export interface TermDiscoveryIdentity extends DeploymentIdentity {
  issuerId: Uint8Array;
  collateralMint: PublicKey;
  year: number;
}

function stringBytes(value: string): Uint8Array {
  const bytes = encoder.encode(value);
  return concatBytes(u32Le(bytes.length), bytes);
}

export async function termDiscoveryId(identity: TermDiscoveryIdentity): Promise<string> {
  invariant(identity.clusterGenesisHash.length > 0, 'INVALID_IDENTITY', 'cluster genesis hash is required');
  invariant(Number.isInteger(identity.year) && identity.year >= 2020 && identity.year <= 2100, 'INVALID_IDENTITY', 'year must be 2020-2100');
  const preimage = concatBytes(
    encoder.encode('dividendx:term:v1'),
    stringBytes(identity.clusterGenesisHash),
    identity.programId.toBytes(),
    checkedDigest(identity.deploymentDomain, 'deployment domain'),
    checkedDigest(identity.issuerId, 'issuer ID'),
    identity.collateralMint.toBytes(),
    u16Le(identity.year),
  );
  const digest = await globalThis.crypto.subtle.digest('SHA-256', preimage.slice().buffer as ArrayBuffer);
  return hex(new Uint8Array(digest));
}
