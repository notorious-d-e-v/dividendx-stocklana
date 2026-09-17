# DeFi demo sequence

17 September 2026. Product decision following the user's request for a separate guided demo page. This is a shortlist, not proof of additional integrations.

| Order | Demo | Why it is useful | Gate |
|---|---|---|---|
| 1 — current build | DR liquidity, purchase and redemption | Two wallets show the entire ownership path, including exiting LP and redeeming different rights | Genuine Raydium execution and exact residual backing; [contract](../../spec/guided-demos-v1.md) |
| 2 — planned | Trade Stock exposure (PT) | Makes both sides' composability concrete using the same familiar market actions | A separately verified PT pool, independent pricing and backing; the existing DR proof does not prove a PT market |
| 3 — research | Borrow against Stock exposure (PT), repay and withdraw | Shows using a claim without selling it | Permissionless market creation, actual reserve admission, defensible price feed, liquidation liquidity and maturity/finalization behavior |

The first demo uses a local chain with real programs, controlled test assets and four synthetic dividends. Its initial DR/test-quote ratio is an arbitrary experiment input. The already finalized public devnet proof remains separate and ends in paired recombination before the 2027 term.

Raydium's official [CPMM documentation](https://docs.raydium.io/products/cpmm) identifies pool creation, deposit, withdrawal and swaps as its core actions. Our current execution evidence is more specific: exact captured/devnet program identities, classic SPL claims, disabled creator fees and raw-unit accounting. Do not infer support for every Token-2022 extension from a general overview.

For lending, Kamino's [V2 announcement](https://gov.kamino.finance/t/introducing-kamino-lend-v2/58) describes permissionless market creation and a manager SDK. This establishes a candidate to investigate, not an enabled DividendX reserve or a tested present-day deployment. Its current [borrowing concepts](https://kamino.com/docs/products/borrow/concepts) describe per-asset reserves and collateral/liquidation thresholds. Permissionless borrowing from an existing market is different from permissionlessly admitting our new claim mint.

Save's official [permissionless-pool documentation](https://docs.save.finance/permissionless-pools/introduction) describes isolated markets and makes the creator responsible for price oracles and liquidators. That page is older documentation; recheck the deployed program, supported tooling, oracle interfaces and creation path before selecting it. No loan has been executed in this repository.

Our engineering inference: start any lending investigation with PT, whose story is borrowing against retained stock exposure. Neither PT nor DR can simply use the whole stock's spot price as its oracle price. DR is a claim on a finite dividend stream; PT excludes that allocation. Both depend on exact issuer/mint/year and finalization state. A newly seeded thin AMM pool is not sufficient evidence of a robust liquidation price. Avoid rewards, leverage loops and a new custom lending program merely to enlarge the demo list.

Keep venue names and unsupported actions out of enabled UI controls. The guided page can say “Trade stock exposure” and “Borrow against stock exposure” under **Planned**, with the latter explicitly subject to market and pricing support. Future demos must pass an actual transaction round trip before becoming playable.
