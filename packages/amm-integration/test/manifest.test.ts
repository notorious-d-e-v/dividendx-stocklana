import assert from 'node:assert/strict';
import test from 'node:test';
import type { Connection } from '@solana/web3.js';
import {
  DEVNET_GENESIS_HASH, DEVNET_RPC_URL, DIVIDENDX_ELF_SHA256, RAYDIUM_CAPTURED_ELF_SHA256,
} from '../src/constants.js';
import { verifyExecutionEnvironment } from '../src/guards.js';
import { parseManifest } from '../src/manifest.js';

const base = {
  schema: 'dividendx-raydium-cpmm-v1', mode: 'devnet', rpcUrl: DEVNET_RPC_URL,
  expectedGenesisHash: DEVNET_GENESIS_HASH,
  expectedDividendXUpgradeAuthority: 'DpbSCimwNNWMcREiJ7npkWuDVywWgHHekZGx6K9TeRsv',
  deploymentDomainHex: Buffer.alloc(32, 1).toString('hex'), expectedDividendXElfSha256: DIVIDENDX_ELF_SHA256,
  expectedRaydiumElfSha256: RAYDIUM_CAPTURED_ELF_SHA256, maxCreatePoolFeeLamports: '250000000',
  maxRunSpendLamports: '1500000000', expectedYear: 2027,
};

test('public manifest is fixed to official devnet and accepted hashes', () => {
  assert.equal(parseManifest(base).mode, 'devnet');
  assert.throws(() => parseManifest({ ...base, rpcUrl: 'https://evil.invalid' }));
  assert.throws(() => parseManifest({ ...base, expectedDividendXElfSha256: '00'.repeat(32) }));
});

test('local manifests accept only explicit loopback harness ports', () => {
  assert.equal(parseManifest({ ...base, mode: 'local-clone', rpcUrl: 'http://127.0.0.1:18899/', expectedGenesisHash: 'local' }).mode, 'local-clone');
  assert.throws(() => parseManifest({ ...base, mode: 'local-clone', rpcUrl: 'http://localhost:18899/', expectedGenesisHash: 'local' }));
});

test('local execution rejects the canonical mainnet genesis before account reads', async () => {
  const mainnetGenesisHash = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  const manifest = parseManifest({
    ...base,
    mode: 'local-clone',
    rpcUrl: 'http://127.0.0.1:18899/',
    expectedGenesisHash: mainnetGenesisHash,
  });
  let accountReads = 0;
  const connection = {
    async getGenesisHash() { return mainnetGenesisHash; },
    async getMultipleAccountsInfoAndContext() {
      accountReads += 1;
      throw new Error('account reads must not occur');
    },
  } as unknown as Connection;

  await assert.rejects(verifyExecutionEnvironment(connection, manifest), /LOCAL_MODE_PUBLIC_CLUSTER/);
  assert.equal(accountReads, 0);
});
