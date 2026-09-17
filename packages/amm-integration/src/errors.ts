export class AmmIntegrationError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = 'AmmIntegrationError';
  }
}

export function invariant(condition: unknown, code: string, message = code): asserts condition {
  if (!condition) throw new AmmIntegrationError(code, message);
}

export function safeErrorCode(error: unknown): string {
  if (error instanceof TypeError && error.message === 'fetch failed') return 'rpc_unavailable';
  return error instanceof AmmIntegrationError ? error.code : 'amm_integration_failed';
}

export function safeErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown failure';
  const message = error.message
    .replaceAll(/https?:\/\/[^\s]+/g, '[rpc]')
    .replaceAll(/\/(?:Users|private|tmp)\/[^\s"']+/g, '[local-path]');
  return message.slice(0, 1_000) || error.name;
}
