# Public devnet catalog expansion

## Deployment update — 20 September

The user approved provisioning and verifying all 15 profiles. All 48 additive provisioning transactions are finalized; [deployment evidence](evidence/devnet-catalog-expansion-2026-09-20.json) confirms the original three identities and history are unchanged. The admin spent **0.26529408 devnet SOL**, below the separate 0.30 SOL expansion cap. The attestor paid the twelve observation fees separately. The original 0.15 SOL bootstrap guard remains unchanged.

The [holder proof](../packages/devnet-runtime/qa/summary.json) passes for all 15 profiles; its 61 transactions are [independently finalized](evidence/devnet-catalog-holder-finality-2026-09-20.json). The [backend-only release](devnet-catalog-release-2026-09-20.md) is live through [PR #3](https://github.com/notorious-d-e-v/dividendx-stocklana/pull/3); all 15 hosted refreshes and the new Apple public-browser flow pass. Verification uses a separate wallet with a 0.12 SOL allocation and a bounded admin funding fee; it does not consume the public faucet endowment. The hosted refresh validates the selected profile before preparing and sending each transaction, keeping current identity checks while avoiding repeated whole-catalog reads. Its existing six-hour cron now has a 300-second execution allowance; faucet quotas, the 45-second lease, observation validity and finite observation budget are unchanged. UI changes remain local for review.

## Original read-only preflight

Read-only preflight, 20 September 2026. The [researched 15-mint package](research/initial-asset-package.md) gives the exact **mainnet** issuer symbols and mint addresses: six xStocks, three Backpack/Trek, and six Ondo. Its [captured custody review](issuer-custody-review.md) proves local compiled-program compatibility with synthetic holder balances, clocks, and events. Those issuer mints do not exist in the public devnet registry and must not be described as devnet stock collateral.

The public devnet registry currently contains three separately minted synthetic 2027 profiles: Coca-Cola `TestKOx` (xStocks, 8 decimals), Micron `TestMU` (Backpack/Trek, 6), and IBM `TestIBMon` (Ondo, 9). A 15-choice public app would preserve those exact profiles and add synthetic counterparts for the other 12 researched identities:

| Issuer | Company | Research symbol | Proposed devnet symbol | Decimals |
| --- | --- | --- | --- | ---: |
| xStocks | Apple | `AAPLx` | `TestAAPLx` | 8 |
| xStocks | Microsoft | `MSFTx` | `TestMSFTx` | 8 |
| xStocks | Micron | `MUx` | `TestMUx` | 8 |
| xStocks | Nike | `NKEx` | `TestNKEx` | 8 |
| xStocks | IBM | `IBMx` | `TestIBMx` | 8 |
| Backpack/Trek | Nike | `NKE.US` | `TestNKE` | 6 |
| Backpack/Trek | IBM | `IBM.US` | `TestIBM` | 6 |
| Ondo | Coca-Cola | `KOon` | `TestKOon` | 9 |
| Ondo | Apple | `AAPLon` | `TestAAPLon` | 9 |
| Ondo | Microsoft | `MSFTon` | `TestMSFTon` | 9 |
| Ondo | Micron | `MUon` | `TestMUon` | 9 |
| Ondo | Nike | `NKEon` | `TestNKEon` | 9 |

These proposed symbols are labels for new synthetic mints; the source report remains the identity authority. Each needs its own devnet collateral mint, asset policy, accumulator, series, PT mint, DR mint, and vault. The issuer families must remain separate even when the underlying company matches.

## Onchain cost at current devnet rent

A read-only `getGenesisHash` returned the pinned devnet genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. `getMultipleAccounts` at confirmed slot **501210275** measured all seven accounts for each existing profile. All three have the same sizes and lamports. `getMinimumBalanceForRentExemption` returned those exact lamports for each size:

| Account | Bytes | Rent-exempt lamports per profile |
| --- | ---: | ---: |
| Token-2022 scaled collateral mint | 226 | 1,798,320 |
| Asset policy | 311 | 2,230,120 |
| Series | 483 | 3,103,880 |
| Accumulator | 2,098 | 11,308,080 |
| PT mint | 82 | 1,066,800 |
| DR mint | 82 | 1,066,800 |
| Token-2022 vault | 170 | 1,513,840 |
| **Per new profile rent** | | **22,087,840** |
| **Twelve new profiles rent** | | **265,054,080** |

The [existing bootstrap receipt](evidence/devnet-2027-bootstrap-2026-09-18.json) reports **106,328,520 lamports** of admin spend for three profiles. This reconciles exactly to `3 × 22,087,840` account rent, `40,000,000` transferred to the separate faucet and attestor, and `65,000` fees for 13 recorded bootstrap transactions (5,000 each). The code creates one mint, registers one policy, refreshes one observation, and creates one series per profile. With the existing authorities already funded, 12 additional profiles have a **48-transaction fee baseline of 240,000 lamports** at the observed fee, making the additional baseline **265,294,080 lamports (0.26529408 SOL)**. This is a baseline, not a fee guarantee; the bootstrap must fetch current rent and simulate each signed transaction before submission.

| Admin spend calculation | Lamports | SOL |
| --- | ---: | ---: |
| Already spent under persisted bootstrap accounting | 106,328,520 | 0.10632852 |
| Additional 12-profile rent + observed fee baseline | 265,294,080 | 0.26529408 |
| **Projected aggregate baseline** | **371,622,600** | **0.37162260** |
| Existing hard aggregate cap | 150,000,000 | 0.15000000 |
| **Baseline above cap** | **221,622,600** | **0.22162260** |
| Illustrative separate contingency for rent/fee changes or failed attempts, **not approved** | 10,000,000 | 0.01000000 |
| Aggregate with that illustrative contingency, **not approved** | 381,622,600 | 0.38162260 |

The public admin account held **3,816,010,520 lamports (3.81601052 SOL)** at confirmed slot **501210448**. Its balance is sufficient for the baseline, but balance does not override the persisted **0.15 SOL** spend guard in `packages/devnet-runtime/src/constants.ts` and `src/transactions.ts`. No cap, transfer, signer, or chain state changed in this preflight. The public RPC rate-limited a later attempt to read the faucet and attestor balances; those service balances and the private quota ledger remain unverified here.

## Work required before activation

1. Freeze the 15-profile mapping against the exact issuer-symbol/mint source list while labeling every devnet mint as synthetic. Preserve the existing three devnet mint addresses, policies, series, signer files, state steps, and `runtimeId`. Add an explicit versioned migration for the private signer map: simply extending `PROFILES` and the `signerNames` array would make `loadOrInitializeState` reject the saved `publicKeys` equality check. Keep the existing faucet/attestor keys distinct from the admin and from each other.
2. Add the 12 profiles to bootstrap and exact manifest validation. Before any transaction, verify all three old profiles, derive the 12 new addresses, confirm those addresses are unused, refresh current rent/fee estimates, and present the spend/cap decision. The current code refuses projected admin spend over **0.15 SOL**; increasing that cap or provisioning the 12 requires an explicit reviewed budget decision. Maintain signature persistence and reconciliation on retries. Publish the 15-asset manifest only after every onchain profile is complete and verified; a partial manifest would fail current hosted identity checks.
3. Scale synthetic observation refresh before exposing new profiles. The existing hosted service processes manifest assets sequentially, and its cron function has a **60-second** duration limit. The original three-profile batch took multiple invocations. Design and prove bounded, durable continuation so all 15 observations remain fresh under the 12-hour validity and existing six-hour scheduler. At 15 assets per six-hour run, the present **10,000-lamport reservation per refresh** consumes **600,000 lamports/day**. Even an unused **10,000,000-lamport lifetime cap** permits only 1,000 refresh reservations, or about **16⅔ days** at that cadence; current ledger usage shortens it. Any increased cap or attestor endowment needs a separate budget decision. Do not add a second scheduler or treat a stale observation as qualified issuer evidence.
4. Retain the existing faucet's **9,000,000-lamport reservation per grant**, 10 synthetic units, three grants per visitor/day, 12 per IP/day, 30 globally/day, 0.27 SOL/day, and 1 SOL lifetime until separately reviewed. These limits let one visitor fund only three of the 15 assets per day. Verify every new asset through hosted faucet, browser split and recombination, exact balances, finalized signatures, duplicate-grant handling, and cron refresh before publishing the updated site. The separate `/demos/` sandbox has its own three-profile catalog and is outside this public-devnet expansion.

The 2027 series use real chain time: deposits close on 1 January 2027 UTC. Adding test profiles does not provide annual redemption, issuer settlement, or live issuer custody.
