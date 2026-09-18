export class DevnetRuntimeError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = 'DevnetRuntimeError';
  }
}

export function invariant(condition: unknown, code: string, message = code): asserts condition {
  if (!condition) throw new DevnetRuntimeError(code, message);
}

export function safeError(error: unknown): { code: string; detail: string } {
  const code = error instanceof DevnetRuntimeError ? error.code : error instanceof TypeError && error.message === 'fetch failed'
    ? 'RPC_UNAVAILABLE' : 'DEVNET_RUNTIME_FAILED';
  const detail = (error instanceof Error ? error.message : 'unknown failure')
    .replaceAll(/https?:\/\/[^\s]+/g, '[rpc]')
    .replaceAll(/\/(?:Users|private|tmp)\/[^\s"']+/g, '[local-path]')
    .slice(0, 1_000);
  return { code, detail };
}
