# Public devnet and hosted sandbox

18 September 2026. The [hosting foundation](hosting-foundation-review.md) now passes Docker and native Vercel Linux execution. The persistent 2027 devnet registry is created. A Vercel project exists; temporary probes were removed. The public website and visitor-session layer are not released yet.

## Two modes

| Mode | Visitor experience | Clock and settlement |
| --- | --- | --- |
| Solana Devnet | Connect a wallet, obtain clearly labeled test collateral, split, transfer, trade supported claims and recombine | Real public chain time. Keep the unchanged annual program; no fast-forward controls or shortened devnet term. |
| Accelerated sandbox | Try the existing Split/Redeem app and guided two-wallet Raydium/Test USDC walkthrough, including annual redemption | Disposable private Surfpool networks, synthetic balances and dividend records, visitor-controlled time. Clearly label receipts as sandbox transactions. |

Keep core Split/Redeem separate from guided demos and preserve the approved design, `/rehearsal/`, decks and narration. Each visitor's sandbox clock, keys, balances and resets must be independent. Wallet and guided sandbox flows currently use different networks; hosting must not imply claims move between them or onto devnet.

For the existing 2027 annual design, deposits close on 1 January 2027 and maturity is 1 January 2028 UTC. Public devnet can demonstrate issuance, transfers, liquidity, swaps and paired recombination now. Independent side redemption waits for maturity **and** valid journal finalization. The sandbox demonstrates that later lifecycle immediately. No alternate program or clock override is needed.

Chain time advances automatically, but dividend classification and settlement do not happen merely because time passes. Eventually a scheduled, idempotent attestor service should submit qualified records and finalize only when the reviewed coverage policy permits it. That writer is still blocked by issuer evidence. The first public site uses test collateral and states this boundary; it does not promise automated live issuer settlement or require the user to operate a time-control panel.

## Hosting recommendation

**Use Vercel for the static website and isolated sandbox compute.** Both complete runtime flows now execute on native Vercel Linux. The remaining work is the visitor-facing session/faucet layer and release verification; Cloudflare stays a fallback if those reveal a material blocker.

- Build the existing Vite frontend as static assets. Small server endpoints manage sandbox sessions and bounded devnet services.
- Use **Vercel Sandbox**, a separate compute product, for long-running Surfpool processes. Its current documentation supports Linux microVMs, custom images and exposed application ports. Normal Vercel Functions should manage requests, not own an in-memory chain between requests. See [Sandbox overview](https://vercel.com/docs/sandbox), [images](https://vercel.com/docs/sandbox/concepts/images) and [SDK](https://vercel.com/docs/sandbox/sdk-reference).
- Make sessions disposable and explicitly expire/reset them. Vercel's filesystem snapshots do not establish recovery of our in-memory ledger and keys. Start from an immutable build image, not a saved visitor chain. See [persistence](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes).
- Confirm account availability, limits and budget before launch. Current documented session limits are 45 minutes on Hobby and 24 hours on Pro; Pro compute is usage billed. Set our own shorter lifetime, creation limits and concurrency ceiling after measurement. See [pricing and quotas](https://vercel.com/docs/sandbox/pricing).

**Fallback: Cloudflare Containers**, with either the existing Vercel frontend or Cloudflare static assets. This supports Linux containers and per-session routing through a Worker/Durable Object, but adds a separate deployment/control layer if the frontend stays on Vercel. Workers alone cannot host this native runtime. Containers require Workers Paid, currently starting at $5/month plus applicable usage; filesystem state is ephemeral. See [overview](https://developers.cloudflare.com/containers/), [lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/), [frontend/backend example](https://developers.cloudflare.com/containers/examples/container-backend/) and [pricing](https://developers.cloudflare.com/containers/platform/pricing/). No third hosting provider is needed unless these probes reveal a blocker.

## What the code requires

Read-only review of `packages/local-runtime`, `packages/guided-runtime` and their installed Surfpool 1.5.0 package established:

- **Node 24, Linux x86_64 and glibc.** This Surfpool release ships `linux-x64-gnu`; its generic loader branches do not prove ARM or Alpine/musl support. Verify the selected image and native addon in the target environment.
- **Pinned program artifacts.** `target/deploy/dividendx.so` is ignored by Git. Supply the accepted hash-verified ELF as a build artifact, or reproduce and verify it in a pinned build stage. Include the tracked Raydium/config/USDC captures and built SDK packages. Keep toolchains out of the final runtime image.
- **Configurable HTTPS endpoints.** The wallet frontend now supports explicit devnet configuration; local/sandbox servers still bind localhost. Add hosted-session configuration and a public application gateway; keep Surfpool's dynamically allocated native RPC and WebSocket ports private.
- **Session isolation.** Both servers currently own a singleton runtime. Guided Start replaces its current network; session IDs alone do not isolate visitors. Allocate a process/microVM per active visitor flow with a private mutation queue, opaque authorization, revision checks and expiry.
- **Controlled RPC.** The wallet sandbox needs a session-scoped proxy allowing only the standard methods it actually uses. Unknown methods are denied; administrative Surfpool methods stay private. Guided actions use the existing bounded HTTP interface. Prefer bounded HTTP confirmation polling if it avoids an unnecessary public WebSocket proxy.
- **Honest restart behavior.** A process restart destroys the chain and keys. Saved receipt JSON is historical evidence, not a resumable network. Show expired/reset status, discard stale manifests and obtain explicit user action before starting a fresh session.

The [native probe](hosting-foundation-review.md) measures 1.269-second wallet startup, 104 wallet receipts and the full 36-transaction guided journey. Cgroup peaks were approximately 726 MB and 559 MB respectively, including probe/cache effects. These are single-session observations, not capacity guarantees. Concurrent visitor isolation and load still need verification; session creation must show asynchronous progress and explicit expiry.

## Delivery order and acceptance

1. **Linux feasibility — complete:** portable hash-verified image, native module load, signed wallet flow and full guided annual journey pass in Docker and Vercel Sandbox. Preserve the artifact identities and [acceptance evidence](hosting-foundation-review.md).
2. **Public devnet app — foundation implemented:** explicit network configuration, pinned identities, devnet signing and a persistent synthetic registry exist. Temporary-wallet production-browser acceptance passes. Finish installed-extension acceptance, durable public faucet quotas and automated synthetic profile-observation refresh. Authorities are separate; the current HTTP faucet remains disabled. Reuse the accepted Raydium integration; no additional venue.
3. **Hosted sandbox:** connect isolated visitor sessions to the existing app and guided page; add progress, expiry/reset and restricted RPC. Verify that one visitor's advance/reset cannot affect another, and that no provider credentials or devnet signers enter a sandbox or frontend bundle.
4. **Public release:** verify clean-browser desktop/mobile flows, installation-wallet behavior, real devnet receipts, sandbox full redemption, refresh/failure recovery, funding limits and release rollback. Activate CI or record the existing OAuth `workflow`-scope blocker. Keep the exact tested program artifact with the release.
5. **Issuer follow-up and submission:** the user contacts Ondo/Backpack after the site is usable. Continue qualified source policy and automated settlement only when evidence allows; refresh versioned pitch/video/submission materials around verified behavior. Additional DeFi demos remain roadmap-only.

The website can become useful before qualified issuer settlement is complete, but those are distinct milestones. Hosting does not upgrade synthetic test assets or unsigned dossiers into live issuer support.
