# Public devnet and hosted sandbox

18 September 2026. The [accepted canonical test site](hosting-release-review.md) is [dividendx-stocklana.vercel.app](https://dividendx-stocklana.vercel.app). It serves real-calendar devnet at `/app/`, a private accelerated wallet VM at `/sandbox/`, and a separate guided VM at `/demos/`. Production-browser devnet, full annual sandbox redemption, the nine-action guided journey, simultaneous two-visitor reset/isolation and natural hard expiry pass against the unchanged accepted ELF.

## Two modes

| Mode | Visitor experience | Clock and settlement |
| --- | --- | --- |
| Solana Devnet | Connect a wallet, obtain clearly labeled test collateral, split, transfer, trade supported claims and recombine | Real public chain time. Keep the unchanged annual program; no fast-forward controls or shortened devnet term. |
| Accelerated sandbox | Try the existing Split/Redeem app and guided two-wallet Raydium/Test USDC walkthrough, including annual redemption | Disposable private Surfpool networks, synthetic balances and dividend records, visitor-controlled time. Clearly label receipts as sandbox transactions. |

Keep core Split/Redeem separate from guided demos and preserve the approved design, `/rehearsal/`, decks and narration. Each visitor's sandbox clock, keys, balances and resets must be independent. Wallet and guided sandbox flows currently use different networks; hosting must not imply claims move between them or onto devnet.

For the existing 2027 annual design, deposits close on 1 January 2027 and maturity is 1 January 2028 UTC. Public devnet can demonstrate issuance, transfers, liquidity, swaps and paired recombination now. Independent side redemption waits for maturity **and** valid journal finalization. The sandbox demonstrates that later lifecycle immediately. No alternate program or clock override is needed.

Chain time advances automatically, but dividend classification and settlement do not happen merely because time passes. Eventually a scheduled, idempotent attestor service should submit qualified records and finalize only when the reviewed coverage policy permits it. That writer is still blocked by issuer evidence. The first public site uses test collateral and states this boundary; it does not promise automated live issuer settlement or require the user to operate a time-control panel.

## Hosting recommendation

**Vercel now serves the static website, Server Functions and isolated Sandbox compute.** The visitor-facing broker, gateway and bounded devnet services are deployed. Cloudflare remains documented only as a fallback architecture.

- The existing Vite frontend builds as static assets. Small Server Functions manage sandbox sessions and bounded devnet services.
- Use **Vercel Sandbox**, a separate compute product, for long-running Surfpool processes. Its current documentation supports Linux microVMs, custom images and exposed application ports. Normal Vercel Functions should manage requests, not own an in-memory chain between requests. See [Sandbox overview](https://vercel.com/docs/sandbox), [images](https://vercel.com/docs/sandbox/concepts/images) and [SDK](https://vercel.com/docs/sandbox/sdk-reference).
- Sessions are disposable and explicitly expire/reset. Vercel filesystem snapshots do not establish recovery of the in-memory ledger or keys. Each VM starts from an immutable allowlisted image and hard-expires after 15 minutes. See [persistence](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes).
- The release enforces four active VM reservations, 100 starts per UTC day, six per visitor, 30 per observed IP and a 30-second creation cooldown. See [hosting operations](../docs/hosting-operations.md) for budget and rollback procedures.

**Fallback: Cloudflare Containers**, with either the existing Vercel frontend or Cloudflare static assets. This supports Linux containers and per-session routing through a Worker/Durable Object, but adds a separate deployment/control layer if the frontend stays on Vercel. Workers alone cannot host this native runtime. Containers require Workers Paid, currently starting at $5/month plus applicable usage; filesystem state is ephemeral. See [overview](https://developers.cloudflare.com/containers/), [lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/), [frontend/backend example](https://developers.cloudflare.com/containers/examples/container-backend/) and [pricing](https://developers.cloudflare.com/containers/platform/pricing/). No third hosting provider is needed unless these probes reveal a blocker.

## What the code requires

Read-only review of `packages/local-runtime`, `packages/guided-runtime` and their installed Surfpool 1.5.0 package established:

- **Node 24, Linux x86_64 and glibc.** This Surfpool release ships `linux-x64-gnu`; its generic loader branches do not prove ARM or Alpine/musl support. Verify the selected image and native addon in the target environment.
- **Pinned program artifacts.** `target/deploy/dividendx.so` is ignored by Git. Supply the accepted hash-verified ELF as a build artifact, or reproduce and verify it in a pinned build stage. Include the tracked Raydium/config/USDC captures and built SDK packages. Keep toolchains out of the final runtime image.
- **Configurable HTTPS endpoints.** The wallet frontend supports explicit devnet configuration and immutable same-origin hosted-session paths. Surfpool's dynamic RPC and WebSocket ports remain private.
- **Session isolation.** The broker allocates one process/microVM per active visitor flow with opaque cookie identity, durable quota reservations, immutable session paths, revision checks and expiry. Wallet and guided sessions remain separate.
- **Controlled RPC.** The gateway allows only the wallet's required methods and bounded writes. Unknown and administrative Surfpool methods are denied. Guided actions retain the bounded HTTP interface, and hosted wallet confirmation uses HTTP status/block-height polling without a public WebSocket.
- **Honest restart behavior.** A process restart destroys the chain and keys. Saved receipt JSON is historical evidence, not a resumable network. Expired/reset sessions discard stale manifests and require explicit user action before a fresh VM starts.

The [native probe](hosting-foundation-review.md) measured 1.269-second wallet startup, 104 wallet receipts and the full 36-transaction guided journey. Cgroup peaks were approximately 726 MB and 559 MB respectively, including probe/cache effects. Production evidence now adds three finalized public devnet transactions, 30 confirmed/finalized full-lifecycle wallet-sandbox signatures, 36 guided transactions, simultaneous two-visitor reset/isolation and natural provider hard expiry with old-path 410. Operator cleanup separately deleted the stopped owned test VM. These are bounded test runs, not capacity guarantees.

## Delivery order and acceptance

1. **Linux feasibility — complete:** portable hash-verified image, native module load, signed wallet flow and full guided annual journey pass in Docker and Vercel Sandbox. Preserve the artifact identities and [acceptance evidence](hosting-foundation-review.md).
2. **Public devnet app — released with temporary-wallet proof:** explicit configuration, pinned identities, persistent synthetic registry, finite durable faucet quotas and six-hour synthetic profile refresh are deployed. The hosted wrapper grants exactly ten units once per wallet/asset/day and has a finite 1 SOL lifetime endowment; the local operator faucet remains disabled. Grant, split and recombine produced three independently finalized signatures. Installed-extension acceptance remains.
3. **Hosted single-session journeys — complete:** session broker, immutable same-origin routing, progress, expiry/reset, restricted RPC and HTTP confirmation are deployed. The wallet sandbox completes funding, split, four annual steps and separate redemption with 30 confirmed/finalized signatures and zero final vault/claim supply. Guided completes all nine actions and 36 transactions using synthetic local Test USDC.
4. **Hosted isolation and expiry — complete:** two simultaneous visitors have distinct runtime, deployment-domain and account identities. Advancing and resetting visitor A leaves visitor B's clock and balances unchanged; visitor A receives a replacement identity and its stale paths return the expected 410. Natural expiry independently stops the provider without an operator stop, retains the same expired broker ID and returns 410 from the old manifest. Operator cleanup later deletes the stopped owned test VM. Surfpool genesis hashes are not an isolation requirement.
5. **Release follow-through:** conduct outside visitor testing, verify one supported installed Wallet Standard extension with a disposable key, retain rollback/operator checks and record the GitHub OAuth `workflow`-scope CI blocker. A newly scheduled cron bucket has not yet been observed; the accepted cron evidence proves three finalized same-bucket updates and idempotent replay.
6. **Issuer follow-up and submission:** obtain external Ondo/Backpack answers, continue qualified source policy and automated settlement only when evidence allows, and refresh versioned pitch/video/submission materials around verified behavior. Additional DeFi demos remain roadmap-only.

The website can become useful before qualified issuer settlement is complete, but those are distinct milestones. Hosting does not upgrade synthetic test assets or unsigned dossiers into live issuer support.
