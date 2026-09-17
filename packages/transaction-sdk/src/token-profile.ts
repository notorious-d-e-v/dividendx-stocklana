import {
  ExtensionType,
  getExtensionData,
  getExtensionTypes,
  type Mint,
} from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { decodeCanonicalMultiplier } from './arithmetic.js';
import { bytesEqual, concatBytes, u16Le } from './bytes.js';
import { invariant } from './errors.js';
import type { AssetPolicySnapshot, ChainClock, ScaleTuple } from './types.js';

const encoder = new TextEncoder();
const ALLOWED = new Set<number>([
  ExtensionType.ScaledUiAmountConfig,
  ExtensionType.MetadataPointer,
  ExtensionType.TokenMetadata,
  ExtensionType.MintCloseAuthority,
  ExtensionType.PermanentDelegate,
  ExtensionType.DefaultAccountState,
  ExtensionType.TransferHook,
  ExtensionType.PausableConfig,
  ExtensionType.ConfidentialTransferMint,
]);

export interface InspectedMintProfile {
  decimals: number;
  extensionsMask: bigint;
  scale: ScaleTuple;
  controlsFingerprint: Uint8Array;
  accountingFactorsSupported: boolean;
}

function optionPublicKey(value: PublicKey | null): Uint8Array {
  return concatBytes(Uint8Array.of(value ? 1 : 0), value?.toBytes() ?? new Uint8Array(32));
}

function extensionData(mint: Mint, extensionType: ExtensionType): Uint8Array {
  const data = getExtensionData(extensionType, mint.tlvData);
  invariant(data !== null, 'RPC_ACCOUNT_MISSING', `mint extension ${extensionType} data is missing`);
  return data;
}

export async function inspectMintProfile(mint: Mint, clock: ChainClock): Promise<InspectedMintProfile> {
  invariant(mint.isInitialized, 'INVALID_SERIES', 'collateral mint is uninitialized');
  invariant([6, 8, 9].includes(mint.decimals), 'INVALID_SERIES', 'collateral mint decimals must be 6, 8 or 9');
  const types = getExtensionTypes(mint.tlvData).sort((left, right) => left - right);
  invariant(new Set(types).size === types.length, 'INVALID_SERIES', 'collateral mint has duplicate extensions');
  const fingerprintParts: Uint8Array[] = [
    encoder.encode('dividendx:mint-controls:v1'),
    mint.address.toBytes(),
    optionPublicKey(mint.mintAuthority),
    optionPublicKey(mint.freezeAuthority),
  ];
  let extensionsMask = 0n;
  let scale: ScaleTuple | null = null;
  let accountingFactorsSupported = false;
  for (const type of types) {
    invariant(type < 64 && ALLOWED.has(type), 'INVALID_SERIES', `unsupported collateral mint extension ${type}`);
    extensionsMask |= 1n << BigInt(type);
    fingerprintParts.push(u16Le(type));
    const data = extensionData(mint, type);
    switch (type) {
      case ExtensionType.ScaledUiAmountConfig: {
        invariant(data.length === 56, 'INVALID_SERIES', 'ScaledUiAmount extension length is invalid');
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const currentBits = view.getBigUint64(32, true);
        const pendingEffectiveTimestamp = view.getBigInt64(40, true);
        const pendingBits = view.getBigUint64(48, true);
        try {
          decodeCanonicalMultiplier(currentBits);
          decodeCanonicalMultiplier(pendingBits);
          accountingFactorsSupported = true;
        } catch {
          accountingFactorsSupported = false;
        }
        scale = {
          currentBits,
          pendingBits,
          pendingEffectiveTimestamp,
          activeBits: clock.unixTimestamp >= pendingEffectiveTimestamp ? pendingBits : currentBits,
        };
        fingerprintParts.push(data.subarray(0, 32));
        break;
      }
      case ExtensionType.MetadataPointer:
        fingerprintParts.push(data.subarray(0, 32));
        break;
      case ExtensionType.TokenMetadata:
        break;
      case ExtensionType.MintCloseAuthority:
      case ExtensionType.PermanentDelegate:
      case ExtensionType.DefaultAccountState:
      case ExtensionType.TransferHook:
      case ExtensionType.ConfidentialTransferMint:
        fingerprintParts.push(data);
        break;
      case ExtensionType.PausableConfig:
        fingerprintParts.push(data.subarray(0, 32));
        break;
      default:
        throw new Error(`unreachable extension ${type}`);
    }
    if (type === ExtensionType.DefaultAccountState) invariant(data.length === 1 && data[0] === 1, 'INVALID_SERIES', 'default token account state is not Initialized');
    if (type === ExtensionType.TransferHook) invariant(data.length === 64 && data.subarray(32).every((byte) => byte === 0), 'INVALID_SERIES', 'collateral mint has an active transfer hook');
    if (type === ExtensionType.PausableConfig) invariant(data.length === 33 && data[32] === 0, 'INVALID_SERIES', 'collateral mint is paused');
  }
  invariant(scale !== null, 'INVALID_SERIES', 'collateral mint lacks ScaledUiAmount');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', concatBytes(...fingerprintParts).slice().buffer as ArrayBuffer);
  return { decimals: mint.decimals, extensionsMask, scale, controlsFingerprint: new Uint8Array(digest), accountingFactorsSupported };
}

/** @deprecated Use inspectMintProfile and check accountingFactorsSupported for admission/finalization. */
export const inspectSupportedMintProfile = inspectMintProfile;

export function mintProfileMatchesPolicy(
  policy: AssetPolicySnapshot,
  profile: InspectedMintProfile,
): boolean {
  return profile.accountingFactorsSupported
    && profile.decimals === policy.decimals
    && profile.extensionsMask === policy.extensionsMask
    && profile.scale.currentBits === policy.observedScale.currentBits
    && profile.scale.pendingBits === policy.observedScale.pendingBits
    && profile.scale.pendingEffectiveTimestamp === policy.observedScale.pendingEffectiveTimestamp
    && profile.scale.activeBits === policy.observedScale.activeBits
    && bytesEqual(profile.controlsFingerprint, policy.controlsFingerprint);
}
