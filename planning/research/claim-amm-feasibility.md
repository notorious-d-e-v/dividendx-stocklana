# Claim-token AMM feasibility

> Annual-series update: the pool asset is one specific issuer/mint/year claim. Independent redemption waits for maturity and finalization of the complete annual journal. The finalized public proof uses a synthetic 2027 DR and a worthless test quote; it does not prove a live issuer pool. See [annual accounting](../../spec/annual-series-accounting.md).

Checked 16 September 2026 against official Solana, Raydium and Meteora documentation and repositories, then updated 17 September with the accepted execution. The venue research selected the implementation; the resulting test-only pool does not prove that real stock collateral is admissible.

### Annual execution boundary — 17 September

The [read-only devnet check](../evidence/amm-devnet-preflight-2026-09-17.json) at finalized slot 499734988 is preserved as pre-deployment history: Raydium was executable and the DivX program ID was then absent. DivX was subsequently deployed at the same accepted ELF hash, and the [public round-trip receipt](../evidence/amm-devnet-roundtrip-2026-09-17.json) records 15 finalized transactions at slots 499760641–499761026, independently rechecked at finalized slot 499762083. The [AMM review](../amm-review.md) records the complete boundary.

A newly funded annual series cannot both accept deposits and reach maturity during this hackathon on public devnet. Deposits close at year-start and the public chain clock cannot be advanced. The completed proof therefore uses an open 2027 series, creates/adds/swaps/withdraws liquidity, then **recombines recovered DR with matching retained PT**. It preserves backing for the buyer's and AMM's remaining claims. Post-maturity independent redemption remains a separate controlled-local proof; those are different networks and claims. No deposit was backdated, no term was shortened, and no production clock bypass was added. The post-finalization steps below describe the eventual full lifecycle rather than the completed public run.

## Decision

**Completed one Raydium CPMM DR/private-test-quote pool on Solana devnet for the hackathon.** PT and DR use the original SPL Token Program as ordinary transferable fungible tokens. The separate quote token is worthless DivX test money, never USDC or dollar-backed. The run seeded DR against that quote at an explicitly configured artificial basis, added liquidity, executed a small purchase, received and withdrew the separate Raydium LP token, then recombined recovered DR with retained matching PT. Independent mature-series redemption remains a separate local proof. The [execution contract](../../spec/amm-integration-v1.md) also produced a clearly labeled 14-transaction local proof against captured genuine Raydium devnet bytecode.

This is feasible without putting the Token-2022 stock mint into Raydium. The AMM's assets are the DR and private quote mints. The Scaled UI Amount collateral remains in the DivX vault. Raydium CPMM's mint check accepts legacy SPL Token mints; its stricter extension allow-list applies only when a pool asset itself is Token-2022. CPMM `Initialize` is permissionless for supported mints. These facts support the integration; they do not validate the vault's backing, the issuer's custody policy, or the event.

A DR/test-quote pool directly demonstrates selling dividend rights while the holder retains PT. The initial price is seeded demo data, not an observed market price, stock valuation or dividend valuation. Store the exact quote quantity and DR quantity used to establish it; do not imply dollar parity or hardcode a price discovered from a prior run. A PT/DR pool may remain an optional wiring experiment, but it is not the main demo: equal PT/DR issuance does not imply equal economic value, so a 1:1 PT/DR pool would communicate a false price relationship.

## What the end-to-end proof means

1. Deposit qualified **test** Token-2022 collateral into the DivX series vault and mint equal raw units of classic SPL PT and DR.
2. Transfer a small claim amount between wallets to prove ordinary token portability.
3. Mint the private test-quote token with six decimals, fund the demo buyer/provider, and disclose that it has no value, issuer or redemption right.
4. Create one devnet Raydium CPMM DR/test-quote pool. Seed 40 DR against 80 quote at the explicit artificial basis and retain the LP token in the provider's wallet.
5. Add 60 DR and 120 quote proportionally, then have the buyer spend 20 quote for the exact quoted `9.07024323` DR.
6. Burn the provider's Raydium LP tokens with `Withdraw` to recover the current pro-rata DR/test-quote mix.
7. Recombine recovered wallet DR with retained matching PT, returning the same raw Token-2022 collateral under the existing prefinal rule. Keep collateral reserved for outstanding buyer and AMM claims. For a future publicly matured and finalized series, wallet DR and PT can instead redeem independently; that is not achievable for a newly funded annual series during this hackathon.

The Raydium LP token is neither PT nor DR and has no DivX redemption right. CPMM withdrawal burns LP and returns DR plus test quote pro rata. LP fees and trades change the amounts recovered, and providing liquidity creates inventory and impermanent-loss risk.

The public proof ends when the user recombines recovered DR with matching PT. It does **not** assert that the pool or series globally empties. CPMM permanently includes 100 locked LP base units in `lp_supply` that are never minted to the creator, so withdrawing every user-held LP token still leaves a small amount of pool inventory. The completed pool retains 643 DR raw and 8,016 quote raw, including 6,000 protocol and 2,000 fund-fee raw. That DR remains part of the outstanding supply and retains its claim on DivX collateral. Final PT supply, DR supply and vault backing each equal `907024966` raw. Preserve that backing and never sweep the residual DR as protocol surplus.

Staking is outside this route. A transferable claim or LP token is not automatically staked, and no reward program is created by CPMM. Raydium also says farm deployments are not reliable on devnet.

## Why Raydium CPMM

| Option | Feasibility | Hackathon fit |
|---|---|---|
| Raydium CPMM | Permissionless `Initialize`; classic SPL mints pass; constant-product pool has one fungible LP mint; official SDK v2 covers create, deposit, swap and withdraw; deployed devnet program is documented. | **Chosen for DR/test-quote.** Fewest concepts and the cleanest visible dividend-sale, LP-withdraw and recovered-DR recombination sequence. No OpenBook market is needed. |
| Meteora DLMM | Current v2 creation supports SPL Token and Token-2022 and the SDK documents devnet. Liquidity is held in bin-based `PositionV2` accounts, with position/range/bin-array setup and removal/close flows. | Feasible, but concentrated-liquidity positions and rent quoting add work unrelated to the claim-token thesis. Keep as a later adapter. |

Meteora exposes the same DLMM program ID for mainnet-beta and devnet, plus a separate `localhost` SDK ID for its local harness. Its public TypeScript SDK has current v2 pool, liquidity, swap and removal builders. The deployed program source is not public; Meteora directs integrators to the IDL, SDK and onchain state. None of that blocks classic SPL claims, but it makes DLMM a less bounded first proof.

## Mint and pool prerequisites

- PT and DR use the original SPL Token Program, the collateral mint's decimal count, and no Token-2022 extensions. The DivX PDA is mint authority; the production decision should remove or tightly constrain freeze authority so “ordinary transferable” remains true. Metadata is optional and separate from transfer semantics.
- The private test-quote mint also uses the original SPL Token Program. Give it an unmistakable test-only name/symbol, six decimals and no suggestion of parity, reserves or affiliation with Circle/canonical USDC. Its demo mint authority and seeded balances are test infrastructure, not protocol collateral.
- Each series has distinct PT and DR mint addresses. Pool identity must bind the exact series DR mint and exact private quote mint; ticker labels are insufficient. PT is not deposited into the chosen pool.
- The provider needs positive DR and test-quote balances plus devnet SOL. CPMM initialization requires both initial amounts and rejects initial liquidity whose square-root LP amount is below 100 raw LP units. The first 100 LP base units are permanently locked and leave residual inventory after all user-held LP is withdrawn.
- The pool creator pays the configured `create_pool_fee`, transaction fees, rent for pool state, LP mint, two vaults, observation state and the creator's LP token account, plus the seeded DR and test quote. The quote mint and its participant token accounts add small rent/transaction costs. Later liquidity additions require both assets in the pool ratio and transaction/account costs.
- The mainnet CPMM config API returned `150000000` lamports (0.15 SOL) for the public tiers on the check date. This is only the protocol creation fee, not rent, transactions or seed liquidity. Config is admin-mutable. Fetch the chosen cluster's `AmmConfig` and fee immediately before building a transaction; do not hardcode 0.15 SOL for devnet or a later run.
- Raydium publishes devnet CPMM program `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb` and a devnet API base. Verify program, config and fee-receiver accounts live before signing. Use the SDK's devnet constants and RPC pool reads; the official demo repository warns that its API pool/farm lookup is mainnet-only and directs devnet integrations to RPC methods.

## Network and tooling boundary

**Devnet is the completed public integration target.** Solana describes it as a public development cluster with possible ledger resets and rate-limited public RPC. The finalized receipt proves interaction with Raydium's published CPMM program while every asset remains a worthless test asset.

**Local validator remains a separate test harness.** The accepted 14-transaction receipt uses the captured 742,640-byte genuine Raydium devnet loader payload plus cloned config/fee accounts. It proves wiring against that captured deployment boundary. The 15-transaction devnet receipt separately proves interaction with Raydium's published deployment.

**Mainnet is deferred.** It would require real SOL, real seed liquidity, a deployed DivX program, qualified real collateral custody and event evidence. Nothing in an AMM success establishes those conditions.

Raydium's official CPMM examples currently target `@raydium-io/raydium-sdk-v2@0.2.64-alpha`; the docs say signatures were rechecked on 9 September 2026 and last executed on mainnet against an earlier alpha. Pin the exact package version, use RPC reads on devnet, simulate every transaction and record program/config/pool addresses and signatures. Do not treat alpha SDK ergonomics or indexer discovery as protocol guarantees.

## Completed inputs and remaining dependencies

- **Program and mints — completed test boundary:** the accepted program ELF is deployed on devnet, and the receipt records the exact synthetic collateral, series, PT, DR, quote and LP mints. Claim freeze authorities are null and conservation checks pass. This is not a qualified issuer mint set.
- **Collateral fixture — completed test boundary:** the run used an eight-decimal Token-2022 Scaled UI Amount test-stock mint. It demonstrates the custody/profile path, not issuer approval or live reserves.
- **Event and settlement — still unresolved for issuers:** the open 2027 series has zero events. The AMM flow invents no dividend, does not finalize a journal and does not enable live settlement.
- **Raydium state and funding — completed test boundary:** executable/config/fee identities and fees were checked immediately before execution. Dedicated devnet SOL paid deployment and pool costs; mainnet funding remains deliberately unsatisfied.
- **Artificial ratio — recorded:** 40 DR / 80 quote seeded the pool, followed by 60 DR / 120 quote. This is an experiment input, not fair value, historical observation or a live quote.
- **Execution record — completed:** the receipt preserves cluster, program/config, series, mint, pool, LP and transaction identities. Pool `2yhUcyx6jawJo9z5YMqFQgmxmvvE6Qz1g1zmDQjVH5Cm` is read directly from RPC; no Raydium UI/indexer listing is claimed.
- **Residual accounting — completed:** after all user LP was withdrawn and paired claims were recombined, the independently rechecked state has buyer DR `907024323`, pool DR `643`, and vault/PT/DR supply `907024966` raw each. No residual sweep exists.
- **Wallet UX — next:** expose the validated flow in `/app/`, label PT, DR, private test quote and LP separately, and retain the no-value/no-staking language. The separate guided walkthrough page remains deferred.

## Primary sources

- Solana: [SPL Token basics](https://solana.com/docs/tokens/basics), [clusters and devnet](https://solana.com/docs/references/clusters), [local validator/program deployment](https://solana.com/docs/programs/rust).
- Raydium: [CPMM overview](https://docs.raydium.io/products/cpmm), [instruction reference](https://docs.raydium.io/products/cpmm/instructions), [Token-2022 support matrix](https://docs.raydium.io/reference/token-2022-support), [program addresses](https://docs.raydium.io/reference/program-addresses), [CPMM SDK demos](https://docs.raydium.io/products/cpmm/code-demos), [official SDK demo repository](https://github.com/raydium-io/raydium-sdk-V2-demo), [open-source CP-Swap](https://github.com/raydium-io/raydium-cp-swap), [live mainnet CPMM configs](https://api-v3.raydium.io/main/cpmm-config).
- Meteora: [DLMM developer overview](https://github.com/MeteoraAg/docs/blob/main/developer-guides/dlmm/index.mdx), [official TypeScript SDK examples](https://github.com/MeteoraAg/docs/blob/main/developer-guides/dlmm/typescript-sdk/examples.mdx), [official TypeScript SDK reference](https://github.com/MeteoraAg/docs/blob/main/developer-guides/dlmm/typescript-sdk/reference.mdx), [official pool-setup examples](https://github.com/MeteoraAg/dynamic-amm-examples).
