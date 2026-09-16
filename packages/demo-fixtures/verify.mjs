import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const catalog = read('packages/demo-fixtures/catalog.json');
const events = read('packages/demo-fixtures/events.json');
const manifest = read('packages/demo-fixtures/manifest.json');
const source = read('planning/evidence/initial-asset-package-2026-09-16.json');

assert.equal(catalog.length, 15);
assert.equal(new Set(catalog.map(asset => asset.mint)).size, 15);
assert.equal(events.length, 2);
for (const [issuer, count] of Object.entries({ xstocks: 6, backpack: 3, ondo: 6 })) {
  assert.equal(catalog.filter(asset => asset.issuerId === issuer).length, count);
}
for (const asset of catalog) {
  const group = source.observations[asset.issuerId === 'backpack' ? 'backpackTrek' : asset.issuerId];
  const original = group.assets.find(record => record.mint === asset.mint);
  assert(original, asset.id);
  assert.equal(original.symbol, asset.symbol);
  assert.equal(asset.decimals, group.profile.decimals);
  assert.equal(asset.effectiveMultiplier, original.effectiveMultiplierAtSnapshot ?? original.activeMultiplierAtSnapshot);
  assert(!asset.capabilities.custodyTested && !asset.capabilities.executionTested && !asset.capabilities.liveEnabled);
}
for (const event of events) {
  assert(catalog.some(asset => asset.id === event.assetId && asset.eventFixtureId === event.id));
  assert.equal(event.finality, 'trusted_frozen_replay');
  const evidence = manifest.primaryEventEvidence.find(item => item.eventId === event.id);
  assert.equal(event.sourceDigest, evidence.sha256);
}
for (const file of [...manifest.fixtureFiles, ...manifest.primaryEventEvidence, ...manifest.supportingEvidence]) {
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, file.path))).digest('hex'), file.sha256, file.path);
}
const mu = events.find(event => event.id === 'backpack-mu-2026-07-23');
assert.equal(mu.m1, '1.000106726714702');
assert.notEqual(mu.m1, catalog.find(asset => asset.id === mu.assetId).effectiveMultiplier);
assert.equal(mu.referencePriceUsd, null);
console.log('Fixture checks passed: 15 exact assets, two sourced events, evidence hashes and observation-only capabilities.');
