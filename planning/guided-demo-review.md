# Guided two-wallet Raydium demo acceptance

Accepted by Astra on 17 September 2026 under [guided demos v1](../spec/guided-demos-v1.md). Sol implemented the runtime and browser page at high effort; Astra reviewed integration and independently checked the actual browser journey and local chain.

## Delivered flow

`/demos/` is separate from core Split/Redeem. Two disposable server-managed wallets execute nine actions: split 100 test stock, create/seed a DR pool, add liquidity, purchase DR with a second wallet, remove provider LP, recombine recovered claims, settle four synthetic annual dividends, redeem the buyer's DR and redeem the provider's remaining PT. The page shows each actor, current action, balances and optional exact evidence. Reload reconnects to the same server session.

Every action executes signed transactions through the accepted DividendX program and captured genuine Raydium devnet CPMM binary on a separate offline Surfpool. The browser does not calculate substitute balances. The persistent label states local transactions, test assets and an accelerated test year. The quote token has no dollar value or redemption right. No issuer event, real stock custody or public-chain maturity is claimed.

The runtime listens only on 4181, keeps keys in memory and preserves the existing 4180 wallet runtime. Requests use fixed actions, exact runtime/session/revision checks and bounded JSON. Host, Origin and a custom mutation header are checked. Snapshots batch required accounts coherently; a missing read fails rather than becoming a zero balance. Failures retain partial evidence. Local receipts have no public explorer links; the earlier devnet proof is linked separately.

## Actual browser and chain proof

- Session: `be341950-603b-411e-a6d1-be7070fe2fd4`.
- [Browser evidence](evidence/guided-demo-browser-2026-09-17.json): all nine actions, 37 confirmed transactions, displayed raw balances checked after each action, reload after purchase, no page errors or horizontal overflow at 1440/1024/768/390 pixels.
- [Public local receipt](evidence/guided-demo-receipt-2026-09-17.json): identities, capture provenance, signatures and ten coherent checkpoints including setup. Disposable keys are absent.
- [Independent RPC verification](evidence/guided-demo-chain-verification-2026-09-17.json): all 37 signatures finalized when rechecked, actual transaction programs/signers, account derivation/owners, mint profiles, four-event journal, exact allocation and final conservation.
- [Desktop](../apps/web/qa/guided-demo-complete-1440.png) and [mobile](../apps/web/qa/guided-demo-complete-390.png) renders inspected; the [ready state](../apps/web/qa/guided-demo-ready-1440.png) shows the starting action and two wallets.

Raw stock units use eight decimals. The buyer purchased `907024323` DR raw for `20000000` worthless quote raw. The provider recovered and recombined `9092975034` paired claims. Finalization allocated remaining stock into PT pool `872139391` and DR pool `34885575`; the buyer redeemed `34885550` stock raw and the provider redeemed the entire PT pool.

| Final quantity | Raw units |
| --- | ---: |
| Provider stock | 9965114425 |
| Buyer stock | 34885550 |
| Vault stock | 25 |
| Original stock supply | 10000000000 |
| Remaining DR in Raydium | 643 |
| PT supply | 0 |
| Provider LP / LP mint supply | 0 / 0 |
| Raydium internal locked LP | 100 |

Provider stock + buyer stock + vault stock exactly equals original supply. Remaining vault custody exactly backs Raydium's residual DR allocation. The runtime does not sweep that backing or assume withdrawing all user LP empties the pool. Four synthetic event multipliers progress from 1 to 1.01, 1.02, 1.03 and 1.04; canonical binary64 factors and cumulative rounding determine the payout, not floating-point display arithmetic.

## Binary and capture identity

| Artifact | SHA-256 |
| --- | --- |
| DividendX deployed ELF | `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070` |
| Generated IDL, both copies | `d4953c8a234e1b235e07db92f464dfb0033b62ff41bf378657fe1357a3211da4` |
| Captured Raydium ELF, 742640 bytes | `87ef84634086209fc2c29b4163bbe5209a1e9383aff5c429781f5fff270d75fd` |
| Captured Raydium config | `3b5ca2f3187261cc048e2353789242067c3aff19cab67168f86dbbd29d99f21c` |
| Source fee-receiver data | `c8c0238152ce9c374de300598a8513b59018396b39f603cdc2eba44bca357464` |

[Capture fixture](../packages/amm-integration/fixtures/raydium-devnet-2026-09-17/capture.json) records finalized source slot 499784549 and source Raydium deployment slot 498629438. Local deployment slots differ and are checked separately. Bytecode and config hashes match actual local accounts.

The fee receiver is mutable native SOL. Its lamports increased by exactly 150000000 during pool creation. The local native rent reserve is 2039280, versus source reserve 1488440. The verifier independently checks local RPC rent, token amount = lamports minus that reserve, and every other byte against the captured source. The final mutable account hash is therefore not claimed to equal the initial capture hash. Captured-binary execution does not establish source-to-binary reproducibility.

## Validation and reproduction

- Root fixture verification and 71 reference/reader/transport tests pass; type check and final production build pass.
- All 27 existing browser checks passed. Five new guided checks pass after final UI integration, covering guarded actions, stale recovery, retained partial failure receipts, reload, unavailable runtime and mobile/focus behavior.
- Four guided runtime tests and the full 37-transaction package smoke pass. Eleven AMM tests pass.
- The accepted program/SDK source and ELF/IDL hashes are unchanged; prior compiled-SBF acceptance remains in [program review](program-review.md).
- The actual browser driver and independent RPC verifier pass separately from mocked browser tests.
- The reviewed production bundle was merged into the existing 4174 preview with earlier hashed assets retained for open tabs. A production-browser restart of the guided journey prepared a fresh two-wallet session successfully, with no page errors; the existing wallet runtime remained running.

After installing the package dependencies listed in the [runtime README](../packages/guided-runtime/README.md), start `npm run demo:guided` and the web app. Run `DIVIDENDX_REVIEW_URL=http://127.0.0.1:4174 node apps/web/qa/guided-demo-review.mjs` for a new complete browser session. While that completed chain remains alive, run `node scripts/protocol/guided-runtime-verify.mjs --output /tmp/guided-chain-verification.json`. Restarting the guided runtime destroys its disposable chain; saved receipts remain historical evidence. The browser driver replaces its dated local QA output, so preserve accepted evidence before another recording. Runtime HTTP tests also bind 4181 and should be run before starting the interactive runtime.

## Remaining scope

The public devnet 15-transaction round trip remains separate in [AMM acceptance](amm-review.md). Live issuer qualification, installed extension-wallet verification and production deployment remain incomplete. PT trading is the next small demonstration candidate; borrowing first needs explicit venue admission, pricing, liquidation and annual-term handling. The [DeFi shortlist](research/defi-demo-sequence.md) and [roadmap](roadmap.md) record those ideas without claiming implementation.
