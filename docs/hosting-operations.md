# Hosting operations

This runbook covers the canonical production site at [divx.payai.network](https://divx.payai.network), Vercel project `payai/dividendx-stocklana`. Use the custom domain in public links. The legacy `https://dividendx.payai.network` and original `https://dividendx-stocklana.vercel.app` addresses remain supported during migration. All three exact HTTPS origins are allowed in production. New links, canonical metadata and social-card URLs use `https://divx.payai.network`. No redirect or decommission is enabled yet. Visitor cookies and sandbox sessions are hostname-specific, so start a new session when switching domains. Deployment IDs are release evidence, not stable configuration; resolve the current and known-good deployments when operating.

The governing boundaries are the [hosting release review](../planning/hosting-release-review.md), [hosted-session specification](../spec/hosted-sessions-v1.md), and [hosted-devnet specification](../spec/hosted-devnet-services-v1.md).

Production `/` and `/demos/` serve [guided tour v4](../planning/guided-tour-v4-review.md) with its matching schema-4 Sandbox snapshot. The [20 September wallet/navigation release](../planning/wallet-release-2026-09-20.md) records current acceptance and rollback details; the [v4 release review](../planning/guided-tour-v4-release.md) preserves the runtime snapshot's original acceptance. Visible navigation is Public Devnet / Guided Demos; the wallet sandbox and legacy previews remain available by direct link.

The [21 September guided entry change](../planning/guided-lazy-entry-review-2026-09-21.md) shows the hero and company selector before creating a private network. Start guided tour starts it while scrolling to Part One; Get 100 starts it and continues the selected company. Status and recovery appear beneath the hero. Opening the page or selecting a company does not reserve a VM. Existing ready sessions resume; expiry requires an explicit new start.

## Production surfaces

| Route | Network and lifetime | Operational boundary |
| --- | --- | --- |
| `/app/` | Persistent Solana devnet, real calendar, frozen 2027 registry | Browser-signed transactions and finite public test funding. No clock control or shortened term. |
| `/sandbox/` | One isolated wallet VM per visitor, 15-minute hard lifetime | Accelerated synthetic chain and temporary in-memory browser wallet. Reload loses the wallet key. |
| `/demos/` | A separate isolated guided VM per visitor, 15-minute hard lifetime | Two server-managed test wallets and the fixed guided Raydium/Test USDC journey. |

Sandbox and guided chains never share state with each other or devnet. Expiry alone leaves the existing session expired. A reset, or an explicit new start after expiry, receives a new public session ID, gateway bearer, runtime identity, chain, and keys. The broker does not silently resume or recreate a chain after an uncertain failure.

Installed-wallet-extension acceptance remains unproven. Production browser acceptance used temporary wallets. Hosted test profiles and synthetic observations do not establish qualified issuer assets or settlement.

## Capacity and funding

The session broker durably enforces:

- 16 active VM reservations globally, with starting sessions counted;
- 500 starts per UTC day globally, six per visitor, and 30 per observed IP;
- a 30-second visitor creation cooldown and 90-second provisioning deadline;
- 2,000 forwarded requests per session, 240 per minute, and 120 mutations total.

Capacity errors are honest 429/503 responses. Do not bypass the ledger, automatically repeat a start/reset with an unknown result, or delete reservations to free capacity. A session reservation expires naturally after 15 minutes; tombstones remain for bounded reconciliation.

These caps are shared by the wallet and guided sandboxes, and are separate from static page traffic. The [21 September capacity audit](../planning/research/guided-launch-capacity-2026-09-21.md) records the original four-active/100-daily profile. The user approved 500 daily starts targeting approximately $50/day. The [launch metering contract](../spec/guided-launch-metering.md) separates new sessions' counters into private per-session Blob records, retaining global admission and lifecycle checks. Ordinary GETs no longer rewrite the shared admission ledger. Old sessions retain their original global counters until expiry. The admission ledger has a bounded 3 MiB size allowance for overlapping tombstones.

This is not unlimited access or a hard billing ceiling. Full-ledger reads, Functions, Blob transfer and other team usage still cost money. Meter records do not have automatic storage deletion when their VMs expire; future retention cleanup must be a separate scoped operation. Use the linked release evidence for measured startup/concurrency results rather than treating a provider quota as a tested application capacity.

The public devnet faucet grants exactly ten units for one configured synthetic asset and may top a recipient up to 0.006 test SOL. It allows one grant per wallet/asset/UTC day, three per visitor/day, 12 per IP/day, and 30 globally/day. Reservations are capped at 0.27 SOL/day and 1 SOL for the service lifetime. The allowance and faucet balance are finite. There is no automatic replenishment; any new endowment or budget increase requires a separate reviewed operation. A pending or ambiguous operation reuses its persisted signature and signed bytes.

The Vercel cron runs `/api/cron/refresh-observations` every six hours. It refreshes the 15 frozen synthetic profiles, with a separate 0.01 test-SOL lifetime fee budget and a 300-second function limit. Validation checks the selected profile before preparation and again before submission; signature persistence and the 45-second send lease remain unchanged. At 15 profiles per six-hour bucket, the 10,000-lamport reservations consume 600,000 lamports of that budget per day (at most 16⅔ days from an unused budget). Exhaustion fails closed; increasing the budget requires a separate decision. It is not an issuer event writer, dividend classifier, annual-journal finalizer, mint authority change, or clock controller. Do not create a second scheduler, local watcher, or task automation for it.

## Pinned artifacts

The server deployment and Sandbox image are separate release artifacts:

- [`packages/devnet-runtime/manifest.devnet.json`](../packages/devnet-runtime/manifest.devnet.json) is the frozen public devnet registry used by `/app/`.
- The [accepted v2 runtime snapshot manifest](../planning/evidence/hosted-runtime-snapshot-2026-09-18.json) records the previous production code-only Linux/Node 24 snapshot, exact source hashes, accepted program ELF, IDL, and captured test fixtures.
- The current [v4 snapshot manifest](../planning/evidence/hosted-runtime-snapshot-v4-2026-09-19.json) records production snapshot `snap_mtdgtBAGmcNu8Ucj1M9kCARBKYvq` and its allowlisted source hashes. Its [Linux](../planning/evidence/linux-runtime-v4-2026-09-19-r2.json) and [provider isolation](../planning/evidence/hosted-provider-probe-v4-2026-09-19.json) proofs pass. The v4 site and snapshot were released together under [release acceptance](../planning/guided-tour-v4-release.md).
- [`scripts/hosting/stage-linux-runtime.sh`](../scripts/hosting/stage-linux-runtime.sh) creates an allowlisted context and rejects environment files, keypairs, local tools, Git data, and dependencies.
- [`.vercelignore`](../.vercelignore) excludes local environment, signer, evidence, runtime-state, dependency, and build directories from the server deployment.

Never turn a visitor filesystem into a snapshot. A snapshot update requires a new allowlisted build, hash manifest, Linux probe, provider isolation proof, and configuration review. Do not edit an accepted snapshot or manifest in place.

## Server configuration

Keep the following in the Vercel project’s encrypted server environment. Never put values in source, browser bundles, screenshots, receipts, shell history, or logs.

| Name | Location and purpose |
| --- | --- |
| `DIVIDENDX_SESSION_SECRET` | Server Functions only; derives visitor, IP, provider-name, and per-session gateway HMACs. |
| `DIVIDENDX_SANDBOX_SNAPSHOT_ID` | Server Functions only; selects the reviewed code-only Sandbox snapshot. |
| `DIVIDENDX_SITE_ORIGIN` | Server Functions only; exact allowed HTTPS origin list. |
| `BLOB_STORE_ID` | Project connection for the private session and devnet CAS ledgers. |
| `BLOB_READ_WRITE_TOKEN` | Auto-provisioned by the current private Blob project connection for production and preview. |
| `VERCEL_OIDC_TOKEN` | Vercel request context or local linked-environment fallback used by the Blob/Sandbox SDKs. Do not pass it into a Sandbox. |
| `DIVIDENDX_FAUCET_SECRET_KEY_BASE64` | Server Functions only; exact dedicated synthetic-mint faucet authority. |
| `DIVIDENDX_TEST_ATTESTOR_SECRET_KEY_BASE64` | Server Functions only; distinct synthetic-observation authority. |
| `CRON_SECRET` | Vercel cron-to-Function bearer for the refresh endpoint. |

The current production configuration supports the Blob connection's read/write token together with `BLOB_STORE_ID` and the SDK's OIDC path. Do not remove the auto-created token on the assumption that the connection is OIDC-only. Local linked values may live in the ignored repository-root `.env.local`; never commit or copy that file into a worktree, runtime context, or evidence directory.

The browser authenticates with the opaque `__Host-dxv` cookie. Server Functions authenticate separately to Vercel services. Each Sandbox receives only `DIVIDENDX_SANDBOX_KIND`, a derived `DIVIDENDX_GATEWAY_TOKEN`, and `DIVIDENDX_SESSION_EXPIRES_AT`; the gateway child does not inherit them. The cron bearer is separate again. No provider credential, program admin/default-wallet signer, issuer credential, Ondo key, or devnet authority belongs in a Sandbox or frontend bundle.

## Local release checks

Vercel CLI 56.5.0 was checked locally with Node 24. Its installed help exposes `deploy --dry`, `inspect`, `rollback`, `logs`, and `crons list`. Recheck the installed CLI before each release:

```sh
vercel --version
vercel deploy --help
vercel rollback --help
vercel logs --help
```

Run source checks from the repository root. These do not need a public deployment:

```sh
npm test
npm run typecheck
npm --prefix packages/hosted-gateway test
npm --prefix packages/hosted-broker test
npm --prefix packages/hosted-devnet test
npm --prefix packages/guided-runtime test
npm run test:browser
```

The release build deliberately empties `apps/web/dist`. Validate it in a disposable checkout so the approved local preview is not overwritten. This sequence tests committed `HEAD`; first confirm it is the intended release candidate.

```sh
release_root=$(mktemp -d /tmp/dividendx-release.XXXXXX)
release_checkout="$release_root/checkout"
git worktree add --detach "$release_checkout" HEAD
cd "$release_checkout"
npm ci --ignore-scripts
sh scripts/hosting/build-site.sh
cd -
git worktree remove "$release_checkout"
rmdir "$release_root"
```

Normal `git worktree remove` was verified with ignored `node_modules` and `apps/web/dist` content; it removed the disposable checkout without `--force`. If removal refuses because other files exist, stop and inspect them. Never add `--force` to this procedure.

Inspect deployment inputs without uploading or creating a deployment:

```sh
vercel deploy --dry --format=json --scope payai
```

Confirm that no `.env*`, keypair, `.local-tools`, evidence, user ledger, or existing `dist` file is listed. A successful build or dry run is not hosted acceptance.

## Deploy and verify

The existing project is connected to the GitHub repository. Pushes to the production branch publish automatically; use branches and reviewed merges for subsequent code changes. Git deployment updates the site and Functions, but does not rebuild the Sandbox snapshot or deploy the Solana program. Origin-environment changes require a new deployment to take effect.

1. Review `git status --short`, the candidate revision, lockfile changes, frozen registry, runtime snapshot manifest, and `vercel.json`. For v4, require the new snapshot's Linux probe and provider isolation proof before selecting it. Confirm the canonical project link names `payai/dividendx-stocklana`, and record the current known-good production deployment and snapshot ID for rollback.
2. Check configuration names without copying their values: `vercel env list production --scope payai`. Run the local checks and dry run above.
3. A preview deployment can prove build completion, static files, and read-only behavior:

   ```sh
   vercel deploy --target=preview --skip-domain --scope payai --yes
   vercel inspect <preview-url> --wait --timeout 3m --scope payai
   vercel inspect <preview-url> --logs --scope payai
   ```

   Production `DIVIDENDX_SITE_ORIGIN` contains exactly `https://divx.payai.network,https://dividendx.payai.network,https://dividendx-stocklana.vercel.app`. A browser on an immutable preview hostname therefore receives 403 for session/faucet mutations, so do not call that a full smoke test or promote it on that basis. Full preview testing requires a separately reviewed preview origin and complete preview configuration; never add a temporary preview hostname to the production origin list.
4. With the production-origin configuration, release to production and save the returned deployment URL:

   ```sh
   vercel deploy --prod --scope payai --yes
   vercel inspect <production-deployment-url> --wait --timeout 3m --scope payai
   ```

5. Immediately check the canonical pages, `GET /api/devnet/manifest`, session status GETs, and production errors. Run the opt-in [hosted browser smoke driver](hosted-browser-smoke.md) against the canonical HTTPS origin with a new absolute output path. It creates real VMs, consumes quotas, and may send devnet transactions; never repeat a timed-out mutation automatically. Preserve successful and failed run records rather than overwriting them. If a required check fails, use the recorded known-good rollback target.
6. Review desktop/mobile captures, distinct wallet/guided identities, expiry/reset behavior, devnet signatures, and independent finality. Installed-extension behavior remains outside acceptance unless separately tested. Confirm the configured cron rather than manually invoking it:

   ```sh
   vercel crons list --scope payai
   vercel logs --environment production --no-branch --level error --since 1h --scope payai
   ```

Do not place bearer tokens on command lines or invoke the cron merely as a health check. A deliberate cron run must be treated as a synthetic authority transaction and reconciled by its durable signatures.

## Rollback

List and inspect deployments to choose a reviewed known-good target; do not rely on a deployment ID copied into this document.

```sh
vercel ls dividendx-stocklana --environment production --scope payai
vercel inspect <known-good-url-or-id> --format=json --scope payai
vercel rollback <known-good-url-or-id> --scope payai --yes
vercel rollback status dividendx-stocklana --scope payai
```

After rollback, repeat the canonical read-only checks and inspect errors. Treat sessions with uncertain provider state as unavailable until normal reconciliation or hard expiry.

Rollback changes the served deployment. It does **not** undo Solana devnet transactions, signatures, faucet spending, observation refreshes, Blob counters, reservations, signed-operation journals, or already running/expired Sandbox state. Do not delete shared Blob objects, snapshots, deployments, or Sandboxes as part of rollback. If durable data or a credential is involved, stop and perform a separate reviewed recovery.

After the 21 September metering release, keep the meter-aware backend when reverting the frontend. A pre-meter backend ignores new per-session counters: drain all v1 sessions for at least 15 minutes and verify none remain before rolling back that backend. Prefer a reviewed frontend revert deployed with the current broker.

## Incident signals

Functions emit bounded diagnostics only:

- `hosted-broker-unexpected` contains a safe error class and optional fixed code, commonly from Blob, provider, or configuration failures.
- `hosted-devnet-unexpected` contains the request scope and a safe class/code.
- `devnet-rpc-failure` contains only a stable code such as `RPC_HTTP_<status>`, `RPC_NETWORK`, `RPC_TIMEOUT`, `RPC_QUEUE_FULL`, or `RPC_BACKOFF_INVALID`.

Blob errors use fixed `BLOB_*`, ETag, oversize, or busy codes. The gateway drains child output instead of copying it to public logs. RPC boundaries discard non-success response bodies. These application diagnostic records intentionally contain no raw request/response payloads, upstream URLs, headers, signed bytes, cookies, bearers, environment values, signer material, or stacks.

For 202/pending results, reconcile the recorded signature; never create a replacement transaction. For 429, respect `Retry-After` and do not retry a mutation. For 503, inspect the fixed event/code and the durable record before taking action. For an expired session, require an explicit new start and keep the stale session ID unusable.

Use bounded historical log queries rather than a permanent watcher:

```sh
vercel logs --environment production --no-branch --since 1h --level error --json --scope payai
```

Do not paste unreviewed log output into tickets or evidence. Preserve only sanitized operational facts and public transaction signatures.

## Retiring the legacy domain later

When separately requested, add a permanent host redirect from `dividendx.payai.network` to `divx.payai.network`, preserving path and query. Host-only visitor cookies and active sandbox sessions cannot migrate across the hostname, so communicate that visitors start a fresh session on the new domain. Verify nested routes and social cards before enabling the redirect, and retain the old DNS and TLS configuration while it forwards traffic. Remove the old mutation origin only when it no longer serves sessions. DNS removal/decommission should follow the redirect period, not precede it.
