import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { GuidedDemoRuntime } from '../src/runtime.js';
import { DEMO_STEPS, type PublicReceipt } from '../src/internal.js';
import { DEMO_ASSETS, type DemoState } from '../src/contract.js';

const runtime = new GuidedDemoRuntime();
const asset = DEMO_ASSETS.find((entry) => entry.id === (process.argv[2] ?? 'xstocks-test-kox'));
if (!asset) throw new Error('unknown test stock profile');
function state(): DemoState { return runtime.publicState(); }

async function waitFor(predicate: (value: DemoState) => boolean, timeoutMs = 120_000): Promise<DemoState> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = state();
    if (value.status === 'failed') throw new Error(`guided runtime failed: ${value.error}`);
    if (predicate(value)) return value;
    if (Date.now() >= deadline) throw new Error('guided runtime smoke timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

let exitCode = 1;
try {
  let current = state();
  await runtime.beginStart(current.runtimeId, current.revision, asset.id);
  current = await waitFor((value) => value.status === 'ready' && value.nextStep === 'core-split');
  const unit = 10n ** BigInt(asset.decimals);
  const raw = (units: number) => (BigInt(units) * unit).toString();
  if (current.asset?.id !== asset.id || current.snapshot?.provider.stockRaw !== raw(100)
    || current.snapshot?.provider.ptRaw !== '0' || current.snapshot?.provider.drRaw !== '0') throw new Error('setup mint checkpoint failed');
  await assert.rejects(runtime.beginStep(current.runtimeId, current.sessionId!, current.revision, 'dividend-quarter-one'),
    /only the exact next step is accepted/);
  for (const step of DEMO_STEPS) {
    const previous = current;
    await runtime.beginStep(current.runtimeId, current.sessionId!, current.revision, step);
    current = await waitFor((value) => value.completedSteps.includes(step) && (value.status === 'ready' || value.status === 'complete'));
    if (BigInt(current.snapshot!.unixTimestamp) < BigInt(previous.snapshot!.unixTimestamp))
      throw new Error(`${step} moved chain time backwards`);
    if ((step === 'core-split' || step === 'dividend-split') && (current.snapshot?.provider.stockRaw !== '0'
      || current.snapshot?.provider.ptRaw !== raw(100) || current.snapshot?.provider.drRaw !== raw(100)
      || current.snapshot?.vaultRaw !== raw(100))) throw new Error(`${step} exact split failed`);
    if ((step === 'core-recombine-partial' || step === 'dividend-recombine') && (current.snapshot?.provider.stockRaw !== raw(40)
      || current.snapshot?.provider.ptRaw !== raw(60) || current.snapshot?.provider.drRaw !== raw(60)
      || current.snapshot?.vaultRaw !== raw(60))) throw new Error(`${step} exact recombination failed`);
    if (step === 'core-recombine-rest' && (current.snapshot?.provider.stockRaw !== raw(100)
      || current.snapshot?.provider.ptRaw !== '0' || current.snapshot?.provider.drRaw !== '0' || current.snapshot?.vaultRaw !== '0'))
      throw new Error('complete recombination failed');
    if (step === 'dividend-quarter-one' || step === 'dividend-quarter-two') {
      const expectedCount = step === 'dividend-quarter-one' ? 1 : 2;
      const multiplier = step === 'dividend-quarter-one' ? 1.01 : 1.02;
      const bits = new ArrayBuffer(8); new DataView(bits).setFloat64(0, multiplier, true);
      if (current.snapshot?.eventCount !== expectedCount || current.snapshot.stockMultiplierBits !== new DataView(bits).getBigUint64(0, true).toString()
        || current.snapshot.provider.ptRaw !== raw(100) || current.snapshot.provider.drRaw !== raw(100)
        || current.snapshot.vaultRaw !== raw(100)
        || BigInt(current.snapshot.unixTimestamp) < BigInt(Date.UTC(2027, expectedCount === 1 ? 2 : 5, 15, 12) / 1_000))
        throw new Error(`${step} dividend checkpoint failed`);
    }
    if (step === 'dividend-recombine' && current.snapshot?.eventCount !== 2) throw new Error('dividend journal was lost');
    if (step === 'create-pool' && (current.snapshot?.pool?.drRaw !== raw(24) || current.snapshot.pool.quoteRaw !== '4000000'
      || current.snapshot.provider.drRaw !== raw(36))) throw new Error('seed liquidity amounts failed');
    if (step === 'add-liquidity') {
      const seeded = runtime.publicReceipt()!.checkpoints.find((checkpoint) => checkpoint.step === 'create-pool')!.snapshot;
      const preLp = BigInt(seeded.provider.lpRaw) + BigInt(seeded.pool!.lockedLpRaw);
      const mintedLp = BigInt(current.snapshot!.provider.lpRaw) - BigInt(seeded.provider.lpRaw);
      const ceilDiv = (numerator: bigint, denominator: bigint) => (numerator + denominator - 1n) / denominator;
      const exactDr = ceilDiv(mintedLp * BigInt(seeded.pool!.drRaw), preLp);
      const exactQuote = ceilDiv(mintedLp * BigInt(seeded.pool!.quoteRaw), preLp);
      const dust = BigInt(current.snapshot!.provider.drRaw);
      if (BigInt(current.snapshot!.pool!.drRaw) !== BigInt(seeded.pool!.drRaw) + exactDr
        || BigInt(current.snapshot!.pool!.quoteRaw) !== BigInt(seeded.pool!.quoteRaw) + exactQuote
        || exactQuote !== 6_000_000n || dust !== BigInt(raw(36)) - exactDr
        || dust >= ceilDiv(BigInt(seeded.pool!.drRaw), preLp)
        || BigInt(current.snapshot!.pool!.drRaw) + dust !== BigInt(raw(60)))
        throw new Error('added liquidity amounts failed');
    }
    if (step === 'settle-year' && (current.snapshot?.eventCount !== 4 || current.snapshot.phase !== 'finalized'))
      throw new Error('annual settlement checkpoint failed');
    if (step === 'dividend-split') await assert.rejects(runtime.beginStep(previous.runtimeId, previous.sessionId!, previous.revision, step),
      /stale runtime, session, or revision/);
  }
  const receipt = runtime.publicReceipt() as PublicReceipt | null;
  if (!receipt) throw new Error('receipt is unavailable');
  if (current.status !== 'complete' || current.completedSteps.length !== DEMO_STEPS.length || !current.snapshot?.backingVerified
    || current.schemaVersion !== 4 || current.snapshot.asset.id !== asset.id
    || current.snapshot.stockDecimals !== asset.decimals || current.snapshot.claimDecimals !== asset.decimals
    || current.snapshot.quoteAsset.symbol !== 'USDC'
    || current.snapshot.quoteAsset.canonicalMint !== '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    || receipt.schemaVersion !== 4 || receipt.asset.id !== asset.id
    || receipt.checkpoints.length !== DEMO_STEPS.length + 1
    || receipt.checkpoints[0]?.step !== 'setup'
    || BigInt(receipt.checkpoints.find((checkpoint) => checkpoint.step === 'dividend-split')?.snapshot.unixTimestamp ?? '0')
      >= BigInt(Date.UTC(2027, 0, 1) / 1_000)
    || receipt.transactions.filter(({ name }) => name.startsWith('record_synthetic_dividend_q1')).length !== 1
    || receipt.transactions.filter(({ name }) => name.startsWith('record_synthetic_dividend_q2')).length !== 1
    || receipt.transactions.some(({ step, name }) => name.startsWith('deposit_') && step !== 'core-split' && step !== 'dividend-split')
    || !receipt.transactions.some(({ step, name, status }) => step === 'setup' && name === 'mint_100_selected_test_stock' && status !== 'submitted')
    || receipt.capture.circleUsdc.dataSha256 !== '3c8a2c7c49c355902bf2b2cb4b5bded7772a7971bb7e8168b0873d2f9d2b42b6'
    || receipt.localFunding.totalRaw !== '11000000' || receipt.localFunding.publicFaucetTransfer
    || BigInt(current.snapshot.pool?.drRaw ?? '0') <= 0n || BigInt(current.snapshot.vaultRaw) <= 0n
    || current.snapshot.provider.ptRaw !== '0' || current.snapshot.provider.drRaw !== '0'
    || current.snapshot.buyer.drRaw !== '0' || receipt.transactions.some(({ status }) => status === 'submitted')) {
    throw new Error('guided runtime final invariant failed');
  }
  const evidence = { ok: true, assetId: asset.id, runtimeId: current.runtimeId, sessionId: current.sessionId,
    revision: current.revision, transactions: receipt.transactions.length, finalSnapshot: current.snapshot,
    evidenceFile: `.local-tools/guided-runtime/${current.sessionId}.json` };
  if (process.env.GUIDED_SMOKE_OUTPUT) await writeFile(process.env.GUIDED_SMOKE_OUTPUT, `${JSON.stringify({ ...evidence, receipt }, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  exitCode = 0;
} finally {
  runtime.stop();
  // Raydium's SDK may leave a reconnecting websocket handle on the shared Connection.
  // This one-shot verifier has already shut down its owned server and Surfnet.
  setTimeout(() => process.exit(exitCode), 25);
}
