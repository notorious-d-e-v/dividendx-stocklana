# Hosted sandbox gateway

This dependency-free Node 24 process is the only public listener inside one disposable sandbox VM. It starts one existing runtime child, keeps the runtime HTTP/RPC ports on loopback, and exposes a small authenticated JSON surface on `0.0.0.0:3000`.

## Runtime contract

Set exactly these gateway values when provisioning a VM:

- `DIVIDENDX_SANDBOX_KIND`: `wallet` or `guided`.
- `DIVIDENDX_GATEWAY_TOKEN`: a fresh 64-character lowercase hexadecimal bearer token.
- `DIVIDENDX_SESSION_EXPIRES_AT`: an ISO UTC timestamp in the future, no more than 20 minutes from gateway startup.

Run `node packages/hosted-gateway/src/main.mjs` from the repository root (or `npm start` from this package). The process starts exactly one child from the repository root:

- wallet: `node packages/local-runtime/src/server.mjs`
- guided: `node packages/guided-runtime/dist/src/server.js`

The image must build the guided entry at that reviewed path before startup. The child receives only `PATH`, `NODE_ENV`, `TZ`, and `LD_LIBRARY_PATH`; gateway/session values and provider credentials are not inherited. Child output is drained and never copied to the public process log.

Every request, including `GET /health`, requires `Authorization: Bearer <gateway token>`. There is no CORS or redirect surface. Routes are exact:

| Kind | Read routes | Mutation routes |
| --- | --- | --- |
| wallet | `GET /health`, `GET /manifest`, `POST /rpc` for read methods | `POST /faucet`, `POST /advance`, `POST /rpc` with `sendTransaction` |
| guided | `GET /health`, `GET /state`, `GET /receipt` | `POST /start`, `POST /step` |

`/health` returns `kind`, `ready`, the discovered `runtimeId`, and `expiresAt`. Startup failure, child exit, or identity drift is permanent. Expiry terminates the child and listener. The gateway never restarts a child. Guided `/start` can be attempted only once during a gateway lifetime, including when its outcome is ambiguous.

Wallet discovery accepts only a fresh non-public genesis with the pinned DividendX program, a 32-byte deployment domain, and a credential-free `http://127.0.0.1:<numeric-port>/` RPC URL. It verifies the RPC genesis and executable program before readiness. Guided discovery treats the initial idle state without a genesis as valid, then pins the genesis, derived deployment domain, RPC URL, and program when setup first exposes a snapshot. Any later mismatch permanently disables the gateway.

The RPC policy rejects batches, notifications, unknown envelope/config fields, non-base64 account encodings, admin/Surfpool/airdrop/program-scan methods, transaction payloads above Solana's 1,232-byte packet bound, and account/signature lists above 32. Permitted methods are `getGenesisHash`, `getAccountInfo`, `getMultipleAccounts`, `getLatestBlockhash`, `getSignatureStatuses`, `getBlockHeight`, `getBalance`, `getMinimumBalanceForRentExemption`, `getFeeForMessage`, `sendTransaction`, `simulateTransaction`, `getSlot`, and `getVersion`.

Limits are 32 KiB for public RPC bodies, 4 KiB for writes to runtime HTTP routes, 2 MiB for upstream responses, 15 seconds per upstream request, eight concurrent upstream requests, and four admitted serialized mutations. These values cover the app's 32-account coherent reads and Solana packet-size transactions while bounding memory and native runtime pressure.

## Broker boundary

The gateway token is server-to-server only. The broker authenticates the browser separately, assigns an immutable public `sessionId` to one visitor and one flow, and routes only that session path to its VM. Before returning ready, the broker pins `/health` plus the wallet manifest identity or guided state identity. For wallet sessions it rewrites `rpcUrl` to the same-origin immutable broker path and removes `wsUrl`; the loopback URLs never reach the browser. A stopped or expired session remains expired, and a new VM receives a new `sessionId` and gateway token.

The sandbox contains no provider, admin, issuer, devnet signer, or faucet-quota secrets. Provider creation can take up to 15 minutes, but the gateway's own session lifetime remains capped at 20 minutes from process startup.

Run `npm test` in this directory. Tests use injected children and loopback-free fake upstreams, covering isolated instances, authentication, route/RPC policy, fixed forwarding headers, body/response/concurrency bounds, expiry, child exit, one-time guided start, and stale identities.
