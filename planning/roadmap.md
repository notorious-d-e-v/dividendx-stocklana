# Roadmap: fixed terms, transferable claims, rolling products

17 September 2026. The user supplied a side-chat discussion and explicitly deferred its additional products. This records direction, not implemented features or a change to the current annual program scope.

**Fixed-term protocol, transferable tokens, rolling user experience.** Annual issuer/mint/year series remain the settlement foundation. PT and DR can move between holders without changing their term or backing. The wallet and bounded Raydium transaction integrations are accepted. The separate guided page is now accepted under [guided demos v1](../spec/guided-demos-v1.md), with [browser and chain proof](guided-demo-review.md).

| Later item | Purpose | Conditions before implementation |
|---|---|---|
| Fixed-price dividend sale — Streamflow candidate | Agree a price for annual DR and exchange it for USDC | Verify arbitrary sale-mint acceptance, supported test network, payment/delivery, cancellation and redemption; no integration yet |
| Token locks and vesting — Jupiter Lock candidate | Release PT/DR units to another holder on a schedule | Classic SPL support and devnet executable observed; actual lock/claim round trip still required. Claims keep their whole annual entitlement; no cash-dividend streaming or automatic DividendX redemption |
| Shared treasury — Squads candidate | Shared approvals to hold, transfer and redeem PT/DR | Verify vault signing and actual claim withdrawal/redemption |
| Limit orders — Meteora candidate | Trade claims at selected prices | Supported and funded DLMM pool, enabled limit orders and exact-series market |
| Recurring purchases — Jupiter candidate | Accumulate PT/DR on a schedule | Routing, token/pricing support and explicit custody model; not automatic support for a new mint |
| Combined transactions | Split and sell DR, or buy missing DR and recombine with PT | Test atomic instruction composition, bounds and slippage; splitting remains pre-year only |
| PT trading demo — lower priority | Show that stock exposure can trade independently too | Separate tested PT market; existing DR evidence is not proof of PT execution |
| Borrowing demo | Borrow against stock exposure, repay and recover the claim | Verify permissionless venue admission, pricing, liquidation and term handling; [research shortlist](research/defi-demo-sequence.md) |
| Following-year series listed early | Give holders a clear next term when current-year deposits have closed | Reviewed pre-year corporate actions, opening/listing policy, useful liquidity and clear year selection; not midyear minting into the current term |
| Rolling DR vault | Let users hold one strategy share while the vault owns and trades annual vintages | NAV and entry/exit rules, execution limits, fees, late-finalization handling and available next-year liquidity; keep backing and rights separate from the annual vault |
| Direct vintage choice | Keep individual annual PT/DR available beside a rolling product | Clear balances, prices and risk by exact issuer/mint/year |
| Quarterly series | Offer shorter exposure where demand supports it | Evidence of enough trading depth to justify additional markets; explicit new term rules |
| Perpetual claim research | Explore an indefinite dividend product | Reliable event/revision feeds, fair entry/exit pricing, correction reserves, corporate-action recovery and sustained liquidity; no automatic migration of existing annual holders |

A rolling vault must purchase the next vintage or receive new capital under stated rules. Redemption of this year's DR does not grant next year's dividends for free. It also inherits the timing and price risks of the stock-token payouts and may need to hold overlapping years while old records finalize. This is a separately specified strategy product, not an exception to annual cutoff or redemption rights.

The user has prioritized [qualified issuer data and settlement](research/issuer-settlement-qualification-2026-09-17.md) over all additional guided integrations. `/demos/` mentions these possibilities as noninteractive future entries. Protocol names identify integration candidates, not partnerships or completed integrations. Current scope stays [annual program v1](../spec/program-v1.md). No rolling vault, quarterly series, perpetual token, reward token or bridge is implemented in this phase.
