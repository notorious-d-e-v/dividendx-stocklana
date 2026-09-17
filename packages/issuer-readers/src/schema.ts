export class ReaderError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ReaderError";
  }
}

export function fail(code: string): never { throw new ReaderError(code); }
export function safeCode(error: unknown): string { return error instanceof ReaderError ? error.code : "reader_failed"; }

export function object(value: unknown, code = "malformed_schema"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}
export function array(value: unknown, code = "malformed_schema"): unknown[] {
  if (!Array.isArray(value)) fail(code);
  return value;
}
export function string(value: unknown, code = "malformed_schema"): string {
  if (typeof value !== "string") fail(code);
  return value;
}
export function bool(value: unknown, code = "malformed_schema"): boolean {
  if (typeof value !== "boolean") fail(code);
  return value;
}
export function integer(value: unknown, code = "malformed_schema"): number {
  if (!Number.isSafeInteger(value)) fail(code);
  return value as number;
}
export function timestamp(value: unknown, code = "malformed_timestamp"): string {
  const result = string(value, code);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) fail(code);
  return result;
}
export function unixMillis(value: unknown, code = "malformed_timestamp"): number {
  const result = integer(value, code);
  if (result < 0) fail(code);
  return result;
}
export function exactDecimal(value: unknown, options: { positive?: boolean; maxFraction?: number } = {}): string {
  if (typeof value !== "string") fail("numeric_factor_not_exact_string");
  const max = options.maxFraction ?? 1000;
  const match = value.match(/^(?:0|[1-9]\d*)(?:\.(\d+))?$/);
  if (!match || (match[1]?.length ?? 0) > max) fail("invalid_decimal_string");
  if (options.positive && /^0(?:\.0+)?$/.test(value)) fail("invalid_decimal_string");
  return value;
}
export function civilDate(value: unknown): string {
  const result = string(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) fail("malformed_civil_date");
  const date = new Date(`${result}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== result) fail("malformed_civil_date");
  return result;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
