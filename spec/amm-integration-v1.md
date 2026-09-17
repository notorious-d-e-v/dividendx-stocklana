# Raydium claim integration v1

17 September 2026. Implements the next accepted [work order](../planning/phase-work-orders.md) without changing the annual program or the running wallet app. [AMM feasibility](../planning/research/claim-amm-feasibility.md) explains the venue choice.

## Execution contract

- One Raydium CPMM pool pairs an exact annual DR mint with a separate six-decimal, worthless DividendX test quote mint. Neither quote units nor their seeded ratio represent dollars, USDC, a dividend forecast or a market valuation.
- Use a controlled eight-decimal Token-2022 Scaled UI Amount collateral mint. The existing DividendX program must custody collateral and issue ordinary SPL PT/DR through its real deposit instruction. No direct claim faucet or copied issuer branding.
- Create the next calendar-year series from chain time (2027 for this run). Deposits close at January 1 under the unchanged program. Public devnet cannot accelerate annual maturity.
- A provider deposits 100 test stock units, retains PT and supplies 40 DR plus 80 test quote units as an explicit artificial initial ratio. Add up to 60 DR plus 120 quote units proportionally, let a buyer spend 20 quote units on DR, withdraw all provider LP, then recombine wallet DR with matching retained PT. Record any unspent add-liquidity amounts separately from recovered inventory. Amounts and raw-unit conversions are recorded in the execution report; different decimals are never treated as equal raw quantities.
- The provider, buyer, DR mint, quote mint and LP mint remain distinct. LP does not redeem against DividendX; Raydium withdrawal must return DR first. The test buyer's tokens and pool residuals remain backed.

## Network and authority boundaries

Devnet is the public target. Require its exact genesis hash, the reviewed Raydium devnet CPMM program, an enabled program-owned config and the canonical fee receiver. Read current fees immediately before creation and enforce a bounded test-SOL budget. Reject mainnet. Read pool state directly from RPC; do not depend on a mainnet indexer or claim a Raydium website listing.

The parent manages public deployment and signing under the user's authorization to continue the planned test integration. Use a dedicated ignored devnet signer, never the user's default wallet. Verify the DividendX executable, deployed ELF and upgrade authority before initializing its config. Keep existing deployment domain and admin ownership explicit; refuse to overwrite an unexpected deployment/config.

If public funding or infrastructure is unavailable, execute against a separate local validator using genuine Raydium devnet bytecode and cloned config/fee accounts. Record source slot, account identities and bytecode digest. That proves integration with the captured deployment, not public-network execution or reproducible source-to-binary equivalence. Do not simulate AMM balances or reuse the user's running demo network.

## Transactions and accounting

Simulate before submission, confirm each transaction and preserve signatures, slots, exact mint/program/config identities, quantities and balance checkpoints. Token creation and custody setup count as real test transactions, not live issuer qualification. Fail on invalid program/mint ownership, disabled creation, unexpected decimals, nonpositive quotes or unreasonable slippage. Never substitute an unbounded swap or zero minimum output when quoting fails.

Reconcile raw units after recombination:

- Remaining PT supply = remaining DR supply = DividendX accountable collateral = vault collateral, for this prefinal flow without donations or external burns.
- DR supply = all known wallet DR plus actual Raydium DR vault inventory, including protocol/fund fees and locked-liquidity residuals.
- Provider holds no minted LP after withdrawal; Raydium's internal locked LP supply remains. Residual DR is not surplus and cannot be swept.
- Buyer keeps actual purchased DR. Recombination burns equal recovered PT/DR and returns the same raw collateral. Every outstanding claim remains backed.

Check exact deltas for seed/add/swap/withdraw, not just transaction success. Preserve slippage bounds and report the quote spent, DR received, recovered inventory and remaining reserves. Use bigint arithmetic for balances and conservation.

## Acceptance and limits

Deliver an isolated Node integration package, reproducible commands, meaningful guard/accounting tests and a dated receipt report. Keep the existing app, runtime, approved artwork and slides unchanged in this slice. A later UI step can consume the tested integration.

Actual create, add, swap, withdraw and paired recombination on the selected execution network are the acceptance target. Independent post-maturity redemption stays a separate existing local proof. This slice does not establish live issuer custody, a complete qualified dividend journal, price discovery, rewards, production safety or mainnet readiness.
