#!/usr/bin/env node
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_ID } from './constants.js';
import { bootstrapDevnet, expandDevnetCatalog } from './bootstrap.js';
import { connectionForRpc, parseDevnetRpcUrl } from './config.js';
import { safeError, invariant } from './errors.js';
import { verifyDevnetEnvironment } from './environment.js';
import { assertManifestCurrent, loadRegistryManifest } from './manifest.js';
import { fundHolder, refreshTestObservations, runHolderSmoke } from './operations.js';
import { ensurePrivateStateDirectory, loadExplicitSigner } from './private-state.js';
import { createManifestServer, listen } from './service.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = resolve(packageRoot, '../..');
const commands = new Set(['preflight', 'bootstrap', 'expand-catalog', 'serve', 'fund-holder',
  'refresh-test-observations', 'smoke-holder']);

function parseArgs(args: string[]): { command: string; flags: Map<string, string> } {
  const [command, ...rest] = args;
  invariant(!!command && commands.has(command), 'CLI_USAGE');
  invariant(rest.length % 2 === 0, 'CLI_USAGE');
  const flags = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index]!;
    const value = rest[index + 1]!;
    invariant(name.startsWith('--') && !value.startsWith('--') && !flags.has(name.slice(2)), 'CLI_USAGE');
    flags.set(name.slice(2), value);
  }
  return { command, flags };
}

function required(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  invariant(value, 'CLI_USAGE', `--${name} is required`);
  return value;
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'preflight') {
    const rpcUrl = parseDevnetRpcUrl(flags.get('rpc-url'));
    output(await verifyDevnetEnvironment(connectionForRpc(rpcUrl)));
    return;
  }
  if (command === 'bootstrap' || command === 'expand-catalog') {
    const rpcUrl = parseDevnetRpcUrl(flags.get('rpc-url'));
    const stateDirectory = await ensurePrivateStateDirectory(resolve(required(flags, 'state-dir')), repositoryRoot);
    const admin = await loadExplicitSigner(resolve(required(flags, 'admin-signer')), ADMIN_ID.toBase58());
    const connection = connectionForRpc(rpcUrl);
    const manifest = command === 'bootstrap'
      ? await bootstrapDevnet(connection, rpcUrl, stateDirectory, admin)
      : await expandDevnetCatalog(connection, rpcUrl, stateDirectory, admin);
    output({ ok: true, runtimeId: manifest.runtimeId, manifest: join(stateDirectory, 'manifest.json'),
      assets: manifest.assets.map(({ id, symbol }) => ({ id, symbol })) });
    return;
  }
  const manifest = await loadRegistryManifest(resolve(required(flags, 'manifest')));
  const connection = connectionForRpc(manifest.rpcUrl);
  if (command === 'serve') {
    await assertManifestCurrent(connection, manifest);
    const host = flags.get('host') ?? '127.0.0.1';
    invariant(host === '127.0.0.1' || host === '0.0.0.0', 'HOST_INVALID');
    const port = Number(flags.get('port') ?? '4182');
    invariant(Number.isSafeInteger(port) && port >= 1 && port <= 65_535, 'PORT_INVALID');
    const server = createManifestServer(manifest);
    await listen(server, host, port);
    output({ ok: true, service: `http://${host}:${port}`, faucetEnabled: false });
    return;
  }
  const stateDirectory = await ensurePrivateStateDirectory(resolve(required(flags, 'state-dir')), repositoryRoot);
  if (command === 'fund-holder') {
    output(await fundHolder(connection, manifest, stateDirectory, {
      owner: required(flags, 'owner'), assetId: required(flags, 'asset-id'),
      runtimeId: required(flags, 'runtime-id'), genesisHash: required(flags, 'genesis-hash'),
    }));
    return;
  }
  if (command === 'refresh-test-observations') {
    const lifetime = BigInt(flags.get('lifetime-seconds') ?? '43200');
    output({ signatures: await refreshTestObservations(connection, manifest, stateDirectory, lifetime),
      message: 'Synthetic test-profile observations refreshed; no issuer evidence was asserted.' });
    return;
  }
  invariant(command === 'smoke-holder', 'CLI_USAGE');
  output(await runHolderSmoke(connection, manifest, stateDirectory, required(flags, 'asset-id'),
    resolve(required(flags, 'receipt'))));
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ ok: false, ...safeError(error) }, null, 2)}\n`);
  process.exitCode = 1;
});
