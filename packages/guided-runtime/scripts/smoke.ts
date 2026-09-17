import { startGuidedServer } from '../src/server.js';
import { DEMO_STEPS, type PublicReceipt } from '../src/internal.js';
import type { DemoState } from '../src/contract.js';

const URL = 'http://127.0.0.1:4181';
const headers = { 'content-type': 'application/json', 'x-dividendx-demo': '1', origin: 'http://127.0.0.1:4174' };

async function state(): Promise<DemoState> {
  const response = await fetch(`${URL}/state`, { headers: { origin: headers.origin }, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`state request failed: ${response.status}`);
  return response.json() as Promise<DemoState>;
}

async function mutate(path: '/start' | '/step', value: unknown): Promise<void> {
  const response = await fetch(`${URL}${path}`, { method: 'POST', headers, body: JSON.stringify(value), signal: AbortSignal.timeout(5_000) });
  if (response.status !== 202) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
}

async function waitFor(predicate: (value: DemoState) => boolean, timeoutMs = 120_000): Promise<DemoState> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await state();
    if (value.status === 'failed') throw new Error(`guided runtime failed: ${value.error}`);
    if (predicate(value)) return value;
    if (Date.now() >= deadline) throw new Error('guided runtime smoke timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const server = await startGuidedServer();
let exitCode = 1;
try {
  let current = await state();
  await mutate('/start', { runtimeId: current.runtimeId, expectedRevision: current.revision });
  current = await waitFor((value) => value.status === 'ready' && value.nextStep === 'split');
  for (const step of DEMO_STEPS) {
    await mutate('/step', { runtimeId: current.runtimeId, sessionId: current.sessionId, expectedRevision: current.revision, step });
    current = await waitFor((value) => value.completedSteps.includes(step) && (value.status === 'ready' || value.status === 'complete'));
  }
  const receiptResponse = await fetch(`${URL}/receipt`, { headers: { origin: headers.origin }, signal: AbortSignal.timeout(5_000) });
  if (!receiptResponse.ok) throw new Error(`receipt request failed: ${receiptResponse.status}`);
  const receipt = await receiptResponse.json() as PublicReceipt;
  if (current.status !== 'complete' || current.completedSteps.length !== DEMO_STEPS.length || !current.snapshot?.backingVerified
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
  await server.close();
  // Raydium's SDK may leave a reconnecting websocket handle on the shared Connection.
  // This one-shot verifier has already shut down its owned server and Surfnet.
  setTimeout(() => process.exit(exitCode), 25);
}
