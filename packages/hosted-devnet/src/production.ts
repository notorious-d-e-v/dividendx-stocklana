import { BlobJsonCasStore } from '@dividendx/hosted-broker/json-store';
import { parseRegistryManifest, type RegistryManifest } from '@dividendx/devnet-runtime';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authoritySigners, publicDevnetConnection, SolanaChainAdapter } from './chain.js';
import { ServiceError } from './errors.js';
import { HostedDevnetService } from './service.js';

export function frozenManifest(options: { cwd?: string; moduleUrl?: string | URL } = {}): RegistryManifest {
  const cwd = options.cwd ?? process.cwd();
  const moduleUrl = options.moduleUrl ?? import.meta.url;
  const candidates = [
    resolve(cwd, 'packages/devnet-runtime/manifest.devnet.json'),
    fileURLToPath(new URL('../../devnet-runtime/manifest.devnet.json', moduleUrl)),
    fileURLToPath(new URL('../../../devnet-runtime/manifest.devnet.json', moduleUrl)),
    resolve(cwd, 'manifest.devnet.json'),
  ];
  const path = [...new Set(candidates)].find((candidate) => existsSync(candidate));
  if (!path) throw new ServiceError(503, 'The frozen devnet manifest is unavailable.', 'MANIFEST_UNAVAILABLE');
  try { return parseRegistryManifest(JSON.parse(readFileSync(path, 'utf8')) as unknown); }
  catch { throw new ServiceError(503, 'The frozen devnet manifest is invalid.', 'MANIFEST_INVALID'); }
}

export function blobConfigurationAvailable(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(environment.BLOB_READ_WRITE_TOKEN)
    || Boolean(environment.BLOB_STORE_ID);
}

export function createProductionService(environment: NodeJS.ProcessEnv = process.env): HostedDevnetService {
  if (!blobConfigurationAvailable(environment)) {
    throw new ServiceError(503, 'Private Blob storage is unavailable.', 'BLOB_CONFIG_UNAVAILABLE');
  }
  const manifest = frozenManifest();
  const signers = authoritySigners(environment);
  return new HostedDevnetService(new BlobJsonCasStore(),
    new SolanaChainAdapter(publicDevnetConnection(), manifest, signers.faucet, signers.attestor), manifest);
}
