import { createHash } from 'node:crypto';
import type { Idl } from '@anchor-lang/core';
import { BPF_LOADER_PROGRAM_ID, type AccountInfo, type Connection, PublicKey } from '@solana/web3.js';
import {
  DIVIDENDX_IDL, configPda, fetchProgramAccountsCoherently, normalizeConfigAccount,
} from '@dividendx/transaction-sdk';
import {
  ACCEPTED_ELF_SHA256, ADMIN_ID, DEPLOYMENT_DOMAIN_HEX, DEVNET_GENESIS_HASH, MAINNET_GENESIS_HASH, PROGRAM_ID,
  TESTNET_GENESIS_HASH,
} from './constants.js';
import { invariant } from './errors.js';

const UPGRADEABLE_LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');

function programDataAddress(info: AccountInfo<Buffer>): PublicKey {
  invariant(info.owner.equals(UPGRADEABLE_LOADER) && info.data.length >= 36 && info.data.readUInt32LE(0) === 2,
    'PROGRAM_LOADER_INVALID');
  return new PublicKey(info.data.subarray(4, 36));
}

export interface EnvironmentProof {
  genesisHash: string;
  programId: string;
  elfSha256: string;
  upgradeAuthority: string;
  deploymentDomainHex: string;
  contextSlot: number;
}

export async function verifyDevnetEnvironment(connection: Connection): Promise<EnvironmentProof> {
  const genesisHash = await connection.getGenesisHash();
  invariant(genesisHash !== MAINNET_GENESIS_HASH && genesisHash !== TESTNET_GENESIS_HASH, 'PUBLIC_CLUSTER_REFUSED');
  invariant(genesisHash === DEVNET_GENESIS_HASH, 'GENESIS_MISMATCH');
  const programInfo = await connection.getAccountInfo(PROGRAM_ID, 'confirmed');
  invariant(programInfo?.executable, 'PROGRAM_NOT_EXECUTABLE');
  invariant(!programInfo.owner.equals(BPF_LOADER_PROGRAM_ID), 'PROGRAM_LOADER_INVALID');
  const dataAddress = programDataAddress(programInfo);
  const dataInfo = await connection.getAccountInfo(dataAddress, 'confirmed');
  invariant(dataInfo && dataInfo.owner.equals(UPGRADEABLE_LOADER) && dataInfo.data.length > 45
    && dataInfo.data.readUInt32LE(0) === 3 && dataInfo.data[12] === 1, 'PROGRAM_DATA_INVALID');
  const authority = new PublicKey(dataInfo.data.subarray(13, 45));
  invariant(authority.equals(ADMIN_ID), 'PROGRAM_AUTHORITY_MISMATCH');
  const elfSha256 = createHash('sha256').update(dataInfo.data.subarray(45)).digest('hex');
  invariant(elfSha256 === ACCEPTED_ELF_SHA256, 'PROGRAM_HASH_MISMATCH');
  const config = configPda().address;
  const snapshot = await fetchProgramAccountsCoherently(connection, DIVIDENDX_IDL as Idl,
    [{ address: config, accountName: 'config', owner: PROGRAM_ID }]);
  const normalized = normalizeConfigAccount(config, snapshot.accounts[0]!.value);
  invariant(normalized.admin.equals(ADMIN_ID), 'CONFIG_ADMIN_MISMATCH');
  invariant(Buffer.from(normalized.deploymentDomain).toString('hex') === DEPLOYMENT_DOMAIN_HEX,
    'DEPLOYMENT_DOMAIN_MISMATCH');
  return {
    genesisHash, programId: PROGRAM_ID.toBase58(), elfSha256,
    upgradeAuthority: authority.toBase58(), deploymentDomainHex: DEPLOYMENT_DOMAIN_HEX,
    contextSlot: snapshot.contextSlot,
  };
}
