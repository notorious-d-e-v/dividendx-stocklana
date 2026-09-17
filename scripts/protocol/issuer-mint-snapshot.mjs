#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { TOKEN_2022_PROGRAM_ID, getExtensionTypes, unpackMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { decodeClockAccount, inspectMintProfile } from '@dividendx/transaction-sdk';

export const ENDPOINT = 'https://api.mainnet-beta.solana.com';
export const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const COMMITMENT = 'finalized';
export const SCHEMA = 'dividendx-issuer-mint-snapshot-v1';
export const CLOCK_ADDRESS = 'SysvarC1ock11111111111111111111111111111111';
export const CLOCK_OWNER = 'Sysvar1111111111111111111111111111111111111';
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const TOKEN_2022 = TOKEN_2022_PROGRAM_ID.toBase58();
const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(HERE, '../../packages/demo-fixtures/catalog.json');
const HEX_256 = /^[0-9a-f]{64}$/;
const HEX = /^(?:[0-9a-f]{2})+$/;

export class SnapshotError extends Error {
  constructor(code, message = code) {
    super(`${code}: ${message}`);
    this.name = 'SnapshotError';
    this.code = code;
  }
}

const fail = (condition, code, message) => {
  if (!condition) throw new SnapshotError(code, message);
};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const safeUint = value => Number.isSafeInteger(value) && value >= 0;
const exactKeys = (value, keys, label) => {
  fail(value && typeof value === 'object' && !Array.isArray(value), 'invalid_schema', `${label} must be an object`);
  fail(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()), 'invalid_schema', `${label} fields differ from v1`);
};
const canonicalKey = (value, label) => {
  fail(typeof value === 'string', 'invalid_identity', `${label} must be a string`);
  let key;
  try { key = new PublicKey(value); } catch { throw new SnapshotError('invalid_identity', `${label} is not a public key`); }
  fail(key.toBase58() === value, 'invalid_identity', `${label} is not canonical`);
  return key;
};

export async function loadCatalog(readFileImpl = readFile) {
  const bytes = await readFileImpl(CATALOG_PATH);
  fail(bytes.byteLength <= 256 * 1024, 'catalog_too_large', 'catalog exceeds 256 KiB');
  let catalog;
  try { catalog = JSON.parse(bytes.toString('utf8')); } catch { throw new SnapshotError('invalid_catalog', 'catalog is not JSON'); }
  fail(Array.isArray(catalog) && catalog.length === 15, 'invalid_catalog', 'catalog must contain exactly 15 assets');
  const seen = new Set();
  for (const [index, asset] of catalog.entries()) {
    exactKeys(asset, ['id', 'company', 'underlying', 'symbol', 'issuerId', 'mint', 'decimals', 'tokenProgram', 'snapshotAt', 'observedSlot', 'effectiveMultiplier', 'sourceUrls', 'evidencePaths', 'capabilities', 'eventFixtureId', 'statusDetail', 'issuerControlNote'], `catalog asset ${index}`);
    canonicalKey(asset.mint, `catalog asset ${index} mint`);
    fail(!seen.has(asset.mint), 'invalid_catalog', 'catalog contains a duplicate mint');
    seen.add(asset.mint);
    fail(typeof asset.issuerId === 'string' && asset.issuerId.length > 0, 'invalid_catalog', 'issuerId is invalid');
    fail(typeof asset.symbol === 'string' && asset.symbol.length > 0, 'invalid_catalog', 'symbol is invalid');
    fail([6, 8, 9].includes(asset.decimals), 'invalid_catalog', 'decimals are outside policy');
    fail(asset.tokenProgram === TOKEN_2022, 'invalid_catalog', 'catalog mint is not Token-2022');
  }
  return { catalog, catalogSha256: sha256(bytes) };
}

async function readBounded(response, limit = MAX_RESPONSE_BYTES) {
  const declared = response.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined) fail(/^\d+$/.test(declared) && Number(declared) <= limit, 'response_too_large', 'RPC response exceeds bound');
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    fail(bytes.byteLength <= limit, 'response_too_large', 'RPC response exceeds bound');
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new SnapshotError('response_too_large', 'RPC response exceeds bound');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, length);
}

export async function rpc(method, params, { fetchImpl = fetch, timeoutMs = 20_000, id = 1, now = () => new Date().toISOString() } = {}) {
  fail(['getGenesisHash', 'getMultipleAccounts'].includes(method), 'rpc_method_refused', `method ${method} is not allowed`);
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new SnapshotError(error?.name === 'TimeoutError' ? 'rpc_timeout' : 'rpc_failed', `${method} request failed`);
  }
  fail(response && response.ok === true, 'rpc_http_error', `${method} returned HTTP ${response?.status ?? 'unknown'}`);
  let responseUrlMatches = true;
  if (response.url) {
    const responseUrl = new URL(response.url);
    const endpointUrl = new URL(ENDPOINT);
    responseUrlMatches = responseUrl.origin === endpointUrl.origin && responseUrl.pathname === '/' && responseUrl.search === '';
  }
  fail(response.redirected !== true && responseUrlMatches, 'rpc_redirect_refused', `${method} was redirected`);
  const raw = await readBounded(response);
  let envelope;
  try { envelope = JSON.parse(raw.toString('utf8')); } catch { throw new SnapshotError('invalid_rpc_response', `${method} response is not JSON`); }
  fail(envelope?.jsonrpc === '2.0' && envelope.id === id && !('error' in envelope) && 'result' in envelope, 'invalid_rpc_response', `${method} response envelope is invalid`);
  return { result: envelope.result, retrievedAt: now(), responseSha256: sha256(raw) };
}

function decodeRpcAccount(value, label) {
  fail(value && typeof value === 'object' && !Array.isArray(value), 'invalid_rpc_account', `${label} is missing`);
  fail(safeUint(value.lamports), 'invalid_rpc_account', `${label} lamports are invalid`);
  fail(typeof value.executable === 'boolean', 'invalid_rpc_account', `${label} executable is invalid`);
  canonicalKey(value.owner, `${label} owner`);
  fail(Array.isArray(value.data) && value.data.length === 2 && value.data[1] === 'base64' && typeof value.data[0] === 'string', 'invalid_rpc_account', `${label} data encoding is invalid`);
  const data = Buffer.from(value.data[0], 'base64');
  fail(data.byteLength <= 64 * 1024 && data.toString('base64') === value.data[0], 'invalid_rpc_account', `${label} data is invalid`);
  return { owner: value.owner, lamports: value.lamports, executable: value.executable, dataHex: data.toString('hex'), dataSha256: sha256(data) };
}

export async function captureSnapshot({ fetchImpl = fetch, now = () => new Date().toISOString(), readFileImpl = readFile } = {}) {
  const { catalog, catalogSha256 } = await loadCatalog(readFileImpl);
  const genesis = await rpc('getGenesisHash', [], { fetchImpl, id: 1, now });
  fail(genesis.result === MAINNET_GENESIS_HASH, 'wrong_genesis', 'RPC is not pinned Solana mainnet');
  const addresses = [...catalog.map(asset => asset.mint), CLOCK_ADDRESS];
  fail(addresses.length === 16, 'invalid_account_count', 'capture requires exactly 15 mints plus Clock');
  const accounts = await rpc('getMultipleAccounts', [addresses, { commitment: COMMITMENT, encoding: 'base64' }], { fetchImpl, id: 2, now });
  fail(accounts.result && typeof accounts.result === 'object', 'invalid_rpc_response', 'account result is invalid');
  fail(safeUint(accounts.result.context?.slot), 'invalid_rpc_response', 'context slot is invalid');
  fail(Array.isArray(accounts.result.value) && accounts.result.value.length === 16, 'invalid_rpc_response', 'account response is incomplete');
  const decoded = accounts.result.value.map((value, index) => decodeRpcAccount(value, index === 15 ? 'Clock' : `mint ${index}`));
  const clockValue = decoded[15];
  fail(clockValue.owner === CLOCK_OWNER, 'invalid_clock', 'Clock owner is invalid');
  const assets = catalog.map((asset, index) => {
    const account = decoded[index];
    fail(account.owner === TOKEN_2022, 'invalid_mint_owner', `${asset.symbol} is not owned by Token-2022`);
    return { issuerId: asset.issuerId, symbol: asset.symbol, mint: asset.mint, decimals: asset.decimals, tokenProgram: asset.tokenProgram, lamports: account.lamports, executable: account.executable, dataHex: account.dataHex, dataSha256: account.dataSha256 };
  });
  return {
    schema: SCHEMA,
    capturedAt: now(),
    endpoint: ENDPOINT,
    genesisHash: genesis.result,
    commitment: COMMITMENT,
    contextSlot: accounts.result.context.slot,
    catalogSha256,
    requests: [
      { method: 'getGenesisHash', retrievedAt: genesis.retrievedAt, responseSha256: genesis.responseSha256 },
      { method: 'getMultipleAccounts', retrievedAt: accounts.retrievedAt, responseSha256: accounts.responseSha256 },
    ],
    clock: { address: CLOCK_ADDRESS, ...clockValue },
    assets,
    purpose: 'offline_custody_conformance',
    liveCustodyTested: false,
    settlementReady: false,
  };
}

function validateRawAccount(account, label, expectedKeys) {
  exactKeys(account, expectedKeys, label);
  fail(safeUint(account.lamports), 'invalid_schema', `${label} lamports are invalid`);
  fail(account.executable === false, 'invalid_schema', `${label} must not be executable`);
  fail(typeof account.dataHex === 'string' && account.dataHex.length <= 128 * 1024 && HEX.test(account.dataHex), 'invalid_schema', `${label} dataHex is not canonical`);
  fail(typeof account.dataSha256 === 'string' && HEX_256.test(account.dataSha256), 'invalid_schema', `${label} dataSha256 is invalid`);
  const data = Buffer.from(account.dataHex, 'hex');
  fail(sha256(data) === account.dataSha256, 'digest_mismatch', `${label} data digest differs`);
  return data;
}

export async function verifySnapshot(snapshot, options = {}) {
  const { readFileImpl = readFile, snapshotFileSha256 } = options;
  fail(snapshotFileSha256 === undefined || HEX_256.test(snapshotFileSha256), 'invalid_file_digest', 'snapshot file digest is invalid');
  exactKeys(snapshot, ['schema', 'capturedAt', 'endpoint', 'genesisHash', 'commitment', 'contextSlot', 'catalogSha256', 'requests', 'clock', 'assets', 'purpose', 'liveCustodyTested', 'settlementReady'], 'snapshot');
  fail(snapshot.schema === SCHEMA, 'invalid_schema', 'snapshot schema differs');
  fail(iso(snapshot.capturedAt), 'invalid_schema', 'capturedAt is not canonical ISO time');
  fail(snapshot.endpoint === ENDPOINT && snapshot.genesisHash === MAINNET_GENESIS_HASH && snapshot.commitment === COMMITMENT, 'wrong_network', 'snapshot network binding differs');
  fail(safeUint(snapshot.contextSlot), 'invalid_schema', 'contextSlot is invalid');
  fail(snapshot.purpose === 'offline_custody_conformance' && snapshot.liveCustodyTested === false && snapshot.settlementReady === false, 'invalid_boundary', 'evidence boundary differs');
  fail(Array.isArray(snapshot.requests) && snapshot.requests.length === 2, 'invalid_schema', 'requests must contain two entries');
  const expectedMethods = ['getGenesisHash', 'getMultipleAccounts'];
  snapshot.requests.forEach((request, index) => {
    exactKeys(request, ['method', 'retrievedAt', 'responseSha256'], `request ${index}`);
    fail(request.method === expectedMethods[index] && iso(request.retrievedAt) && HEX_256.test(request.responseSha256), 'invalid_schema', `request ${index} is invalid`);
  });
  const captureTime = Date.parse(snapshot.capturedAt);
  const firstRequestTime = Date.parse(snapshot.requests[0].retrievedAt);
  const secondRequestTime = Date.parse(snapshot.requests[1].retrievedAt);
  fail(captureTime >= secondRequestTime && secondRequestTime >= firstRequestTime, 'invalid_timestamps', 'capture and request times are out of order');
  const { catalog, catalogSha256 } = await loadCatalog(readFileImpl);
  fail(snapshot.catalogSha256 === catalogSha256, 'catalog_digest_mismatch', 'catalog digest differs');
  fail(Array.isArray(snapshot.assets) && snapshot.assets.length === catalog.length, 'invalid_asset_count', 'asset list is incomplete');
  canonicalKey(snapshot.clock?.address, 'Clock address');
  fail(snapshot.clock.address === CLOCK_ADDRESS && snapshot.clock.owner === CLOCK_OWNER, 'invalid_clock', 'Clock identity differs');
  canonicalKey(snapshot.clock.owner, 'Clock owner');
  const clockData = validateRawAccount(snapshot.clock, 'clock', ['address', 'owner', 'lamports', 'executable', 'dataHex', 'dataSha256']);
  fail(clockData.byteLength === 40, 'invalid_clock', 'Clock data length differs');
  const clock = decodeClockAccount({ data: clockData, owner: new PublicKey(snapshot.clock.owner), lamports: snapshot.clock.lamports, executable: false, rentEpoch: 0 }, snapshot.contextSlot);
  fail(clock.contextSlot === snapshot.contextSlot && clock.slot === BigInt(snapshot.contextSlot), 'invalid_clock', 'raw Clock slot differs from RPC context slot');

  const assets = [];
  for (const [index, asset] of snapshot.assets.entries()) {
    const expected = catalog[index];
    exactKeys(asset, ['issuerId', 'symbol', 'mint', 'decimals', 'tokenProgram', 'lamports', 'executable', 'dataHex', 'dataSha256'], `asset ${index}`);
    fail(asset.issuerId === expected.issuerId && asset.symbol === expected.symbol && asset.mint === expected.mint && asset.decimals === expected.decimals && asset.tokenProgram === expected.tokenProgram, 'identity_mismatch', `asset ${index} differs from ordered catalog`);
    canonicalKey(asset.mint, `asset ${index} mint`);
    fail(asset.tokenProgram === TOKEN_2022, 'invalid_mint_owner', `${asset.symbol} token program differs`);
    const data = validateRawAccount(asset, `asset ${index}`, ['issuerId', 'symbol', 'mint', 'decimals', 'tokenProgram', 'lamports', 'executable', 'dataHex', 'dataSha256']);
    const accountInfo = { data, owner: TOKEN_2022_PROGRAM_ID, lamports: asset.lamports, executable: false, rentEpoch: 0 };
    let mint;
    try { mint = unpackMint(new PublicKey(asset.mint), accountInfo, TOKEN_2022_PROGRAM_ID); } catch { throw new SnapshotError('invalid_mint_data', `${asset.symbol} cannot be decoded as Token-2022 mint`); }
    fail(mint.isInitialized && mint.decimals === asset.decimals, 'invalid_mint_data', `${asset.symbol} initialization or decimals differ`);
    const extensionTypes = getExtensionTypes(mint.tlvData).sort((a, b) => a - b);
    const base = {
      issuerId: asset.issuerId,
      symbol: asset.symbol,
      mint: asset.mint,
      dataSha256: asset.dataSha256,
      supplyRaw: mint.supply.toString(),
      mintAuthority: mint.mintAuthority?.toBase58() ?? null,
      freezeAuthority: mint.freezeAuthority?.toBase58() ?? null,
      extensionTypes,
    };
    try {
      const profile = await inspectMintProfile(mint, clock);
      if (!profile.accountingFactorsSupported) {
        assets.push({ ...base, profileStatus: 'unsupported', unsupportedReason: 'SDK rejected the scale tuple for accounting factors' });
      } else {
        assets.push({
          ...base,
          profileStatus: 'supported',
          extensionsMask: profile.extensionsMask.toString(),
          controlsFingerprint: Buffer.from(profile.controlsFingerprint).toString('hex'),
          scale: {
            currentBits: profile.scale.currentBits.toString(),
            pendingBits: profile.scale.pendingBits.toString(),
            pendingEffectiveTimestamp: profile.scale.pendingEffectiveTimestamp.toString(),
            activeBits: profile.scale.activeBits.toString(),
          },
        });
      }
    } catch (error) {
      assets.push({ ...base, profileStatus: 'unsupported', unsupportedReason: error instanceof Error ? error.message : 'SDK profile inspection failed' });
    }
  }
  const objectSha256 = sha256(Buffer.from(JSON.stringify(snapshot)));
  return {
    schema: 'dividendx-issuer-mint-profile-verification-v1',
    verifiedAt: new Date().toISOString(),
    snapshotObjectSha256: objectSha256,
    snapshotObjectDigestEncoding: 'SHA-256 of UTF-8 JSON.stringify(snapshot) using parsed insertion order',
    snapshotFileSha256: snapshotFileSha256 ?? null,
    catalogSha256,
    contextSlot: snapshot.contextSlot,
    clock: { slot: clock.slot.toString(), unixTimestamp: clock.unixTimestamp.toString(), epoch: clock.epoch.toString() },
    assets,
    supportedAssets: assets.filter(asset => asset.profileStatus === 'supported').length,
    unsupportedAssets: assets.filter(asset => asset.profileStatus === 'unsupported').length,
    structuralCompatibilityOnly: true,
    liveCustodyTested: false,
    settlementReady: false,
    rentEpochHandling: 'RPC rentEpoch omitted because JSON numbers can be lossy; verifier uses local value 0 and does not treat it as an economic input.',
  };
}

export async function readFileBounded(path, { openImpl = open, limit = MAX_SNAPSHOT_BYTES } = {}) {
  const handle = await openImpl(path, 'r');
  try {
    const metadata = await handle.stat();
    fail(metadata.isFile() && metadata.size <= limit, 'snapshot_too_large', 'snapshot exceeds bound');
    const buffer = Buffer.alloc(limit + 1);
    let total = 0;
    while (total < buffer.byteLength) {
      const { bytesRead } = await handle.read(buffer, total, buffer.byteLength - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    fail(total <= limit, 'snapshot_too_large', 'snapshot exceeds bound');
    return buffer.subarray(0, total);
  } finally {
    await handle.close();
  }
}

export function parseCliArgs(argv) {
  fail(argv.length >= 1, 'invalid_cli', 'Usage: capture --output PATH | verify --snapshot PATH');
  const command = argv[0];
  const expected = command === 'capture' ? '--output' : command === 'verify' ? '--snapshot' : null;
  fail(expected !== null && argv.length === 3 && argv[1] === expected && typeof argv[2] === 'string' && argv[2].length > 0, 'invalid_cli', 'Usage: capture --output PATH | verify --snapshot PATH');
  return { command, path: argv[2] };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  try {
    const cli = parseCliArgs(argv);
    if (cli.command === 'capture') {
      const snapshot = await captureSnapshot(deps);
      const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
      fail(Buffer.byteLength(serialized) <= MAX_SNAPSHOT_BYTES, 'snapshot_too_large', 'snapshot exceeds bound');
      await verifySnapshot(snapshot, { ...deps, snapshotFileSha256: sha256(Buffer.from(serialized)) });
      const handle = await (deps.openImpl ?? open)(cli.path, 'wx', 0o644);
      try { await handle.writeFile(serialized); } finally { await handle.close(); }
      (deps.stdout ?? process.stdout).write(`${JSON.stringify({ ok: true, output: cli.path, assets: snapshot.assets.length, contextSlot: snapshot.contextSlot })}\n`);
      return 0;
    }
    const bytes = deps.readSnapshotImpl
      ? await deps.readSnapshotImpl(cli.path)
      : await readFileBounded(cli.path, { openImpl: deps.openImpl ?? open });
    let snapshot;
    try { snapshot = JSON.parse(bytes.toString('utf8')); } catch { throw new SnapshotError('invalid_snapshot_json', 'snapshot is not JSON'); }
    const report = await verifySnapshot(snapshot, { ...deps, snapshotFileSha256: sha256(bytes) });
    (deps.stdout ?? process.stdout).write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof SnapshotError ? error.code : 'snapshot_failed';
    (deps.stderr ?? process.stderr).write(`${JSON.stringify({ ok: false, error: code })}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
