import { createHash } from "node:crypto";
import { ReaderError, fail, safeCode } from "./schema.js";
import type { RequestObservation } from "./types.js";

export const PUBLIC_TIMEOUT_MS = 15_000;
export const PUBLIC_MAX_BYTES = 2 * 1024 * 1024;

async function readBody(response: Response, maxBytes: number): Promise<Buffer> {
  const length = response.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) fail("response_too_large");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        fail("response_too_large");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof ReaderError) throw error;
    fail("response_read_failed");
  }
  return Buffer.concat(chunks, size);
}

export async function observePublicJson(url: URL, options: {
  allowedOrigin: string;
  allowedPath: (url: URL) => boolean;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  now?: () => Date;
}): Promise<{ request: RequestObservation; value: unknown | null }> {
  if (url.protocol !== "https:" || url.origin !== options.allowedOrigin || url.username || url.password || url.hash || !options.allowedPath(url)) {
    fail("endpoint_not_allowed");
  }
  const now = options.now ?? (() => new Date());
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    const work = (async () => {
      let response: Response;
      try {
        response = await (options.fetchImpl ?? globalThis.fetch)(url, {
          method: "GET", headers: { accept: "application/json" }, redirect: "error", signal: controller.signal,
        });
      } catch {
        throw new ReaderError(controller.signal.aborted ? "request_timed_out" : "request_failed");
      }
      if (response.redirected) fail("redirect_refused");
      if (response.url && response.url !== url.href) fail("unexpected_response_url");
      const bytes = await readBody(response, options.maxBytes ?? PUBLIC_MAX_BYTES);
      const request: RequestObservation = {
        endpoint: `${url.pathname}${url.search}`, retrievedAt: now().toISOString(), status: response.status,
        dataDigest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, error: response.ok ? null : "http_status",
      };
      if (!response.ok) return { request, value: null };
      try { return { request, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown }; }
      catch { return { request: { ...request, error: "malformed_json" }, value: null }; }
    })();
    const deadline = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => { controller.abort(); reject(new ReaderError("request_timed_out")); }, options.timeoutMs ?? PUBLIC_TIMEOUT_MS);
    });
    return await Promise.race([work, deadline]);
  } catch (error) {
    if (error instanceof ReaderError) throw error;
    throw new ReaderError(safeCode(error));
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function failedRequest(endpoint: string, error: unknown, now = () => new Date()): RequestObservation {
  return { endpoint, retrievedAt: now().toISOString(), status: null, dataDigest: null, error: safeCode(error) };
}

export function stopCode(request: RequestObservation): string | null {
  if (request.status === 401 || request.status === 403) return "issuer_authentication_failed";
  if (request.status === 429) return "issuer_rate_limited";
  return null;
}
