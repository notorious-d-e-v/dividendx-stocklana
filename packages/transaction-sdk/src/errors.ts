export type DividendXSdkErrorCode =
  | 'INVALID_AMOUNT'
  | 'INVALID_CLOCK'
  | 'INVALID_DIGEST'
  | 'INVALID_F64_BITS'
  | 'INVALID_IDENTITY'
  | 'INVALID_PUBLIC_KEY'
  | 'INVALID_QUOTE'
  | 'INVALID_SERIES'
  | 'IDL_MISMATCH'
  | 'RPC_ACCOUNT_MISSING'
  | 'RPC_ACCOUNT_OWNER'
  | 'TRANSACTION_FAILED';

export class DividendXSdkError extends Error {
  readonly code: DividendXSdkErrorCode;

  constructor(code: DividendXSdkErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DividendXSdkError';
    this.code = code;
  }
}

export function invariant(
  condition: unknown,
  code: DividendXSdkErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new DividendXSdkError(code, message);
}
