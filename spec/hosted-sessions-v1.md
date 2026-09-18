# Hosted visitor sessions v1

18 September 2026. Extends [hosting foundation](../planning/hosting-foundation-review.md); implementation and release acceptance remain separate. Preserve the program, SDK, annual accounting, local defaults and approved designs.

## Product and routes

A hosted build (`VITE_DIVIDENDX_HOSTED=1`) serves real-calendar devnet at `/app/`, the accelerated wallet app at `/sandbox/`, and the isolated two-wallet guided journey at `/demos/`. The reference and rehearsal remain. Wallet and guided sandboxes have separate chains and keys. No cross-network asset movement is implied. An ordinary local build retains existing behavior.

Each sandbox page first reads `GET /api/sandbox/{wallet|guided}/session`. A read never creates compute. The visitor explicitly starts or resets via `POST` to the same endpoint, JSON `{action:"start"|"reset",expectedSessionId:null|string}`, same-origin `Origin`, and `X-DividendX-Session: 1`. A reset must match the latest public session ID. A concurrent duplicate start returns the already reserved session; a stale reset returns 409.

The session response is `{schemaVersion:1,kind,status,sessionId,runtimeId,expiresAt,runtimeUrl,error}`. `status` is `none|starting|ready|expired|failed`; nullable fields are null before known. `runtimeUrl` exists only when ready and is exactly `/api/sandbox/{kind}/{sessionId}`. Session IDs are 32 lowercase hex characters. `runtimeId` is the underlying runtime identity, distinct from the broker session ID. Errors contain public messages only. 202 may accompany starting; 429/503 include an honest capacity/retry message. Poll reads every two seconds while starting, with a bounded deadline and a manual retry. Never automatically repeat a start/reset on timeout.

Only session-bound paths forward traffic: wallet `GET /manifest`, `POST /faucet`, `/advance`, `/rpc`; guided `GET /state`, `/receipt`, `POST /start`, `/step`. Every read and write checks the visitor cookie, kind, session ID, expiry and ready state. A stale tab cannot reach a replacement chain. 410 marks expired/stopped sessions. An expired chain remains expired until explicit start/reset. Unknown routes, methods and origins are rejected. Every response is no-store; no CORS access is offered.

The wallet manifest keeps schema 1 and kind `surfnet`, adds `hostedSessionId` and `expiresAt`, rewrites RPC to the exact same-origin session path and omits `wsUrl`. The frontend binds session/runtime identity and rejects public-cluster genesis, wrong program/domain, other hosts or paths. It signs with a temporary in-memory sandbox wallet and confirms over bounded HTTP status/blockheight polling; no public WebSocket proxy is required. A hosted page never tells visitors to run localhost commands. Temporary wallet loss on reload and session expiry are explicit.

The guided DTO remains schema 2. Its runtime ID must match the session. The broker removes internal RPC URLs from state/receipts (replacing with a sandbox-identifying value); they are not navigation targets. Existing guarded actions and inner session/revision checks remain. Downloaded receipts clearly identify a synthetic sandbox.

## Provider isolation and expiry

One nonpersistent Vercel Sandbox per visitor and flow, starting from a reviewed code-only snapshot. Fixed port 3000 exposes an authenticated gateway; runtime and Surfpool ports remain private. Create with two vCPUs, outbound network `deny-all`, and 15-minute hard lifetime. Provisioning has a 90-second deadline. Gateway expiry and provider expiry must agree conservatively; neither refresh nor requests extend them. Snapshot contains no runtime ledger, generated keys, environment file, provider credential or devnet signer.

A 32-byte HttpOnly, Secure, SameSite=Lax, Path=/ `__Host-dxv` cookie is the visitor capability. Store only its HMAC in the ledger. A server secret derives a different 64-hex gateway bearer for every session. It never enters browser responses. The broker gets the domain only from the provider SDK and permits HTTPS `*.vercel.run`, fixed port mapping and constant endpoint paths. Do not pass provider OIDC credentials to the sandbox. Never forward browser cookies or Authorization upstream.

Use `Sandbox.get({name,resume:false})` only for existing sessions. Check provider running status and future expiry before proxying. No runCommand/readFile operation is allowed during reconnect; those SDK operations can auto-resume. Only initial creation runs the fixed gateway command once. Missing, stopped, failed or expired compute becomes a tombstone. Reset stops/deletes prior compute before releasing its active reservation; failure to verify stop retains the reservation until original hard expiry.

## Durable limits and partial failure

Use a single small private Blob JSON ledger with origin reads (`access:"private", useCache:false, headers:{"Accept-Encoding":"identity"}`) and strong ETag conditional writes. Reject missing or weak ETags; never remove a weak-tag prefix to manufacture a strong validator. Live testing found Brotli-compressed JSON returns a weak ETag that conditional PUT rejects. First create is `allowOverwrite:false`; a concurrent creation failure is reconciled by fresh read, not error-message matching. CAS conflicts retry at most five times with bounded jitter. No in-memory counter is authoritative.

Defaults: four globally active reservations (starting counts), one per visitor/flow, 15-minute lifetime, 100 starts per UTC day, six per visitor per day, 30 per observed IP per day, and a 30-second per-visitor creation cooldown. IP is HMACed and secondary, sourced only from the trusted platform connection header. The maximum ledger is 1 MiB. Expired reservations are retained as bounded tombstones for 24 hours; daily counters expire after two days. Old requests still fail when tombstones are pruned because lookup is by exact ID.

Reserve quota and a deterministic provider name before creating compute. Provisioning uncertainty remains charged and consumes an active slot until stopped or hard expiry. A retry reconciles that recorded name and never repeats create. Persist ready runtime/genesis/domain identity before forwarding a wallet transaction. Bind guided runtime ID immediately and first observed genesis thereafter. Unexpected identity change fails closed. Serverless restarts do not erase budgets or restore sessions. Transient provider errors return unavailable without creating replacement compute.

A per-session durable request budget bounds brokerage to 2,000 forwarded requests total and 240 per minute, with 120 mutations total. The gateway additionally caps bodies, response size, in-flight calls and queued writes. Public JSON-RPC accepts only reviewed standard methods with bounded parameters; administrative Surfpool methods, airdrop, subscriptions and arbitrary upstreams are absent. No retries of browser mutations after unknown completion.

The devnet faucet is a separate service and remains disabled until its own durable reservation/signed-transaction journal and bounded authority budget pass review. Neither the session broker nor a sandbox receives issuer credentials, devnet authorities or program upgrade keys.

## Acceptance

Verify independent visitor and wallet/guided chains, full annual wallet/guided transactions, exact backing, reset isolation, expiry and stale-tab behavior, public URL authentication, quota races, creation uncertainty, provider/Blob failure and restart recovery. Test production bundles on desktop/mobile, no browser/private-artifact secrets, no public admin RPC and no automatic resume. Confirm exact ELF/IDL/capture hashes. Publish only after these gates and the separate devnet service checks. Source tests alone are not hosted acceptance.

Provider contracts were checked against `@vercel/sandbox@3.3.0`, `@vercel/blob@2.8.0`, and `@vercel/functions@3.9.8`: [Sandbox SDK](https://vercel.com/docs/sandbox/sdk-reference), [private Blob and conditional writes](https://vercel.com/docs/vercel-blob/using-blob-sdk), [request headers](https://vercel.com/docs/headers/request-headers).
