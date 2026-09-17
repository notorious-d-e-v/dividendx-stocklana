import type {
  DemoStartRequest,
  DemoState,
  DemoStepRequest,
} from '../../../../packages/guided-runtime/src/contract';

export const GUIDED_RUNTIME_URL = 'http://127.0.0.1:4181';
const READ_TIMEOUT_MS = 5_000;
const MUTATION_TIMEOUT_MS = 15_000;

export class DemoHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function boundedFetch(path: string, init: RequestInit = {}, timeoutMs = READ_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await globalThis.fetch(`${GUIDED_RUNTIME_URL}${path}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The guided demo runtime did not respond in time.');
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown; message?: unknown };
    if (typeof body.error === 'string') return body.error;
    if (typeof body.message === 'string') return body.message;
  } catch {
    // The status text below remains useful when the server returned no JSON.
  }
  return response.statusText || `Request failed (${response.status}).`;
}

function assertState(value: unknown): DemoState {
  if (!value || typeof value !== 'object') throw new Error('The guided runtime returned an invalid state.');
  const state = value as Partial<DemoState>;
  const statuses = ['idle', 'preparing', 'ready', 'running', 'failed', 'complete'];
  const steps = ['split', 'create-pool', 'add-liquidity', 'buy-dr', 'remove-liquidity', 'recombine', 'settle-year', 'redeem-buyer', 'redeem-provider'];
  const validStep = (step: unknown, setup = false) => step === null || steps.includes(String(step)) || (setup && step === 'setup');
  const validTransaction = (transaction: unknown) => {
    if (!transaction || typeof transaction !== 'object') return false;
    const item = transaction as Record<string, unknown>;
    return validStep(item.step, true) && typeof item.name === 'string' && typeof item.signature === 'string'
      && ['submitted', 'confirmed', 'finalized'].includes(String(item.status))
      && (item.slot === null || typeof item.slot === 'number');
  };
  const validWallet = (wallet: unknown) => {
    if (!wallet || typeof wallet !== 'object') return false;
    const item = wallet as Record<string, unknown>;
    return typeof item.address === 'string' && ['stockRaw', 'ptRaw', 'drRaw', 'quoteRaw', 'lpRaw'].every((key) => typeof item[key] === 'string' && /^\d+$/.test(item[key] as string));
  };
  const snapshot = state.snapshot as unknown;
  const validSnapshot = snapshot === null || (() => {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const item = snapshot as Record<string, unknown>;
    const mints = item.mints as Record<string, unknown> | null;
    const pool = item.pool as Record<string, unknown> | null;
    const swap = item.swap as Record<string, unknown> | null;
    const validPool = pool === null || (Boolean(pool) && typeof pool?.address === 'string' && ['drRaw', 'quoteRaw', 'lockedLpRaw'].every((key) => typeof pool?.[key] === 'string' && /^\d+$/.test(pool[key] as string)));
    const validSwap = swap === null || (Boolean(swap) && ['inputQuoteRaw', 'outputDrRaw', 'minimumDrRaw'].every((key) => typeof swap?.[key] === 'string' && /^\d+$/.test(swap[key] as string)));
    return validWallet(item.provider) && validWallet(item.buyer)
      && ['observedAt', 'unixTimestamp', 'genesisHash', 'rpcUrl', 'dividendXProgram', 'raydiumProgram', 'series'].every((key) => typeof item[key] === 'string')
      && ['stockMultiplierBits', 'vaultRaw', 'ptSupplyRaw', 'drSupplyRaw'].every((key) => typeof item[key] === 'string' && /^\d+$/.test(item[key] as string))
      && ['slot', 'eventCount', 'stockDecimals', 'quoteDecimals', 'lpDecimals'].every((key) => Number.isSafeInteger(item[key]) && Number(item[key]) >= 0)
      && item.year === 2027 && ['open', 'sealing', 'finalized'].includes(String(item.phase)) && typeof item.backingVerified === 'boolean'
      && Boolean(mints) && ['stock', 'pt', 'dr', 'quote'].every((key) => typeof mints?.[key] === 'string')
      && (mints?.lp === null || typeof mints?.lp === 'string') && validPool && validSwap;
  })();
  if (state.schemaVersion !== 1 || typeof state.runtimeId !== 'string' || typeof state.revision !== 'number'
    || !statuses.includes(String(state.status)) || !validStep(state.activeStep, true) || !validStep(state.nextStep)
    || !Array.isArray(state.completedSteps) || !state.completedSteps.every((step) => validStep(step) && step !== null)
    || !Array.isArray(state.transactions) || !state.transactions.every(validTransaction) || !validSnapshot
    || !(state.sessionId === null || typeof state.sessionId === 'string') || !(state.error === null || typeof state.error === 'string')) {
    throw new Error('The guided runtime returned an unsupported state.');
  }
  return value as DemoState;
}

export async function readDemoState(): Promise<DemoState> {
  const response = await boundedFetch('/state');
  if (!response.ok) throw new DemoHttpError(await errorMessage(response), response.status);
  return assertState(await response.json());
}

async function mutate(path: '/start' | '/step', body: DemoStartRequest | DemoStepRequest): Promise<void> {
  const response = await boundedFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-DividendX-Demo': '1' },
    body: JSON.stringify(body),
  }, MUTATION_TIMEOUT_MS);
  if (!response.ok) throw new DemoHttpError(await errorMessage(response), response.status);
  if (response.status !== 202) throw new DemoHttpError('The guided runtime did not accept the action.', response.status);
}

export function startDemo(body: DemoStartRequest): Promise<void> {
  return mutate('/start', body);
}

export function runDemoStep(body: DemoStepRequest): Promise<void> {
  return mutate('/step', body);
}

export async function readDemoReceipt(): Promise<unknown> {
  const response = await boundedFetch('/receipt');
  if (!response.ok) throw new DemoHttpError(await errorMessage(response), response.status);
  return response.json();
}
