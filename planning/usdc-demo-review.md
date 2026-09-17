# Test USDC demo acceptance

17 September 2026. Astra accepted the [USDC update](../spec/guided-usdc-v1.md) after reviewing Sol's implementation, actual browser execution, public devnet transactions and independent RPC checks. The annual program, transaction SDK and core wallet flow are unchanged. Earlier [generic-quote proof](guided-demo-review.md) remains historical evidence.

## Delivered behavior

The guided page shows **Test USDC** as its quote currency. A stock holder seeds 40 DR / 4 USDC, adds 60 DR / 6 USDC, and a second wallet buys DR with 1 USDC. Liquidity withdrawal, paired recombination, four synthetic annual dividends and separate final redemption follow as before. PT and DR still redeem in stock tokens, not USDC.

The official devnet mint is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, confirmed against [Circle's address list](https://developers.circle.com/stablecoins/usdc-contract-addresses) and finalized RPC. It is an initialized six-decimal classic SPL mint. Tests pin its mint authority `GrNg1XM2ctzeE2mXxXCfhcTUbejM8Z4z4wNVTy2FjMEz` and freeze authority `CJtyoKSLrktozQzjERTiK3btQtiTK3nN4QrqGHLidyCT`.

The two execution boundaries are explicit:

| Flow | USDC source | What it proves |
| --- | --- | --- |
| Public devnet | User-supplied faucet funds, transferred through checked SPL instructions | Actual official-mint funding, pool creation, added liquidity, swap, withdrawal and paired recombination |
| Local annual walkthrough | Exact captured mint bytes with synthetic 10 + 1 USDC balances in offline Surfpool | The complete two-wallet journey through accelerated maturity and independent redemption |

The UI and local receipt disclose local funding, and DTO v2 rejects an old private-quote runtime. No local balance is presented as a faucet transfer. Global Circle mint supply is separate from the 11 USDC tracked by this scenario. Both are test environments; no dollar backing, real issuer custody or live dividend settlement is claimed.

## Public devnet proof

The user funded `DpbSCimwNNWMcREiJ7npkWuDVywWgHHekZGx6K9TeRsv` with 20 test USDC. [Funding observation](evidence/usdc-devnet-funding-2026-09-17.json) confirms the official-mint ATA. The run transferred 10 USDC to the provider and 1 to the buyer, leaving 9 in the source wallet. Circle mode verifies mint identity, authorities, fresh recipient accounts and sufficient funding before any chain mutation. It creates no quote mint and holds no Circle mint authority.

The [public receipt](evidence/amm-usdc-devnet-roundtrip-2026-09-17.json) contains **14 transactions**, slots 499836897–499837321. [Independent verification](evidence/amm-usdc-devnet-verification-2026-09-17.json) re-read every transaction as finalized and checked actual funding, Raydium instructions, pool mints and account balances at finalized slot 499840093. Bounded retry/backoff handled temporary public-RPC throttling and a connection timeout; no execution was repeated.

[Inspect the DR / Test USDC pool](https://explorer.solana.com/address/Fi94TtWky2e9SnSFAUzoPAcKKNV1WziEmLtZZ3FTi65S?cluster=devnet).

The buyer spent 1 USDC and received 907024323 DR raw (9.07024323 DR), above the encoded minimum 902489201. The provider recovered and recombined 9092972801 raw pairs. Remaining PT, DR and vault backing each equal 907027199 raw; buyer DR 907024323 plus pool DR 2876 exactly equal remaining DR supply. Provider LP and LP mint supply are zero, while Raydium retains 100 internal LP. The provider holds 10999596 USDC raw and the pool holds 404, exactly conserving the funded 11000000. This future annual public series remains open; independent final redemption is demonstrated locally.

## Local browser proof

The [mint capture](../packages/guided-runtime/fixtures/circle-devnet-usdc-2026-09-17.json) records finalized devnet slot 499830485. SHA-256 `3c8a2c7c49c355902bf2b2cb4b5bded7772a7971bb7e8168b0873d2f9d2b42b6` identifies the exact 82 mint bytes. Local supply and authorities remain unchanged. Offline account initialization explicitly funds two local accounts; subsequent trading uses signed transactions. The actual source global supply can change independently on public devnet.

Session `d19c0545-dfda-4051-a9d9-249832613c0a` completed **nine actions and 36 confirmed local transactions**. [Browser evidence](evidence/guided-usdc-browser-2026-09-17.json), [receipt](evidence/guided-usdc-receipt-2026-09-17.json) and [independent chain verification](evidence/guided-usdc-chain-verification-2026-09-17.json) agree on all identities, checkpoints and signatures. The obsolete quote-mint creation explains the reduction from 37 to 36 transactions.

At maturity the exact four-event allocation is PT 872141538 raw and DR 34885661 raw. The buyer receives 34885550 stock raw; the provider's final stock balance is 9965114339. The vault retains 111 raw backing the pool's 2876 DR raw. Their stock sum is exactly 10000000000, with no sweep or forfeiture. A separate Python rational calculation confirmed the binary64-factor allocation and cumulative rounding.

Browser balances match RPC-derived raw balances after every action; reload after purchase preserves the session. No page errors or overflow occurred at 1440, 1024, 768 or 390 pixels. [Desktop](../apps/web/qa/guided-usdc-complete-1440.png) and [mobile](../apps/web/qa/guided-usdc-complete-390.png) captures were inspected. Those full-flow captures precede the public proof link; the final production page now links the verified pool separately. [Production readiness](evidence/guided-usdc-production-2026-09-17.json) verifies fresh 10/1 balances and the public link in the built page, with updated [desktop](../apps/web/qa/guided-usdc-production-ready-1440.png) and [mobile](../apps/web/qa/guided-usdc-production-ready-390.png) captures.

## Checks and reproduction

- Root fixture verification and all 71 reference/reader/transport tests pass.
- Type checking and final production build pass.
- Full browser suite passes 34/34; all seven guided tests pass again after adding the public proof link.
- AMM package tests pass 15/15; guided runtime/HTTP tests pass 5/5.
- The in-process 36-transaction smoke, actual browser journey, independent local RPC checks and independent finalized public checks pass separately.
- Existing generic receipts, screenshots, default mock CLI, core `/app/`, its 4180 runtime, approved art and narration are preserved.

Use `npm run demo:guided` for the local service. The [QA instructions](../apps/web/qa/README.md) document the browser driver; `scripts/protocol/guided-runtime-verify.mjs` accepts v1 and v2 completed local sessions. The [AMM README](../packages/amm-integration/README.md) documents `--quote circle-devnet-usdc`. To re-read the public proof, run `node scripts/protocol/amm-usdc-verify.mjs --receipt planning/evidence/amm-usdc-devnet-roundtrip-2026-09-17.json --output /tmp/amm-usdc-verification.json`.

This change needs no new program deployment or issuer attestation. PT trading, borrowing and qualified live issuer settlement remain separate work.
