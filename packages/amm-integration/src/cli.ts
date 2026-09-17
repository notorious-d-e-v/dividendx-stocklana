#!/usr/bin/env node
import { realpath } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest } from './manifest.js';
import { connectionForManifest } from './rpc.js';
import { safeErrorCode, safeErrorDetail, invariant } from './errors.js';
import { verifyExecutionEnvironment } from './guards.js';
import { loadExplicitSigner } from './signers.js';
import { loadOrCreateStateSigner, writePrivateJson } from './state.js';
import { runAmmFlow } from './flow.js';
import type { QuoteMode } from './constants.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoot = resolve(packageRoot, '../..');
const allowedStateRoot = resolve(repositoryRoot, '.local-tools');

function argumentsMap(values: string[]): { command: string; values: Map<string, string> } {
  const [command, ...rest] = values;
  invariant(command === 'preflight' || command === 'public' || command === 'local', 'CLI_USAGE');
  const output = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    invariant(key?.startsWith('--') && value && !value.startsWith('--'), 'CLI_USAGE');
    output.set(key.slice(2), value);
  }
  return { command, values: output };
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  invariant(value, 'CLI_USAGE', `--${name} is required`);
  return value;
}

function printable(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => typeof entry === 'bigint' ? entry.toString() : entry, 2);
}

async function main(): Promise<void> {
  const parsed = argumentsMap(process.argv.slice(2));
  const manifest = await loadManifest(required(parsed.values, 'manifest'));
  const quoteMode = parsed.values.get('quote') ?? 'mock';
  invariant(quoteMode === 'mock' || quoteMode === 'circle-devnet-usdc', 'CLI_USAGE',
    '--quote must be mock or circle-devnet-usdc');
  const selectedQuote = quoteMode as QuoteMode;
  invariant((parsed.command === 'public') === (manifest.mode === 'devnet') || parsed.command === 'preflight',
    'EXECUTION_MODE_MISMATCH');
  if (selectedQuote === 'circle-devnet-usdc') invariant(parsed.command === 'public' && manifest.mode === 'devnet',
    'CIRCLE_USDC_REQUIRES_PUBLIC_DEVNET');
  const connection = connectionForManifest(manifest);
  if (parsed.command === 'preflight') {
    invariant(selectedQuote === 'mock', 'CLI_USAGE', 'Circle funding preflight runs as part of the public command');
    process.stdout.write(`${printable(await verifyExecutionEnvironment(connection, manifest))}\n`);
    return;
  }
  const stateDirectory = resolve(required(parsed.values, 'state-dir'));
  const stateParent = await realpath(dirname(stateDirectory));
  invariant(stateParent === allowedStateRoot && stateDirectory.startsWith(`${allowedStateRoot}${sep}`),
    'STATE_PATH_INVALID', 'state directory must be a new direct child of repository .local-tools');
  const receiptPath = resolve(required(parsed.values, 'receipt'));
  invariant(dirname(receiptPath) === stateDirectory && basename(receiptPath) === 'receipt.json',
    'STATE_PATH_INVALID', 'receipt must be the reserved receipt.json inside the private state directory');
  const admin = await loadExplicitSigner(resolve(required(parsed.values, 'admin-signer')),
    manifest.expectedDividendXUpgradeAuthority);
  const signers = {
    admin,
    attestor: await loadOrCreateStateSigner(stateDirectory, 'attestor'),
    provider: await loadOrCreateStateSigner(stateDirectory, 'provider'),
    buyer: await loadOrCreateStateSigner(stateDirectory, 'buyer'),
    collateralMint: await loadOrCreateStateSigner(stateDirectory, 'collateral-mint'),
    testQuoteMint: selectedQuote === 'mock'
      ? await loadOrCreateStateSigner(stateDirectory, 'test-quote-mint') : undefined,
  };
  const progressPath = resolve(stateDirectory, 'progress.json');
  const receipt = await runAmmFlow(connection, manifest, signers,
    async (progress) => writePrivateJson(progressPath, { schema: 'dividendx-raydium-cpmm-progress-v1', ...progress }),
    selectedQuote);
  await writePrivateJson(receiptPath, receipt);
  process.stdout.write(`${printable({ receipt: receiptPath, boundary: receipt.boundary,
    transactions: receipt.transactions.map(({ name, signature, slot }) => ({ name, signature, slot })),
    identities: receipt.identities })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${printable({ ok: false, code: safeErrorCode(error), detail: safeErrorDetail(error) })}\n`);
  process.exitCode = 1;
});
