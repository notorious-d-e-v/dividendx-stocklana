# Guided tour v3 — local review

The 19 September revision introduces DivX before its DeFi integrations. Keep the approved brand and the separate `/demos/` route. The user explicitly requested local review before any Git push, production deployment, or hosted snapshot replacement. The public site continues to run the accepted v2 journey until that review is complete.

## Page and actions

The hero reads “One tokenized stock. Two separate tokens.” Its “Start guided tour” button scrolls to Part One without submitting a transaction. The hosted sandbox creation gate remains a separate explicit action.

Part One teaches the core round trip:

1. Choose Coca-Cola / TestKOx / xStocks, Micron / TestMU / Backpack/Trek, or IBM / TestIBMon / Ondo. These are synthetic test profiles, not issuer-issued assets or proof of qualified issuer settlement. Preparing the chosen profile fixes it for this run and creates empty stock/claim accounts.
2. Get 100 test stocks from the local faucet. This is not a purchase from a live market.
3. Split 100 into 100 PT and 100 DR. Blue principal and orange dividend cards explain stock exposure and the 2027 dividend claim. DR quantity is not the dividend payout amount.
4. Recombine 40 matching PT/DR pairs, then the remaining 60. Show observed balances after both transactions. This paired exit is distinct from independent redemption after finalization.

An explicit continuation leads to Part Two: split the restored 100 stocks, open and add to the existing Raydium DR/Test USDC pool, let the second demo wallet buy DR, withdraw liquidity, recombine recovered pairs, advance the synthetic year, and redeem each owner's remaining claim independently. Preserve locked-pool residual backing.

Finish with the existing future-demo roadmap. Do not implement additional venues. Keep evidence and exact accounting collapsed, with plain-language action feedback and contextual balances above them.

## Execution contract

Guided state and receipts use schema version 3. Start requires an allowlisted `assetId`; selection is immutable for that run. Fixed steps prepend `fund-stock`, `core-split`, `core-recombine-partial`, and `core-recombine-rest` to the existing nine-action sequence. Never repeat a mutation after an uncertain response; reconcile with reads.

Stock and claim decimals match the program's selected profile: 8 for TestKOx, 6 for TestMU, and 9 for TestIBMon. Expose `claimDecimals` explicitly and scale Raydium amounts accordingly. Use exact integers, actual compiled DivX instructions, and observed token balances. No core program or SDK change is required.

Subtle Motion transitions support orientation and completion feedback. Respect reduced-motion settings, maintain keyboard navigation, avoid focus loss during polling, and prevent duplicate submissions.

## Review gates

Verify the full core and Raydium journeys with actual isolated runtime execution, including all three decimal profiles; test partial/full recombination conservation and failed/stale/out-of-order inputs. Check desktop/mobile layout, scroll-only entry, issuer choice, progression, reload, errors, reduced motion, and hosted expiry controls. Preserve the original approved QA image and local wallet runtime.

A later hosted release must update the code-only runtime snapshot and its manifest together with the website, gateway, and broker version checks. An ordinary frontend deployment against the existing v2 snapshot is insufficient. No such release is authorized by this local-review request.
