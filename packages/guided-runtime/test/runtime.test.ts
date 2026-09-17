import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import { DEMO_STEPS } from '../src/internal.js';
import { GuidedDemoRuntime } from '../src/runtime.js';

const ROOT = resolve(import.meta.dirname, '../../../..');

test('frozen action order contains every guided mutation exactly once', () => {
  assert.deepEqual(DEMO_STEPS, [
    'split', 'create-pool', 'add-liquidity', 'buy-dr', 'remove-liquidity',
    'recombine', 'settle-year', 'redeem-buyer', 'redeem-provider',
  ]);
  assert.equal(new Set(DEMO_STEPS).size, DEMO_STEPS.length);
});

test('captured Raydium program and account fixtures match pinned hashes', async () => {
  const directory = resolve(ROOT, 'packages/amm-integration/fixtures/raydium-devnet-2026-09-17');
  const fixture = JSON.parse(await readFile(resolve(directory, 'capture.json'), 'utf8'));
  const program = await readFile(resolve(directory, fixture.program.file));
  assert.equal(program.length, 742_640);
  assert.equal(createHash('sha256').update(program).digest('hex'), fixture.program.sha256);
  for (const account of fixture.accounts) {
    const data = Buffer.from(account.data, 'base64');
    assert.equal(data.length, account.space);
    assert.equal(createHash('sha256').update(data).digest('hex'), account.dataSha256);
  }
});

test('captured Circle devnet USDC mint is exact and discloses local funding boundary', async () => {
  const fixture = JSON.parse(await readFile(resolve(ROOT,
    'packages/guided-runtime/fixtures/circle-devnet-usdc-2026-09-17.json'), 'utf8'));
  const data = Buffer.from(fixture.data, 'base64');
  assert.equal(fixture.sourceGenesisHash, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  assert.equal(fixture.sourceSlot, 499_830_485);
  assert.equal(fixture.mint, '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  assert.equal(fixture.owner, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  assert.equal(fixture.decimals, 6);
  assert.equal(data.length, 82);
  assert.equal(createHash('sha256').update(data).digest('hex'),
    '3c8a2c7c49c355902bf2b2cb4b5bded7772a7971bb7e8168b0873d2f9d2b42b6');
  assert.match(fixture.boundary, /synthetic local funding/);
});

test('idle runtime rejects stale and out-of-order mutations without creating a chain', async () => {
  const runtime = new GuidedDemoRuntime();
  const initial = runtime.publicState();
  assert.equal(initial.schemaVersion, 2);
  await assert.rejects(runtime.beginStart('wrong-runtime', initial.revision), /stale runtime or revision/);
  await assert.rejects(runtime.beginStep(initial.runtimeId, 'missing', initial.revision, 'split'), /stale runtime, session, or revision/);
  assert.deepEqual(runtime.publicState(), initial);
});
