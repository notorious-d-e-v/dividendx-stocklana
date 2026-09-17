import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { PublicKey } from '@solana/web3.js';
import {
  DEVNET_GENESIS_HASH, DEVNET_RPC_URL, DIVIDENDX_ELF_SHA256, MAX_CREATE_POOL_FEE_LAMPORTS,
  MAX_RUN_SPEND_LAMPORTS, RAYDIUM_CAPTURED_ELF_SHA256, SERIES_YEAR,
} from './constants.js';
import { invariant } from './errors.js';
import type { ExecutionManifest } from './types.js';

function record(value: unknown): Record<string, unknown> {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), 'MANIFEST_INVALID');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string): string {
  invariant(typeof value === 'string' && value.length > 0, 'MANIFEST_INVALID', `${name} is required`);
  return value;
}
function rawAmount(value: unknown, name: string): string {
  const result = text(value, name);
  invariant(/^\d+$/.test(result), 'MANIFEST_INVALID', `${name} must be an unsigned integer string`);
  return result;
}

export function parseManifest(value: unknown): ExecutionManifest {
  const input = record(value);
  invariant(input.schema === 'dividendx-raydium-cpmm-v1', 'MANIFEST_INVALID', 'manifest schema mismatch');
  invariant(input.mode === 'devnet' || input.mode === 'local-clone', 'MANIFEST_INVALID', 'unsupported execution mode');
  const mode = input.mode;
  const rpcUrl = text(input.rpcUrl, 'rpcUrl');
  if (mode === 'devnet') {
    invariant(rpcUrl === DEVNET_RPC_URL, 'RPC_NOT_ALLOWED', 'public execution requires the fixed official devnet RPC');
    invariant(input.expectedGenesisHash === DEVNET_GENESIS_HASH, 'GENESIS_MISMATCH', 'devnet manifest has the wrong genesis hash');
  } else {
    const parsed = new URL(rpcUrl);
    invariant(parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && (parsed.port === '18899' || parsed.port === '19999')
      && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname === '/', 'RPC_NOT_ALLOWED',
    'local clone RPC must be loopback port 18899 or 19999');
  }
  const authority = text(input.expectedDividendXUpgradeAuthority, 'expectedDividendXUpgradeAuthority');
  new PublicKey(authority);
  const deploymentDomainHex = text(input.deploymentDomainHex, 'deploymentDomainHex');
  invariant(/^[0-9a-f]{64}$/i.test(deploymentDomainHex) && !/^0+$/.test(deploymentDomainHex), 'MANIFEST_INVALID', 'deployment domain must be nonzero 32-byte hex');
  const expectedDividendXElfSha256 = text(input.expectedDividendXElfSha256, 'expectedDividendXElfSha256');
  const expectedRaydiumElfSha256 = text(input.expectedRaydiumElfSha256, 'expectedRaydiumElfSha256');
  invariant(expectedDividendXElfSha256 === DIVIDENDX_ELF_SHA256, 'PROGRAM_HASH_MISMATCH', 'DividendX ELF hash is not the accepted build');
  invariant(expectedRaydiumElfSha256 === RAYDIUM_CAPTURED_ELF_SHA256, 'PROGRAM_HASH_MISMATCH', 'Raydium ELF hash is not the reviewed capture');
  const maxCreatePoolFeeLamports = rawAmount(input.maxCreatePoolFeeLamports, 'maxCreatePoolFeeLamports');
  const maxRunSpendLamports = rawAmount(input.maxRunSpendLamports, 'maxRunSpendLamports');
  invariant(BigInt(maxCreatePoolFeeLamports) <= MAX_CREATE_POOL_FEE_LAMPORTS, 'BUDGET_UNBOUNDED');
  invariant(BigInt(maxRunSpendLamports) <= MAX_RUN_SPEND_LAMPORTS, 'BUDGET_UNBOUNDED');
  invariant(input.expectedYear === SERIES_YEAR, 'YEAR_MISMATCH');
  return {
    schema: 'dividendx-raydium-cpmm-v1', mode, rpcUrl,
    expectedGenesisHash: text(input.expectedGenesisHash, 'expectedGenesisHash'),
    expectedDividendXUpgradeAuthority: authority, deploymentDomainHex,
    expectedDividendXElfSha256, expectedRaydiumElfSha256,
    maxCreatePoolFeeLamports, maxRunSpendLamports, expectedYear: SERIES_YEAR,
  };
}

export async function loadManifest(path: string): Promise<ExecutionManifest> {
  invariant(isAbsolute(path), 'MANIFEST_PATH_INVALID', 'manifest path must be absolute');
  let value: unknown;
  try { value = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error('MANIFEST_READ_FAILED'); }
  return parseManifest(value);
}
