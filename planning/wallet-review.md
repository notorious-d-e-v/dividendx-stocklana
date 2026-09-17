# Wallet application acceptance

17 September 2026. Accepted for local demonstration from baseline `4eb4577`. This phase connects a separate `/app/` surface to the accepted compiled program and transaction SDK; `/` and `/rehearsal/` remain available.

## Verified implementation

- `/app/` uses the actual transaction SDK and wallet signatures for deposit, transfer, paired recombination and final redemption. The preview and rehearsal are preserved.
- Wallet discovery uses Wallet Standard. A separate temporary browser wallet signs real transactions and never persists its key. No installed extension has been tested.
- Runtime discovery is checked against genesis, executable program, deployment domain, derived accounts and token ownership. Context changes invalidate pending actions; a wallet-modified message is rejected before submission.
- Stock input/display uses exact binary multipliers, claims use their mint decimals, and Max retains exact raw units. Fresh quotes carry state, time and output guards. Zero-output burns need explicit consent.
- RPC requests are bounded. Background errors mark balances stale, disable actions and preserve unrelated errors. Polling cannot indefinitely supersede a slower read. Faucet/control failures preserve confirmed partial receipts.

## Acceptance evidence

The [independent RPC driver](../scripts/protocol/wallet-runtime-smoke.mjs) and [recorded receipts](evidence/wallet-runtime-smoke-2026-09-17.json) cover 104 unique confirmed signatures across 6-, 8- and 9-decimal test assets. Each asset passes actual deposit, separate PT/DR transfers, paired recombination, four-event finalization and independent redemption by two holders. Exact program error codes establish maturity-only rejection, minimum-output rejection and required zero-output consent, with economic state unchanged after failure.

After an external PT burn and a seven-unit vault donation, each final vault retains eight raw units: one for the unredeemable burned claim obligation and seven donated units. Other holders receive no redistributed entitlement. The driver checks exact custody conservation, transaction details and actual program invocation.

The [actual browser review](../apps/web/qa/wallet-app-review.mjs) passed using two independent temporary wallets and the real RPC, without mocked balances or signing. Its [evidence](evidence/wallet-browser-review-2026-09-17.json) records 33 displayed signatures independently checked as confirmed/finalized. It deposits 100 TestKOx, recombines 10 pairs, transfers 20 PT and 40 DR, closes funding, records four dividends, distinguishes maturity from finalization, verifies zero-output consent, and redeems both holders' claims. Final PT/DR supplies and vault balance are zero; the two holders retain exactly 20,000,000,000 collateral raw units in total.

The browser review also stalls RPC deliberately for longer than the polling interval, verifies visible stale balances and disabled actions, then recovers by manual refresh. Reload discards the temporary wallet, leaves no browser storage and preserves chain state. Keyboard entry and overflow checks pass at 390, 768, 1024 and 1440 pixels. Astra inspected Market, Split and Redeem desktop/mobile captures. Normal execution produced no console/page errors; the deliberate timeout is identified separately in the driver.

## Checks

- Fixture verification and **33** annual-reference/legacy tests pass.
- **22** transaction-SDK tests and its package-import check pass.
- **27** browser-runner tests pass: 20 preserved preview/rehearsal checks and seven wallet/error/utility checks. Mocked wallet tests cover rejection, disconnect and account mismatch; these are separate from real transaction evidence.
- Type checking and the production build pass. The wallet's dependency chunk is about 537 kB minified / 152 kB gzip and triggers Vite's size advisory; it is loaded separately from the reference preview.
- The served production bundle passes a separate read-only Chrome check: actual runtime discovery, temporary wallet creation, repeated current-asset selection and all three asset snapshots, with no browser errors. This caught and fixed a same-asset selection that temporarily cleared balances.
- Local runtime artifact-pin test, signed feasibility probe and read-saturation regression pass.
- No Rust/program changes: the prior **46** Rust checks, including 16 compiled-SBF tests, remain the program baseline. Current integration reuses the exact accepted ELF and IDL below.

Reproduction instructions and screenshots are in [web QA](../apps/web/qa/README.md). Each live-runtime acceptance driver needs a fresh runtime. Restart once more afterward for a pre-year user demonstration.

## Runtime decision

Agave's slot warp retains the parent Unix timestamp, so it cannot demonstrate a calendar-year lifecycle alone. Pinned Surfpool 1.5.0 executes the unchanged SBF artifact offline and supports explicit Clock travel. Test admin/attestor authorities remain in process memory. Token accounts, balances, claim issuance, event records and finalization are created through genuine instructions; only deployment/authority bootstrap, initial SOL and time use development controls.

Parent QA found that Surfpool's undrained native event buffer eventually blocked account reads while `getHealth` still passed. The daemon now drains it continuously. The reproducible probe passes 300 reads and an idle follow-up; the daemon also passed 500 reads separated by 30 seconds idle, then 100 multi-account reads. Probe failure exits nonzero. Surfpool's post-travel transaction `blockTime` metadata is not authoritative; the Clock sysvar and actual program gates establish annual time. See [runtime notes](../packages/local-runtime/README.md) and [provenance](../packages/local-runtime/evidence/surfpool-probe-2026-09-17.json).

## Preserved artifacts

- Program ID: `2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE`.
- Compiled ELF: 706,504 bytes; SHA-256 `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070`.
- Both IDL copies: SHA-256 `d4953c8a234e1b235e07db92f464dfb0033b62ff41bf378657fe1357a3211da4`.
- No program, transaction-SDK, fixture, artwork, narration or deck source changed in this phase. The existing root preview gains one wallet-app link.

## Remaining boundaries

No real issuer deposits, source-complete annual event feed, mainnet funds, public deployment, venue liquidity or audit is established by these local tests. Test profiles share the decimal/Scaled UI Amount model; they do not reproduce every issuer extension or permission. Actual extension-wallet behavior and public-network consensus remain unverified. Surfpool is a development harness whose raw RPC has local administrative controls, not a production RPC service.
