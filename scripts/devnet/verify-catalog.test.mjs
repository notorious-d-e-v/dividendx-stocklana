import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROFILES } from '../../packages/devnet-runtime/dist/src/constants.js';
import { assertExactCatalog, verifyPhase } from './verify-catalog.mjs';

test('requires each of the 15 named devnet profiles exactly once', () => {
  const assets = PROFILES.map((profile) => ({ ...profile }));
  assert.doesNotThrow(() => assertExactCatalog(assets));
  assert.throws(() => assertExactCatalog(assets.slice(1)), /CATALOG_REQUIRES_15_ASSETS/);
  assert.throws(() => assertExactCatalog([...assets.slice(0, -1), assets[0]]), /CATALOG_ID_MISMATCH/);
  assert.throws(() => assertExactCatalog([...assets.slice(0, -1), { ...assets.at(-1), id: 'unknown' }]),
    /CATALOG_ID_MISMATCH/);
});

test('requires exact minted, deposited and recombined holder and vault deltas', () => {
  const base = { collateral: '0', pt: '0', dr: '0', vault: '700', accountable: '700' };
  const amount = 100_000_000n;
  assert.doesNotThrow(() => verifyPhase('minted', base,
    { collateral: amount, pt: 0n, dr: 0n, vault: 700n, accountable: 700n }, amount));
  assert.doesNotThrow(() => verifyPhase('deposited', base,
    { collateral: 0n, pt: amount, dr: amount, vault: 700n + amount, accountable: 700n + amount }, amount));
  assert.doesNotThrow(() => verifyPhase('recombined', base,
    { collateral: amount, pt: 0n, dr: 0n, vault: 700n, accountable: 700n }, amount));
  assert.throws(() => verifyPhase('deposited', base,
    { collateral: 0n, pt: amount, dr: amount - 1n, vault: 700n + amount, accountable: 700n + amount }, amount),
  /CONSERVATION_FAILED/);
  assert.throws(() => verifyPhase('recombined', base,
    { collateral: amount, pt: 0n, dr: 0n, vault: 701n, accountable: 700n }, amount),
  /CONSERVATION_FAILED/);
});
