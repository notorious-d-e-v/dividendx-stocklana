import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

test('runtime pins the verified Surfpool, ELF and IDL artifacts', async () => {
  const packageJson = JSON.parse(await readFile(resolve(root, 'packages/local-runtime/package.json'), 'utf8'));
  const evidence = JSON.parse(await readFile(resolve(root, 'packages/local-runtime/evidence/surfpool-probe-2026-09-17.json'), 'utf8'));
  assert.equal(packageJson.dependencies['@solana/surfpool'], '1.5.0');
  assert.equal(packageJson.dependencies['@solana/web3.js'], '1.98.4');
  assert.equal(packageJson.dependencies['@solana/spl-token'], '0.4.14');
  assert.equal(await sha256(resolve(root, 'target/deploy/dividendx.so')), evidence.elf.sha256);
  assert.equal(await sha256(resolve(root, 'packages/transaction-sdk/idl/dividendx.json')), evidence.idlSha256);
  assert.equal((await readFile(resolve(root, 'target/deploy/dividendx.so'))).length, evidence.elf.bytes);
});
