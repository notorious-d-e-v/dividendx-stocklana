import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import anchorCore, { type IdlInstructionAccountItem } from '@anchor-lang/core';
import { PublicKey } from '@solana/web3.js';
import { DIVIDENDX_IDL } from '../src/idl.js';
import { RawInstructionBuilder } from '../src/instructions.js';
import vectors from '../test-vectors/instructions.json' with { type: 'json' };

const { convertIdlToCamelCase } = anchorCore;

test('SDK IDL and Rust conformance vectors are byte-identical to their canonical artifacts', async () => {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const pairs = [
    ['idl/dividendx.json', '../../programs/dividendx/idl/dividendx.json'],
    ['test-vectors/instructions.json', '../../tests/protocol/fixtures/sdk-instructions.json'],
  ];
  for (const [local, canonical] of pairs) {
    assert.deepEqual(
      await readFile(resolve(packageRoot, local!)),
      await readFile(resolve(packageRoot, canonical!)),
      `stale artifact ${local}; run npm --prefix packages/transaction-sdk run vectors`,
    );
  }
});

test('checked-in SBF vectors remain byte/account-meta aligned with the generated IDL', () => {
  const idl = convertIdlToCamelCase(DIVIDENDX_IDL);
  const raw = new RawInstructionBuilder(DIVIDENDX_IDL);
  assert.equal(vectors.length, 13);
  for (const vector of vectors) {
    const name = vector.name.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    const definition = idl.instructions.find((instruction) => instruction.name === name);
    assert.ok(definition, `missing generated instruction ${name}`);
    assert.equal(vector.programId, idl.address);
    const data = Buffer.from(vector.dataHex, 'hex');
    assert.deepEqual(Array.from(data.subarray(0, 8)), definition.discriminator);
    assert.equal(raw.coder.decode(data)?.name, name);
    assert.equal(vector.accounts.length, definition.accounts.length);
    for (const [index, actual] of vector.accounts.entries()) {
      const expectedAccount: IdlInstructionAccountItem = definition.accounts[index]!;
      assert.ok(!('accounts' in expectedAccount));
      if ('accounts' in expectedAccount) continue;
      assert.doesNotThrow(() => new PublicKey(actual.pubkey));
      assert.equal(actual.isSigner, expectedAccount.signer ?? false);
      assert.equal(actual.isWritable, expectedAccount.writable ?? false);
      if (expectedAccount.address) assert.equal(actual.pubkey, expectedAccount.address);
    }
  }
});
