# Public hosting review — 18 September 2026

Accepted for the public test site at [dividendx-stocklana.vercel.app](https://dividendx-stocklana.vercel.app). Real-browser devnet, annual sandbox redemption, guided liquidity/redemption, visitor isolation/reset and natural expiry pass. This review extends the [hosting foundation](hosting-foundation-review.md). It does not accept installed-wallet extensions or qualified live issuer settlement.

The serving deployment is `dpl_5W46MCQ7Fq3FngxgNB9GN9ZEwF9o`, built at [its immutable URL](https://dividendx-stocklana-aujgzoxf0-payai.vercel.app). Use the canonical hostname for mutations; the configured origin policy intentionally excludes immutable deployment hostnames.

## Deployment and boundaries

The Vercel project `dividendx-stocklana` hosts static pages and bounded server functions. `/app/` uses the persistent, real-calendar 2027 Solana devnet registry. `/sandbox/` and `/demos/` allocate separate disposable Surfpool networks behind a same-origin broker. Sandbox balances, clocks and transaction history never move onto devnet.

The accepted DivX program remains `2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE`, with ELF SHA-256 `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070`. Public deposits close on 1 January 2027; maturity is 1 January 2028. Independent redemption additionally requires valid finalization. No public clock control, shortened term, program upgrade or qualified live issuer settlement is introduced.

A code-only Vercel Sandbox snapshot contains the allowlisted native runtime, reviewed gateway and pinned program artifacts. Its [immutable source/hash manifest](evidence/hosted-runtime-snapshot-2026-09-18.json) is distinct from later server-function dependency lockfiles. No devnet authority, issuer credential, visitor ledger or running chain is included in the snapshot.

## Provider and storage checks

The [successful provider probe](evidence/hosted-provider-probe-2026-09-18-r3.json) created wallet and guided VMs, checked distinct runtime identities, pinned manifests, same-origin RPC rewriting, visitor ownership and the private gateway boundary, then stopped and deleted both. Earlier failed probes remain recorded; they do not count as acceptance.

The private Blob ledger uses strong ETags and conditional writes. Actual testing found that compressed reads supplied weak ETags; `Accept-Encoding: identity` is required. The [diagnostic](evidence/hosted-blob-etag-diagnostic-2026-09-18.json) and [CAS load check](evidence/hosted-blob-cas-load-2026-09-18.json) record the correction, ten sequential writes and four concurrent writes with conflicts resolved and exact final revision. Temporary probe objects were removed.

A later [eight-writer probe](evidence/hosted-blob-large-cas-2026-09-18.json) reproduced the intermittent browser failure: the service also reports a conflicting conditional operation as a bare `BlobError`, rather than the SDK's dedicated precondition error. The broker now recognizes only that exact rejection and rereads before retrying the ledger change, with twelve bounded attempts. Unknown storage errors still fail closed. The upstream sandbox operation is forwarded only after its charge commits; a ledger retry does not repeat a transaction.

The corrected [60,045-byte stress probe](evidence/hosted-blob-contention-fixed-2026-09-18.json) completed all eight concurrent writes after 26 conflicts, with exact final revision 20 and no lost updates. The probe object was deleted. The final browser journeys below also pass against the deployed correction.

Each visitor flow has a fixed 15-minute lifetime, a 90-second provisioning limit and a private gateway. Current ceilings are four active VMs, 100 starts per day globally, six per visitor, 30 per IP and a 30-second start/reset cooldown. Sessions require explicit creation; unknown creation or termination outcomes retain their reservation until reconciliation. These are application limits, not an unlimited-capacity promise. The RPC gateway allows only the reviewed test-flow methods.

## Devnet service funding

The dedicated public faucet received a separate, bounded endowment: 989,113,040 lamports transferred plus a 5,000-lamport fee, finalized at slot 500148884. Its post-transfer balance was 1 SOL. This is separate from the completed hosting-foundation bootstrap/QA budget. See [public funding receipt](evidence/devnet-public-faucet-endowment-2026-09-18.json).

Each grant provides ten synthetic test-stock units and at most the configured test-SOL top-up. Durable limits include one grant per wallet/asset/day, three per visitor/day, 12 per IP/day, 30 globally/day, 0.27 SOL in daily reservations and 1 SOL in lifetime reservations. Signed bytes are persisted before submission; uncertain outcomes reconcile the same signature instead of minting again. The faucet is finite and may become unavailable when quotas or funding are exhausted.

The separate synthetic-observation authority has a protected six-hour refresh schedule. This updates test profile freshness only; it neither classifies issuer dividends nor finalizes annual journals. The administrator/upgrade signer and Ondo credential remain outside Vercel.

## Deployment corrections

The initial build attempted to install a nonexistent independent issuer-reader lockfile. The build now uses its existing root lockfile. A later server runtime failed loading an ESM-only UUID dependency; the server dependency roots now pin the compatible `rpc-websockets` maintenance patch, documented in the [dependency review](hosting-dependency-review.md).

Vercel named rewrite captures inject query parameters. Static API dispatchers with unnamed `/(.*)` captures preserve the original request path without adding routing metadata; genuine query strings remain rejected. The frozen devnet registry must also be resolved from the deployed project root because bundling changes module-relative paths.

## Public devnet browser acceptance

The [public browser journey](evidence/hosted-browser-devnet-2026-09-18-r3.json) passes with a temporary in-memory wallet: obtain ten TestKOx, repeat the identical faucet request without a second grant, split one unit, then recombine the paired claims. The wallet finishes with ten stock units and zero PT/DR. All three transactions were [independently verified finalized](evidence/hosted-browser-devnet-finalized-2026-09-18.json), at slots 500177389, 500177447 and 500177493. Desktop 1440px and mobile 390px checks show no overflow or browser errors. Other test holders' outstanding claims remain backed; this does not require the shared public series to be empty.

The public RPC initially returned 429 responses during a rapid sequence of account reads. The frontend and server now pace request starts and honor `Retry-After`; the successful browser run follows that correction. The public endpoint still has shared limits and no production availability guarantee. See [Solana's cluster documentation](https://solana.com/docs/references/clusters).

The [synthetic observation refresh evidence](evidence/hosted-observation-cron-finalized-2026-09-18.json) records all three profile updates finalized and a repeated same-bucket request returning the same signatures. The first bucket completed across several calls, not one clean initial batch. The service now preserves partial progress, continues pending submissions and stops on a failed result; regression tests cover recovery. A fresh scheduled batch still needs observation.

## Hosted browser acceptance

The [wallet sandbox](evidence/hosted-browser-sandbox-2026-09-18-r3.json) executes funding, a 100-unit split, four synthetic dividend events, maturity, finalization and independent PT/DR redemption. Thirty unique transaction signatures were checked through the session RPC. Final displayed balances are 104 stock units and zero PT/DR; raw vault backing and both claim supplies are zero. The 104 displayed units reflect the synthetic multiplier, not a public payout. Desktop/mobile checks pass without overflow or browser errors.

The separate [guided journey](evidence/hosted-browser-guided-2026-09-18.json) completes all nine actions and 36 transactions: split, create/add liquidity, buyer purchase, LP withdrawal, recombination, test-year settlement and separate redemption. [Independent read-only RPC verification](evidence/hosted-guided-chain-verification-2026-09-18.json) confirms all 36 statuses, zero PT supply, zero provider LP and exactly 2,876 DR raw remaining in the pool with 111 raw collateral backing. Circle's devnet USDC mint is cloned inside this isolated chain; these balances are synthetic. Both viewport checks pass without browser errors.

The [two-visitor test](evidence/hosted-browser-isolation-2026-09-18-r3.json) proves distinct session/runtime/deployment-domain identities and account visibility: each visitor sees its own series and no account at the other visitor's series address. Advancing A leaves B's phase and balances unchanged. Resetting A creates a fresh runtime/domain, rejects A's old endpoint with 410 and leaves B unchanged. Expected old-session 410 responses during reset are recorded separately; neither page shows an alert and there are no unexpected browser errors. Surfpool instances can share a genesis hash, so the corrected test checks actual account and clock separation rather than assuming genesis uniqueness.

[Natural expiry](evidence/hosted-session-natural-expiry-2026-09-18.json) independently shows the provider stopped a VM at its hard lifetime without an operator stop. The broker retained the expired session ID and rejected its old manifest with 410. The already stopped, owned test VM was then deleted. Browser regression coverage separately checks the expiry UI and explicit restart behavior.

Earlier failed attempts are preserved as diagnostic history, including the initial browser executable/selector issues, lost nonserialized transaction lifetime metadata, public RPC bursts and storage conflict. None count toward acceptance. The signing correction compares the wallet's serialized message before restoring the original last-valid block height; it does not replace the signed blockhash.

## Checks and remaining boundaries

- 95 root tests, root type checking and the production Vercel build pass.
- All 60 browser regression tests pass on an isolated QA port; the approved local build and runtimes remain intact.
- Hosted gateway: 17 tests; broker: 17 tests plus typecheck; hosted devnet: 36 tests plus typecheck. These are separate from the root count.
- Deployment source reviews found no environment files, signers, private ledgers, local dependencies or build artifacts in the upload; [latest source inventory](evidence/vercel-release-source-review-2026-09-18.json). Server packaging explicitly checks the optional native bigint binding is absent. Remaining dependency advisories and the compatibility pin are documented in the [dependency review](hosting-dependency-review.md).
- A bounded error-log query after the successful deployed flows returned no server errors. This is a point-in-time check, not monitoring or an availability guarantee.

Use the [operator runbook](../docs/hosting-operations.md) for limits, funding, deployment and rollback. Installed-extension acceptance, a fresh scheduled cron bucket, GitHub Actions activation under the existing OAuth scope blocker, and broader visitor/load testing remain follow-through. Qualified issuer event history, custody policy, revisions and annual finality still gate any live settlement writer. No mainnet funds, program upgrade, new DeFi venue or issuer outreach was performed.
