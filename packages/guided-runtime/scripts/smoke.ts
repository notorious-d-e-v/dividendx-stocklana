import { GuidedDemoRuntime } from '../src/runtime.js';
import { DEMO_STEPS, type PublicReceipt } from '../src/internal.js';
import type { DemoState } from '../src/contract.js';

const runtime = new GuidedDemoRuntime();
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
  await runtime.beginStart(current.runtimeId, current.revision);
  current = await waitFor((value) => value.status === 'ready' && value.nextStep === 'split');
  for (const step of DEMO_STEPS) {
    await runtime.beginStep(current.runtimeId, current.sessionId!, current.revision, step);
    current = await waitFor((value) => value.completedSteps.includes(step) && (value.status === 'ready' || value.status === 'complete'));
  }
  const receipt = runtime.publicReceipt() as PublicReceipt | null;
  if (!receipt) throw new Error('receipt is unavailable');
  if (current.status !== 'complete' || current.completedSteps.length !== DEMO_STEPS.length || !current.snapshot?.backingVerified
    || current.schemaVersion !== 2 || current.snapshot.quoteAsset.symbol !== 'USDC'
    || current.snapshot.quoteAsset.canonicalMint !== '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    || receipt.schemaVersion !== 2 || receipt.capture.circleUsdc.dataSha256 !== '3c8a2c7c49c355902bf2b2cb4b5bded7772a7971bb7e8168b0873d2f9d2b42b6'
    || receipt.localFunding.totalRaw !== '11000000' || receipt.localFunding.publicFaucetTransfer
    || BigInt(current.snapshot.pool?.drRaw ?? '0') <= 0n || BigInt(current.snapshot.vaultRaw) <= 0n
    || current.snapshot.provider.ptRaw !== '0' || current.snapshot.provider.drRaw !== '0'
    || current.snapshot.buyer.drRaw !== '0' || receipt.transactions.some(({ status }) => status === 'submitted')) {
    throw new Error('guided runtime final invariant failed');
  }
  process.stdout.write(`${JSON.stringify({ ok: true, runtimeId: current.runtimeId, sessionId: current.sessionId,
    revision: current.revision, transactions: receipt.transactions.length, finalSnapshot: current.snapshot,
    evidenceFile: `.local-tools/guided-runtime/${current.sessionId}.json` }, null, 2)}\n`);
  exitCode = 0;
} finally {
  runtime.stop();
  // Raydium's SDK may leave a reconnecting websocket handle on the shared Connection.
  // This one-shot verifier has already shut down its owned server and Surfnet.
  setTimeout(() => process.exit(exitCode), 25);
}
