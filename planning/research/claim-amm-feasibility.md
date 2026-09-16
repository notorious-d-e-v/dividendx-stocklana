# Claim-token AMM feasibility

Checked 16 September 2026 against official Solana, Raydium and Meteora documentation and repositories. This is a bounded integration decision, not a deployed pool or proof that real stock collateral is admissible.

## Decision

**Use one Raydium CPMM DR/private-test-USD pool on Solana devnet for the hackathon.** Mint PT and DR with the original SPL Token Program as ordinary transferable fungible tokens. Mint a separate, worthless quote token named and labeled as DividendX test money; never call it USDC or use canonical-USDC branding. Seed DR against that quote at an explicitly configured demo consideration basis, execute a small purchase, add liquidity, receive the separate Raydium LP token, withdraw it, then redeem the recovered DR after the DividendX series settles.

This is feasible without putting the Token-2022 stock mint into Raydium. The AMM's assets are the DR and private quote mints. The Scaled UI Amount collateral remains in the DividendX vault. Raydium CPMM's mint check accepts legacy SPL Token mints; its stricter extension allow-list applies only when a pool asset itself is Token-2022. CPMM `Initialize` is permissionless for supported mints. These facts support the integration; they do not validate the vault's backing, the issuer's custody policy, or the event.

A DR/test-USD pool directly demonstrates selling dividend rights while the holder retains PT. The initial price is seeded demo data, not an observed market price, stock valuation or dividend valuation. Reuse the rehearsal's explicit seeded-sale consideration as a fixture input after relabeling the quote asset, and store the exact quote quantity and DR quantity used to establish it; do not hardcode a price discovered from a prior run. A PT/DR pool may remain an optional wiring experiment, but it is not the main demo: equal PT/DR issuance does not imply equal economic value, so a 1:1 PT/DR pool would communicate a false price relationship.

## What the end-to-end proof means

1. Deposit qualified **test** Token-2022 collateral into the DividendX series vault and mint equal raw units of classic SPL PT and DR.
2. Transfer a small claim amount between wallets to prove ordinary token portability.
3. Mint the private test-USD quote token with six decimals, fund the demo buyer/provider, and disclose that it has no value, issuer or redemption right.
4. Create or use one devnet Raydium CPMM DR/test-USD pool. Seed it using the fixture's explicit demo consideration basis and retain the LP token in the provider's wallet.
5. Buy a small DR amount with test-USD, then add proportional DR/test-USD liquidity and show the resulting LP balance.
6. Settle the DividendX series. Burn the user's Raydium LP tokens with `Withdraw` to recover the current pro-rata DR/test-USD mix.
7. Redeem recovered wallet DR for its Token-2022 collateral allocation. PT stays separate and may be redeemed independently to complete the product demonstration.

The Raydium LP token is neither PT nor DR and has no DividendX redemption right. CPMM withdrawal burns LP and returns DR plus test-USD pro rata. LP fees and trades change the amounts recovered, and providing liquidity creates inventory and impermanent-loss risk.

The proof ends when the user redeems the DR recovered to that wallet. It does **not** assert that the pool or series globally empties. CPMM permanently includes 100 locked LP base units in `lp_supply` that are never minted to the creator, so withdrawing every user-held LP token still leaves a small amount of pool inventory. Accrued protocol and fund-fee inventory can remain as well. Any DR left in Raydium remains part of the outstanding DR mint supply and retains its claim on DividendX collateral. Preserve backing for it, report remaining supply and vault balances, and never sweep the pool's residual DR as protocol surplus.

Staking is outside this route. A transferable claim or LP token is not automatically staked, and no reward program is created by CPMM. Raydium also says farm deployments are not reliable on devnet.

## Why Raydium CPMM

| Option | Feasibility | Hackathon fit |
|---|---|---|
| Raydium CPMM | Permissionless `Initialize`; classic SPL mints pass; constant-product pool has one fungible LP mint; official SDK v2 covers create, deposit, swap and withdraw; deployed devnet program is documented. | **Chosen for DR/test-USD.** Fewest concepts and the cleanest visible dividend-sale, LP-withdraw and recovered-DR redemption sequence. No OpenBook market is needed. |
| Meteora DLMM | Current v2 creation supports SPL Token and Token-2022 and the SDK documents devnet. Liquidity is held in bin-based `PositionV2` accounts, with position/range/bin-array setup and removal/close flows. | Feasible, but concentrated-liquidity positions and rent quoting add work unrelated to the claim-token thesis. Keep as a later adapter. |

Meteora exposes the same DLMM program ID for mainnet-beta and devnet, plus a separate `localhost` SDK ID for its local harness. Its public TypeScript SDK has current v2 pool, liquidity, swap and removal builders. The deployed program source is not public; Meteora directs integrators to the IDL, SDK and onchain state. None of that blocks classic SPL claims, but it makes DLMM a less bounded first proof.

## Mint and pool prerequisites

- PT and DR use the original SPL Token Program, the collateral mint's decimal count, and no Token-2022 extensions. The DividendX PDA is mint authority; the production decision should remove or tightly constrain freeze authority so “ordinary transferable” remains true. Metadata is optional and separate from transfer semantics.
- The private test-USD mint also uses the original SPL Token Program. Give it an unmistakable test-only name/symbol, six decimals and no suggestion of parity, reserves or affiliation with Circle/canonical USDC. Its demo mint authority and seeded balances are test infrastructure, not protocol collateral.
- Each series has distinct PT and DR mint addresses. Pool identity must bind the exact series DR mint and exact private quote mint; ticker labels are insufficient. PT is not deposited into the chosen pool.
- The provider needs positive DR and test-USD balances plus devnet SOL. CPMM initialization requires both initial amounts and rejects initial liquidity whose square-root LP amount is below 100 raw LP units. The first 100 LP base units are permanently locked and leave residual inventory after all user-held LP is withdrawn.
- The pool creator pays the configured `create_pool_fee`, transaction fees, rent for pool state, LP mint, two vaults, observation state and the creator's LP token account, plus the seeded DR and test-USD. The quote mint and its participant token accounts add small rent/transaction costs. Later liquidity additions require both assets in the pool ratio and transaction/account costs.
- The mainnet CPMM config API returned `150000000` lamports (0.15 SOL) for the public tiers on the check date. This is only the protocol creation fee, not rent, transactions or seed liquidity. Config is admin-mutable. Fetch the chosen cluster's `AmmConfig` and fee immediately before building a transaction; do not hardcode 0.15 SOL for devnet or a later run.
- Raydium publishes devnet CPMM program `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb` and a devnet API base. Verify program, config and fee-receiver accounts live before signing. Use the SDK's devnet constants and RPC pool reads; the official demo repository warns that its API pool/farm lookup is mainnet-only and directs devnet integrations to RPC methods.

## Network and tooling boundary

**Devnet is the public integration target.** Solana describes it as a public development cluster with faucet SOL, possible ledger resets and rate-limited public RPC. It supplies third-party Raydium program receipts while keeping all assets worthless test assets.

**Local validator is a test harness, not the venue proof.** Raydium CP-Swap is open source and its official repository runs `anchor test`, so a pinned build can be deployed locally with the required config and fee accounts. A vanilla local validator does not contain Raydium. Local success proves instruction wiring against that build; devnet success proves interaction with Raydium's published deployment.

**Mainnet is deferred.** It would require real SOL, real seed liquidity, a deployed DividendX program, qualified real collateral custody and event evidence. Nothing in an AMM success establishes those conditions.

Raydium's official CPMM examples currently target `@raydium-io/raydium-sdk-v2@0.2.64-alpha`; the docs say signatures were rechecked on 9 September 2026 and last executed on mainnet against an earlier alpha. Pin the exact package version, use RPC reads on devnet, simulate every transaction and record program/config/pool addresses and signatures. Do not treat alpha SDK ergonomics or indexer discovery as protocol guarantees.

## Dependencies still unresolved

- **Program and mints:** no DividendX devnet program, vault, series, PT mint, DR mint or private test-USD mint address exists yet. The next phase must deploy them and prove claim mint/burn authority, supply conservation, transfer and independent redemption.
- **Collateral fixture:** devnet cannot use the issuer's mainnet stock balance. Create a Token-2022 test mint with the selected collateral's relevant decimals and Scaled UI Amount profile, then run the same extension/custody policy checks. This demonstrates portability, not issuer approval.
- **Event and settlement:** choose one frozen qualified fixture and trusted test attestation path. The AMM flow should not invent a live dividend or change the series accounting.
- **Raydium live state:** confirm the devnet program is executable, select an enabled `AmmConfig`, fetch its current creation fee, verify the fee receiver and check whether the exact DR/test-USD pool already exists before creation.
- **Funding:** obtain enough devnet SOL for DividendX deployment, mint/account rent, CPMM creation and transactions, deposit enough test collateral to mint meaningful DR liquidity, and seed the private quote balance. Faucet/RPC limits may require a funded devnet wallet or private RPC. Mainnet funding is deliberately unsatisfied.
- **Demo price:** choose and record one explicit seeded DR/test-USD consideration basis from the demo fixture. It is an input to the experiment, not an inferred fair value, historical observation or live quote.
- **App data:** persist exact cluster, program IDs, series, PT/DR/test-USD mint addresses, pool address, LP mint and transaction signatures. Devnet discovery should read the known pool from RPC rather than imply Raydium UI/indexer listing.
- **Residual accounting:** after user LP withdrawal and wallet redemption, reconcile claim mint supply, AMM-held DR, user-held DR and DividendX backing. Keep collateral reserved for every unburned claim and provide no sweep path for AMM residuals.
- **UX truthfulness:** label the venue and cluster, show PT, DR, private test-USD and LP as four different assets, require LP withdrawal before DR redemption, show the recovered DR/test-USD mix and remaining global DR supply, and omit staking/reward language.

## Primary sources

- Solana: [SPL Token basics](https://solana.com/docs/tokens/basics), [clusters and devnet](https://solana.com/docs/references/clusters), [local validator/program deployment](https://solana.com/docs/programs/rust).
- Raydium: [CPMM overview](https://docs.raydium.io/products/cpmm), [instruction reference](https://docs.raydium.io/products/cpmm/instructions), [Token-2022 support matrix](https://docs.raydium.io/reference/token-2022-support), [program addresses](https://docs.raydium.io/reference/program-addresses), [CPMM SDK demos](https://docs.raydium.io/products/cpmm/code-demos), [official SDK demo repository](https://github.com/raydium-io/raydium-sdk-V2-demo), [open-source CP-Swap](https://github.com/raydium-io/raydium-cp-swap), [live mainnet CPMM configs](https://api-v3.raydium.io/main/cpmm-config).
- Meteora: [DLMM developer overview](https://github.com/MeteoraAg/docs/blob/main/developer-guides/dlmm/index.mdx), [official TypeScript SDK examples](https://github.com/MeteoraAg/docs/blob/main/developer-guides/dlmm/typescript-sdk/examples.mdx), [official TypeScript SDK reference](https://github.com/MeteoraAg/docs/blob/main/developer-guides/dlmm/typescript-sdk/reference.mdx), [official pool-setup examples](https://github.com/MeteoraAg/dynamic-amm-examples).
