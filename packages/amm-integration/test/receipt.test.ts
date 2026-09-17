import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('checked-in local receipt proves the bounded lifecycle and conservation', async () => {
  const path = resolve(dirname(fileURLToPath(import.meta.url)), '../../evidence/local-captured-raydium-receipt-2026-09-17.json');
  const receipt = JSON.parse(await readFile(path, 'utf8')) as any;
  assert.equal(receipt.boundary, 'local-captured-devnet-bytecode');
  assert.equal(receipt.transactions.length, 14);
  assert.ok(receipt.transactions.every((entry: any) => entry.confirmationStatus === 'confirmed' || entry.confirmationStatus === 'finalized'));
  assert.deepEqual(receipt.transactions.slice(-5).map((entry: any) => entry.name), [
    'create_cpmm_pool', 'add_cpmm_liquidity', 'buyer_swap_quote_for_dr',
    'withdraw_all_provider_lp', 'recombine_recovered_dr_with_pt',
  ]);
  assert.equal(receipt.exactSwap.creatorFeeRaw, '0');
  assert.equal(receipt.exactSwap.actualDrOutputRaw, receipt.exactSwap.quotedDrOutputRaw);
  assert.ok(BigInt(receipt.exactSwap.actualDrOutputRaw) >= BigInt(receipt.exactSwap.minimumDrOutputRaw));
  const withdrawn = receipt.checkpoints.withdrawn;
  assert.equal(withdrawn.lp.provider, '0');
  assert.equal(withdrawn.lp.mintSupply, '0');
  assert.equal(withdrawn.lp.internalPoolLpAmount, '100');
  const final = receipt.checkpoints.recombined;
  assert.equal(final.pt.supply, final.dr.supply);
  assert.equal(final.pt.supply, final.collateral.vault);
  assert.equal(BigInt(final.dr.buyer) + BigInt(final.dr.poolVault), BigInt(final.dr.supply));
  assert.equal(BigInt(final.testQuote.provider) + BigInt(final.testQuote.buyer) + BigInt(final.testQuote.poolVault),
    BigInt(final.testQuote.supply));
  assert.equal(receipt.captureProvenance.capturedLoaderPayloadSha256,
    '87ef84634086209fc2c29b4163bbe5209a1e9383aff5c429781f5fff270d75fd');
});
