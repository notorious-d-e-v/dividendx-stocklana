import assert from 'node:assert/strict';
import test from 'node:test';
import { measuredFinalizationComputeBudget } from '../src/transactions.js';

test('finalization compute budget is derived from an explicit measurement', () => {
  const budget = measuredFinalizationComputeBudget('accumulate', 200_001, { marginBasisPoints: 1_000 });
  assert.equal(budget.requestedUnits, 220_002);
  assert.equal(budget.instructions.length, 1);
  assert.throws(() => measuredFinalizationComputeBudget('complete', 1_400_000), /exceeds/);
});
