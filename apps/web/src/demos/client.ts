import { DEMO_ASSETS, type DemoAsset, type DemoSnapshot, type DemoStartRequest,
  DemoState,
  DemoStepRequest,
} from '../../../../packages/guided-runtime/src/contract';

export const GUIDED_RUNTIME_URL = 'http://127.0.0.1:4181';
export const CIRCLE_DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const READ_TIMEOUT_MS = 5_000;
const MUTATION_TIMEOUT_MS = 15_000;

export class DemoHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface GuidedClient {
  runtimeUrl: string;
  hosted: boolean;
  expectedRuntimeId?: string;
  readState: () => Promise<DemoState>;
  start: (body: DemoStartRequest) => Promise<void>;
  runStep: (body: DemoStepRequest) => Promise<void>;
  readReceipt: () => Promise<unknown>;
}

async function boundedFetch(runtimeUrl: string, path: string, init: RequestInit = {}, timeoutMs = READ_TIMEOUT_MS, onExpired?: (message?: string) => void): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await globalThis.fetch(`${runtimeUrl}${path}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...init.headers },
    });
    if (response.status === 410) onExpired?.('This guided sandbox expired or was replaced. Its action controls were cleared.');
    return response;
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

export function assertState(value: unknown, expectedRuntimeId?: string): DemoState {
  if (!value || typeof value !== 'object') throw new Error('The guided runtime returned an invalid state.');
  if ((value as Record<string, unknown>).schemaVersion !== 4) {
    throw new Error('This page requires guided runtime v4 with sample quarterly dividends. Update and restart npm run demo:guided.');
  }
  const state = value as Partial<DemoState>;
  const statuses = ['idle', 'preparing', 'ready', 'running', 'failed', 'complete'];
  const steps = ['core-split', 'core-recombine-partial', 'core-recombine-rest', 'dividend-split', 'dividend-quarter-one', 'dividend-quarter-two', 'dividend-recombine', 'create-pool', 'add-liquidity', 'buy-dr', 'remove-liquidity', 'recombine', 'settle-year', 'redeem-buyer', 'redeem-provider'];
  const validAsset = (value: unknown): value is DemoAsset => {
    if (!value || typeof value !== 'object') return false;
    const asset = value as Record<string, unknown>;
    return Object.values(DEMO_ASSETS).some((profile) => profile.id === asset.id && profile.company === asset.company
      && profile.symbol === asset.symbol && profile.issuerLabel === asset.issuerLabel && profile.decimals === asset.decimals);
  };
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
    const quoteAsset = item.quoteAsset as Record<string, unknown> | null;
    const pool = item.pool as Record<string, unknown> | null;
    const swap = item.swap as Record<string, unknown> | null;
    const validPool = pool === null || (Boolean(pool) && typeof pool?.address === 'string' && ['drRaw', 'quoteRaw', 'lockedLpRaw'].every((key) => typeof pool?.[key] === 'string' && /^\d+$/.test(pool[key] as string)));
    const validSwap = swap === null || (Boolean(swap) && ['inputQuoteRaw', 'outputDrRaw', 'minimumDrRaw'].every((key) => typeof swap?.[key] === 'string' && /^\d+$/.test(swap[key] as string)));
    return validAsset(item.asset) && validWallet(item.provider) && validWallet(item.buyer)
      && ['observedAt', 'unixTimestamp', 'genesisHash', 'rpcUrl', 'dividendXProgram', 'raydiumProgram', 'series'].every((key) => typeof item[key] === 'string')
      && ['stockMultiplierBits', 'vaultRaw', 'ptSupplyRaw', 'drSupplyRaw'].every((key) => typeof item[key] === 'string' && /^\d+$/.test(item[key] as string))
      && ['slot', 'eventCount', 'stockDecimals', 'claimDecimals', 'quoteDecimals', 'lpDecimals'].every((key) => Number.isSafeInteger(item[key]) && Number(item[key]) >= 0)
      && item.stockDecimals === (item.asset as DemoAsset).decimals && item.claimDecimals === (item.asset as DemoAsset).decimals
      && item.year === 2027 && ['open', 'sealing', 'finalized'].includes(String(item.phase)) && typeof item.backingVerified === 'boolean'
      && Boolean(mints) && ['stock', 'pt', 'dr', 'quote'].every((key) => typeof mints?.[key] === 'string')
      && (mints?.lp === null || typeof mints?.lp === 'string')
      && item.quoteDecimals === 6 && Boolean(quoteAsset) && quoteAsset?.symbol === 'USDC'
      && quoteAsset?.provenance === 'local-circle-devnet-clone' && quoteAsset?.canonicalMint === CIRCLE_DEVNET_USDC_MINT
      && mints?.quote === CIRCLE_DEVNET_USDC_MINT && validPool && validSwap;
  })();
  if (state.schemaVersion !== 4 || typeof state.runtimeId !== 'string' || typeof state.revision !== 'number'
    || !statuses.includes(String(state.status)) || !validStep(state.activeStep, true) || !validStep(state.nextStep)
    || !Array.isArray(state.completedSteps) || !state.completedSteps.every((step) => validStep(step) && step !== null)
    || !Array.isArray(state.transactions) || !state.transactions.every(validTransaction) || !validSnapshot
    || !(state.asset === null || validAsset(state.asset)) || (snapshot !== null && state.asset?.id !== (snapshot as DemoSnapshot).asset.id)
    || !(state.sessionId === null || typeof state.sessionId === 'string') || !(state.error === null || typeof state.error === 'string')) {
    throw new Error('The guided runtime returned an unsupported state.');
  }
  if (expectedRuntimeId && state.runtimeId !== expectedRuntimeId) throw new Error('The guided runtime ID does not match this hosted session.');
  return value as DemoState;
}

export function createGuidedClient(runtimeUrl = GUIDED_RUNTIME_URL, options: { expectedRuntimeId?: string; onExpired?: (message?: string) => void; hosted?: boolean } = {}): GuidedClient {
  const base = runtimeUrl.replace(/\/$/, '');
  const request = (path: string, init?: RequestInit, timeoutMs?: number) => boundedFetch(base, path, init, timeoutMs, options.onExpired);
  const mutate = async (path: '/start' | '/step', body: DemoStartRequest | DemoStepRequest): Promise<void> => {
    const response = await request(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DividendX-Demo': '1' }, body: JSON.stringify(body),
    }, MUTATION_TIMEOUT_MS);
    if (!response.ok) throw new DemoHttpError(await errorMessage(response), response.status);
    if (response.status !== 202) throw new DemoHttpError('The guided runtime did not accept the action.', response.status);
  };
  return {
    runtimeUrl: base,
    hosted: options.hosted === true,
    expectedRuntimeId: options.expectedRuntimeId,
    readState: async () => {
      const response = await request('/state');
      if (!response.ok) throw new DemoHttpError(await errorMessage(response), response.status);
      return assertState(await response.json(), options.expectedRuntimeId);
    },
    start: (body) => mutate('/start', body),
    runStep: (body) => mutate('/step', body),
    readReceipt: async () => {
      const response = await request('/receipt');
      if (!response.ok) throw new DemoHttpError(await errorMessage(response), response.status);
      const receipt = await response.json() as unknown;
      if (!receipt || typeof receipt !== 'object' || (receipt as Record<string, unknown>).schemaVersion !== 4) throw new Error('The guided runtime returned an unsupported Test USDC receipt.');
      return receipt;
    },
  };
}

const defaultClient = createGuidedClient();
export const readDemoState = defaultClient.readState;
export const startDemo = defaultClient.start;
export const runDemoStep = defaultClient.runStep;
export const readDemoReceipt = defaultClient.readReceipt;
