import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CLOCK_ADDRESS,
  COMMITMENT,
  ENDPOINT,
  MAINNET_GENESIS_HASH,
  MAX_SNAPSHOT_BYTES,
  SnapshotError,
  captureSnapshot,
  main,
  parseCliArgs,
  readFileBounded,
  rpc,
  verifySnapshot,
} from './issuer-mint-snapshot.mjs';

const FIXTURE = new URL('../../tests/protocol/fixtures/issuer-mints-2026-09-18.json', import.meta.url);
const fixtureBytes = await readFile(FIXTURE);
const fixture = JSON.parse(fixtureBytes);
const clone = () => structuredClone(fixture);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixtureRpcFetch(calls = []) {
  const values = [...fixture.assets, fixture.clock].map(account => ({
    lamports: account.lamports,
    executable: account.executable,
    owner: account.owner ?? account.tokenProgram,
    rentEpoch: 2 ** 60,
    data: [Buffer.from(account.dataHex, 'hex').toString('base64'), 'base64'],
  }));
  return async (url, init) => {
    const request = JSON.parse(init.body);
    calls.push({ url, init, request });
    const result = request.method === 'getGenesisHash'
      ? MAINNET_GENESIS_HASH
      : { context: { slot: fixture.contextSlot }, value: values };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), { status: 200 });
  };
}

test('verifies the immutable snapshot, ordered identities, raw hashes, Clock, and SDK profiles', async () => {
  assert.equal(MAINNET_GENESIS_HASH, '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
  const report = await verifySnapshot(fixture, { snapshotFileSha256: digest(fixtureBytes) });
  assert.equal(report.contextSlot, fixture.contextSlot);
  assert.equal(report.clock.slot, String(fixture.contextSlot));
  assert.equal(report.snapshotFileSha256, '5f75decb014072a82708ff76319df5dee15646460f8006461ba4786978fed7ac');
  assert.equal(report.assets.length, 15);
  assert.equal(report.supportedAssets, 15);
  assert.equal(report.unsupportedAssets, 0);
  assert(report.assets.every(asset => asset.dataSha256 && asset.controlsFingerprint && asset.scale));
});

test('rejects capture timestamps that precede either ordered RPC response', async () => {
  const value = clone();
  value.requests[0].retrievedAt = '2026-09-17T23:30:52.000Z';
  await assert.rejects(verifySnapshot(value), error => error.code === 'invalid_timestamps');
});

test('rejects schema additions, identity reordering, digest changes, and partial snapshots', async () => {
  const cases = [
    value => { value.extra = true; },
    value => { [value.assets[0], value.assets[1]] = [value.assets[1], value.assets[0]]; },
    value => { value.assets[0].dataSha256 = '0'.repeat(64); },
    value => { value.assets.pop(); },
  ];
  for (const mutate of cases) {
    const value = clone();
    mutate(value);
    await assert.rejects(verifySnapshot(value), SnapshotError);
  }
});

test('reports a TLV-framed disallowed extension as explicitly unsupported', async () => {
  const value = clone();
  const data = Buffer.from(value.assets[0].dataHex, 'hex');
  assert.equal(data[165], 1, 'expected Token-2022 mint account type');
  data.writeUInt16LE(1, 166); // TransferFeeConfig: valid TLV framing, outside the accepted SDK policy.
  value.assets[0].dataHex = data.toString('hex');
  value.assets[0].dataSha256 = digest(data);
  const report = await verifySnapshot(value);
  assert.equal(report.assets[0].profileStatus, 'unsupported');
  assert.match(report.assets[0].unsupportedReason, /unsupported collateral mint extension 1/);
  assert.equal(report.assets.length, 15);
});

test('capture uses only the fixed endpoint and exact two read-only RPC methods', async () => {
  const calls = [];
  const snapshot = await captureSnapshot({ fetchImpl: fixtureRpcFetch(calls), now: () => fixture.capturedAt });
  assert.deepEqual(calls.map(call => call.request.method), ['getGenesisHash', 'getMultipleAccounts']);
  assert.deepEqual(calls[0].request.params, []);
  assert.deepEqual(calls[1].request.params[1], { commitment: COMMITMENT, encoding: 'base64' });
  assert.equal(calls[1].request.params[0].length, 16);
  assert.equal(calls[1].request.params[0].at(-1), CLOCK_ADDRESS);
  assert(calls.every(call => call.url === ENDPOINT && call.init.method === 'POST' && call.init.redirect === 'error'));
  assert.equal((await verifySnapshot(snapshot)).supportedAssets, 15);
});

test('capture output is exclusive and never overwrites existing evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'issuer-exclusive-test-'));
  const path = join(directory, 'snapshot.json');
  await writeFile(path, 'preserve-me');
  let stderr = '';
  const code = await main(['capture', '--output', path], {
    fetchImpl: fixtureRpcFetch(),
    now: () => fixture.capturedAt,
    stdout: { write: () => {} },
    stderr: { write: chunk => { stderr += chunk; } },
  });
  assert.equal(code, 1);
  assert.equal(await readFile(path, 'utf8'), 'preserve-me');
  assert.equal(JSON.parse(stderr).error, 'snapshot_failed');
});

test('rejects unapproved RPC methods before any network call and rejects partial RPC data', async () => {
  let calls = 0;
  await assert.rejects(
    rpc('sendTransaction', [], { fetchImpl: async () => { calls += 1; } }),
    error => error.code === 'rpc_method_refused',
  );
  assert.equal(calls, 0);

  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body);
    const result = request.method === 'getGenesisHash'
      ? MAINNET_GENESIS_HASH
      : { context: { slot: fixture.contextSlot }, value: Array(16).fill(null) };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
  };
  await assert.rejects(captureSnapshot({ fetchImpl }), error => error.code === 'invalid_rpc_account');
});

test('network failure cannot open or create a partial success artifact', async () => {
  let opened = false;
  let stderr = '';
  const code = await main(['capture', '--output', 'must-not-exist.json'], {
    fetchImpl: async () => { throw new Error('offline'); },
    openImpl: async () => { opened = true; throw new Error('unexpected'); },
    stderr: { write: chunk => { stderr += chunk; } },
  });
  assert.equal(code, 1);
  assert.equal(opened, false);
  assert.deepEqual(JSON.parse(stderr), { ok: false, error: 'rpc_failed' });
});

test('CLI rejects unknown forms, returns nonzero for invalid input, and writes no report', async () => {
  assert.throws(() => parseCliArgs(['capture', '--rpc', 'https://evil.example']), /invalid_cli/);
  assert.throws(() => parseCliArgs(['verify', '--snapshot', 'x', '--output', 'y']), /invalid_cli/);
  let stderr = '';
  let stdout = '';
  const code = await main(['verify', '--snapshot', 'ignored'], {
    readSnapshotImpl: async () => Buffer.from('{'),
    stderr: { write: chunk => { stderr += chunk; } },
    stdout: { write: chunk => { stdout += chunk; } },
  });
  assert.equal(code, 1);
  assert.equal(stdout, '');
  assert.equal(JSON.parse(stderr).error, 'invalid_snapshot_json');
});

test('bounded file reader refuses oversized input at the file handle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'issuer-snapshot-test-'));
  const path = join(directory, 'oversized.json');
  await writeFile(path, Buffer.alloc(MAX_SNAPSHOT_BYTES + 1));
  await assert.rejects(readFileBounded(path), error => error.code === 'snapshot_too_large');
});
