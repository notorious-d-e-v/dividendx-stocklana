# Product app v1: split and redeem

> Historical approved design and single-event behavior. The [annual product contract](annual-product.md) supersedes term identity, copy, client and lifecycle assumptions while retaining this visual system and navigation.

16 September 2026. User feedback supersedes the main UI in `frontend-rehearsal.md`; preserve that rehearsal as a separate page. The user wants the hackathon to deliver actual vault custody, transferable PT/DR tokens and redemption. A local simulation is a fallback and design foundation, not the final build target.

## Immediate deliverable

Keep the original rehearsal at `/rehearsal/`. Make `/` the simpler product preview, with independent in-memory state. Preserve approved design tokens, artwork, original rehearsal source/behavior, evidence, SDK math, pitch and narration. A quiet but unambiguous banner says `Interactive preview · test balances` and explains that no tokens or transactions are onchain yet. Put reset and simulation controls in a collapsed footer panel. No real wallet connection or deployment belongs in this revision.

Navigation: **Market / Split / Redeem**. Default perspective is `Your test balance` (the SDK seller). The buyer only appears when needed, named `Dividend buyer`, inside optional demo controls. Do not make users follow both accounts to split/recombine. No `Positions` page or event replay step in the primary flow.

### Market

Six visibly distinct company sections. Each company is a full-width heading band with company name, underlying ticker and small `Company` label; underneath is a clearly subordinate area labeled `Available stock tokens` containing token/issuer rows or compact tiles. Use spacing, background and type hierarchy so Coca-Cola is never a peer tile alongside KOx/KOon. Preserve all 15 exact tokens and search/issuer filters. Source-qualified examples say `Try split`; other candidates say `Dividend data pending` with a concise reason. A demo-capable badge is not a live-support badge.

### Split

Lead with `One stock. Two tokens.` Show selected company, issuer and stock token, amount field, `Your test balance`, and one **Split** action. Main result: `You deposit [stock amount]` and `You receive [amount] PT + [amount] DR`. PT = `Stock exposure`; DR = `Dividend rights`. Both minted quantities are `pairedClaimRaw` formatted using collateral decimals; they are not the post-event collateral allocation amounts. Show readable precision, and exact amounts in optional details. The equal claim quantities can differ from the entered scaled stock amount; keep that explanation available in details without cluttering the main flow.

Explain the two assets in one short sentence each. Claim identity includes issuer, stock and series, even when the display ticker is PT/DR. Use the approved stock/coupon illustration. Historical dates, price context, event factors and source inspectors belong under `Details & sources`, not a technical left-hand workflow.

After split, show `Your tokens` with PT and DR quantities and a clear **Redeem** action. A compact `Use your tokens` area may explain transfer, trade and providing liquidity. These are planned capabilities until onchain tokens and actual integrations exist. Do not fabricate staking yield, pools, active integration badges or success from disabled actions. If showing actions, visibly label their availability and explain the missing dependency. Staking requires an actual accepting/reward protocol and is not an intrinsic token feature.

### Redeem

Use two understandable modes based on the selected series state:

- **Combine PT + DR:** while open/closed before settlement, combine matching claims from the same issuer/mint/event and receive the underlying stock token. Use the existing `recombine` method. Show each owned claim balance, a single paired amount, fractional/Max controls, and the stock received using the correct event clock factor. Compute capacity as `min(ownedPT,ownedDR)`. After a partial dividend sale, only the matching remainder can be combined; never release the sold dividend's backing. Exact Max operates on bigint balances, not rounded text. Recombining all cancels the current fixture series; offer a clearly labeled reset to try again.
- **Redeem tokens:** once settled, show PT and DR separately with amount, Max/50% controls and actual underlying payout from `previewRedemption`. Each side redeems on its own; no need to buy the other side back. A holder lacking a claim sees zero balance, not someone else's redeem button. Both sides pay in the underlying stock token. PT does not promise fixed dollars.

Display friendly empty, success and completed states. Multiple series must stay distinct. All amounts, mutations and ownership come from the existing SDK, with no duplicate ledger in React. Use typed errors, loading state and disabled controls when unavailable.

### Optional preview controls

Collapsed at the bottom, clearly described as simulation controls. Provide `Show dividend payout ready` to close/settle an existing open series, handling closed-but-unsettled retries. It is explicitly a simulation; no user-facing replay task in the main flow and no automatic claim of a chain event. Keep original historical event facts in details. Account switching and a simple seeded dividend-sale scenario can live here to inspect partial ownership. Preserve the richer sale/rejection/error rehearsal at `/rehearsal/`. A direct link to that page is sufficient for scenarios not repeated in the product preview.

## Verification

Build both entry points. Existing rehearsal behavior/tests must work at `/rehearsal/` with source changes limited to entry wiring or an unobtrusive return link. New browser tests cover company-child hierarchy; mint quantities versus allocation; split→partial/full recombination; optional paid partial sale then recombination limited to retained DR; closed/settled state redemption; independent buyer redemption; pending Ondo; honest capability labels; reset; keyboard; no overflow at 1440/390. Inspect product Market/Split/Redeem desktop/mobile screenshots. Verify no hidden replay control becomes a required main-flow step, no links imply live pools and no credentials enter the bundle.

## Next build target

Implement a Solana program with isolated issuer/mint/event vaults, PDA custody, actual PT/DR mints, wallet-signed deposit/split and recombination, trusted event settlement, independent redemption and permissionless claim transfer. Keep real stock acceptance contingent on token-extension/custody checks and event evidence. Demonstrate with local-validator/devnet test collateral and real transaction receipts before enabling real funds. Then verify one concrete AMM pool path for the chosen claim mint standard, show LP ownership, withdraw liquidity and redeem recovered claims. Raydium/Meteora feasibility is to be checked against their current interfaces and deployed networks. No claim that every pool/venue automatically accepts the tokens. Broader markets and staking are follow-on integrations.
