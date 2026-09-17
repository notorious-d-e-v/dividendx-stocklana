import { createHash } from 'node:crypto';
import { CpmmConfigInfoLayout, getCpmmPdaAmmConfigId } from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, unpackAccount } from '@solana/spl-token';
import {
  BPF_LOADER_PROGRAM_ID, type AccountInfo, Connection, PublicKey,
} from '@solana/web3.js';
import {
  DIVIDENDX_PROGRAM_ID, FEE_RATE_DENOMINATOR, MAX_TRADE_FEE_RATE, RAYDIUM_CONFIG,
  PUBLIC_CLUSTER_GENESIS_HASHES, RAYDIUM_CPMM_PROGRAM_ID, RAYDIUM_CREATE_POOL_FEE_RECEIVER,
} from './constants.js';
import { invariant } from './errors.js';
import type { AmmConfigSnapshot, ExecutionManifest, PreflightResult, ProgramIdentity } from './types.js';

const AMM_CONFIG_DISCRIMINATOR = createHash('sha256').update('account:AmmConfig').digest().subarray(0, 8);
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

function u64(data: Buffer, offset: number): number {
  const value = data.readBigUInt64LE(offset);
  invariant(value <= BigInt(Number.MAX_SAFE_INTEGER), 'ELF_INVALID');
  return Number(value);
}

export function extractLogicalElf(data: Buffer): Buffer {
  invariant(data.length >= 64 && data.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), 'ELF_INVALID');
  invariant(data[4] === 2 && data[5] === 1, 'ELF_INVALID', 'only ELF64 little-endian programs are supported');
  const phoff = u64(data, 32);
  const shoff = u64(data, 40);
  const phentsize = data.readUInt16LE(54);
  const phnum = data.readUInt16LE(56);
  const shentsize = data.readUInt16LE(58);
  const shnum = data.readUInt16LE(60);
  let end = 64;
  invariant(phoff + phentsize * phnum <= data.length && shoff + shentsize * shnum <= data.length, 'ELF_INVALID');
  end = Math.max(end, phoff + phentsize * phnum, shoff + shentsize * shnum);
  for (let index = 0; index < phnum; index += 1) {
    const offset = phoff + index * phentsize;
    invariant(phentsize >= 56 && offset + 56 <= data.length, 'ELF_INVALID');
    end = Math.max(end, u64(data, offset + 8) + u64(data, offset + 32));
  }
  for (let index = 0; index < shnum; index += 1) {
    const offset = shoff + index * shentsize;
    invariant(shentsize >= 64 && offset + 64 <= data.length, 'ELF_INVALID');
    const type = data.readUInt32LE(offset + 4);
    if (type !== 8) end = Math.max(end, u64(data, offset + 24) + u64(data, offset + 32));
  }
  invariant(end <= data.length && end > 64, 'ELF_INVALID');
  return data.subarray(0, end);
}

function parseProgramDataAddress(info: AccountInfo<Buffer>): PublicKey {
  invariant(info.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID) && info.data.length >= 36 && info.data.readUInt32LE(0) === 2, 'PROGRAM_LOADER_INVALID');
  return new PublicKey(info.data.subarray(4, 36));
}

async function programIdentity(connection: Connection, address: PublicKey, info: AccountInfo<Buffer>, expectedHash: string, expectedAuthority?: PublicKey): Promise<ProgramIdentity> {
  invariant(info.executable, 'PROGRAM_NOT_EXECUTABLE', `${address.toBase58()} is not executable`);
  let elf: Buffer;
  let programData: PublicKey | null = null;
  let deploySlot: string | null = null;
  let authority: PublicKey | null = null;
  if (info.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID)) {
    programData = parseProgramDataAddress(info);
    const dataInfo = await connection.getAccountInfo(programData, 'confirmed');
    invariant(dataInfo && dataInfo.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID) && dataInfo.data.length > 45 && dataInfo.data.readUInt32LE(0) === 3, 'PROGRAM_DATA_INVALID');
    const authorityOption = dataInfo.data[12];
    invariant(authorityOption === 0 || authorityOption === 1, 'PROGRAM_DATA_INVALID');
    authority = authorityOption === 1 ? new PublicKey(dataInfo.data.subarray(13, 45)) : null;
    deploySlot = dataInfo.data.readBigUInt64LE(4).toString();
    elf = dataInfo.data.subarray(45);
  } else {
    invariant(info.owner.equals(BPF_LOADER_PROGRAM_ID), 'PROGRAM_LOADER_INVALID');
    elf = info.data;
  }
  const elfSha256 = createHash('sha256').update(elf).digest('hex');
  invariant(elfSha256 === expectedHash, 'PROGRAM_HASH_MISMATCH', `${address.toBase58()} ELF hash mismatch`);
  if (expectedAuthority) invariant(authority?.equals(expectedAuthority), 'PROGRAM_AUTHORITY_MISMATCH');
  return {
    address: address.toBase58(), owner: info.owner.toBase58(), executable: info.executable,
    programData: programData?.toBase58() ?? null, deploySlot,
    upgradeAuthority: authority?.toBase58() ?? null, elfSha256,
  };
}

export function decodeAmmConfig(data: Buffer): AmmConfigSnapshot {
  invariant(data.length === 236 && data.subarray(0, 8).equals(AMM_CONFIG_DISCRIMINATOR), 'RAYDIUM_CONFIG_INVALID');
  const decoded = CpmmConfigInfoLayout.decode(data);
  return {
    address: RAYDIUM_CONFIG.toBase58(), bump: decoded.bump, disableCreatePool: decoded.disableCreatePool,
    index: decoded.index, tradeFeeRate: BigInt(decoded.tradeFeeRate.toString()),
    protocolFeeRate: BigInt(decoded.protocolFeeRate.toString()), fundFeeRate: BigInt(decoded.fundFeeRate.toString()),
    createPoolFee: BigInt(decoded.createPoolFee.toString()), protocolOwner: decoded.protocolOwner.toBase58(),
    fundOwner: decoded.fundOwner.toBase58(), creatorFeeRate: BigInt(decoded.creatorFeeRate.toString()),
  };
}

export async function verifyExecutionEnvironment(connection: Connection, manifest: ExecutionManifest): Promise<PreflightResult> {
  const genesisHash = await connection.getGenesisHash();
  invariant(genesisHash === manifest.expectedGenesisHash, 'GENESIS_MISMATCH');
  if (manifest.mode === 'local-clone') invariant(!PUBLIC_CLUSTER_GENESIS_HASHES.has(genesisHash), 'LOCAL_MODE_PUBLIC_CLUSTER');
  const addresses = [DIVIDENDX_PROGRAM_ID, RAYDIUM_CPMM_PROGRAM_ID, RAYDIUM_CONFIG, RAYDIUM_CREATE_POOL_FEE_RECEIVER];
  const response = await connection.getMultipleAccountsInfoAndContext(addresses, { commitment: 'confirmed' });
  const [dividendXInfo, raydiumInfo, configInfo, feeInfo] = response.value;
  invariant(dividendXInfo && raydiumInfo && configInfo && feeInfo, 'REQUIRED_ACCOUNT_MISSING');
  const expectedAuthority = new PublicKey(manifest.expectedDividendXUpgradeAuthority);
  const dividendX = await programIdentity(connection, DIVIDENDX_PROGRAM_ID, dividendXInfo, manifest.expectedDividendXElfSha256, expectedAuthority);
  const raydium = await programIdentity(connection, RAYDIUM_CPMM_PROGRAM_ID, raydiumInfo, manifest.expectedRaydiumElfSha256);
  invariant(configInfo.owner.equals(RAYDIUM_CPMM_PROGRAM_ID), 'RAYDIUM_CONFIG_OWNER');
  invariant(getCpmmPdaAmmConfigId(RAYDIUM_CPMM_PROGRAM_ID, 0).publicKey.equals(RAYDIUM_CONFIG), 'RAYDIUM_CONFIG_INVALID');
  const config = decodeAmmConfig(configInfo.data);
  invariant(config.index === 0 && !config.disableCreatePool, 'RAYDIUM_CREATION_DISABLED');
  invariant(config.tradeFeeRate > 0n && config.tradeFeeRate <= MAX_TRADE_FEE_RATE, 'RAYDIUM_FEE_UNBOUNDED');
  invariant(config.protocolFeeRate + config.fundFeeRate <= FEE_RATE_DENOMINATOR, 'RAYDIUM_FEE_INVALID');
  invariant(config.tradeFeeRate + config.creatorFeeRate < FEE_RATE_DENOMINATOR, 'RAYDIUM_FEE_INVALID');
  invariant(config.createPoolFee <= BigInt(manifest.maxCreatePoolFeeLamports), 'CREATE_POOL_FEE_BUDGET');
  invariant(feeInfo.owner.equals(TOKEN_PROGRAM_ID), 'FEE_RECEIVER_OWNER');
  const feeReceiver = unpackAccount(RAYDIUM_CREATE_POOL_FEE_RECEIVER, feeInfo, TOKEN_PROGRAM_ID);
  invariant(feeReceiver.mint.equals(NATIVE_MINT) && feeReceiver.isNative === true
    && feeReceiver.isInitialized && !feeReceiver.isFrozen, 'FEE_RECEIVER_INVALID');
  return {
    mode: manifest.mode, rpcUrl: manifest.rpcUrl, genesisHash, contextSlot: response.context.slot,
    dividendX, raydium, config,
    feeReceiver: {
      address: RAYDIUM_CREATE_POOL_FEE_RECEIVER.toBase58(), mint: feeReceiver.mint.toBase58(),
      tokenOwner: feeReceiver.owner.toBase58(), amountRaw: feeReceiver.amount.toString(), isNative: true,
    },
  };
}
