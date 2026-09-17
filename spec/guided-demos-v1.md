# Guided DeFi demos v1

Current quote update: [Test USDC v1](guided-usdc-v1.md) governs new guided runs and the explicit public Circle mode. Earlier private-quote amounts below describe the preserved original proof/default CLI.

17 September 2026. The user authorizes a separate **`/demos/`** page. Market, Split and Redeem remain the core product. This slice exposes a repeatable, two-wallet Raydium journey; lending and other venues remain future demos.

## Product

Use the approved warm paper, ink, blue PT and amber DR design. Keep explanations short enough for a ninth grader. Show one current action, why it matters, the signing demo wallet, and both wallets' actual balances. Completed steps remain readable. Transaction addresses, journal details and source provenance belong in expandable evidence. Add a secondary Guided demos link to the existing app/preview without changing their main flow.

The first scenario is **Sell dividend rights through a market**. The visitor controls two disposable server-managed test wallets, **Stock holder** and **Dividend buyer**. These are distinct signers on the same local chain. No extension wallet is needed. Never request a private key or present the service as a user's connected wallet.

Prepare demo wallets, then advance one action at a time:

1. Split 100 test stock into 100 PT and 100 DR.
2. Open a Raydium DR market with 40 DR and 80 test quote.
3. Add 60 DR and 120 test quote as liquidity.
4. Buyer spends 20 test quote to buy DR through Raydium.
5. Stock holder removes all their LP liquidity.
6. Stock holder combines recovered DR with matching PT and receives stock back.
7. Advance the **local test year**, record four clearly synthetic dividend events, and finalize the annual journal.
8. Buyer redeems purchased DR for dividend-derived test stock.
9. Stock holder independently redeems remaining PT for test stock.

The action labels must distinguish withdrawing LP, recombining paired claims, and redeeming one side. LP tokens cannot redeem against DividendX. The buyer owns the dividends sold to them. Raydium's locked residual DR retains backing after both wallets finish; do not force an empty vault or call its reserve surplus.

Show a persistent concise boundary: **Local transactions · Test assets · Accelerated test year**. Details explain genuine captured Raydium devnet bytecode and the accepted DividendX program execute locally. Link separately to the completed public devnet proof. Never link local signatures to a public explorer, show seeded quote units as dollars/USDC, describe synthetic dividends as real company payouts, or imply this is live issuer custody. PT and DR quantities and stock redemption values are different measures; stock display uses its active scaled multiplier, with exact raw units in details.

## Runtime and contracts

New `packages/guided-runtime` on loopback port **4181**, separate from the running wallet runtime on 4180. It uses an offline Surfpool, accepted exact DividendX ELF, and full captured Raydium ELF hash plus exact public config/fee-account fixtures with provenance. Verify the real Raydium path on Surfpool before claiming it works. Keep existing CLI behavior and accounting checks intact when extracting reusable AMM steps. No program/IDL or transaction-SDK changes are intended.

The browser consumes the frozen types in `packages/guided-runtime/src/contract.ts`; it imports no Node runtime, Raydium SDK or signer material. Endpoints:

- `GET /state`: current public state; includes server runtime ID and revision even when idle.
- `POST /start`: `{runtimeId, expectedRevision}`; create fresh local chain and wallets. Only idle, complete or failed states accept a fresh run. Never reset a pending operation.
- `POST /step`: `{runtimeId, sessionId, expectedRevision, step}`; only the exact next step is accepted.
- `GET /receipt`: public provenance, submissions, confirmations and checkpoints for the current session. No secrets or filesystem paths.

Mutations use JSON plus `X-DividendX-Demo: 1`, accept only exact loopback browser origins on ports 4174 and 4184 (isolated QA), and enforce loopback Host, body limits and serialized state transitions. Return 202 immediately for work; poll `/state`. Repeated/stale revisions reject with 409 and never repeat a transaction. Terminal failures retain partial signatures, prohibit step replay and offer a fresh run. Restarted servers receive a new runtime ID; old browser actions cannot mutate a new session. No caller-supplied instructions, amounts, addresses, signer paths, remote RPC, or arbitrary network targets.

Keys stay in memory. Record submitted signatures before awaiting confirmation; store public progress/receipts atomically in ignored private local state. A process restart cannot resume its destroyed chain; retained evidence is historical only. Drain Surfpool's event buffer throughout and shut down only this runtime's own network. Preserve ports 4174/4180 and their existing session. The parent will publish the revised web build once reviewed.

## Acceptance

Every action executes signed program transactions, confirmed before becoming complete. Snapshot wallet, pool, series and vault accounts coherently. Retain all original AMM identity, fee, slippage, locked-LP and integer-conservation checks. After settlement, verify cumulative PT/DR redemption accounting and exact residual custody without sweeping pool-owned claims. Use explicit forward Clock control only on the isolated local chain.

Cover ordering, duplicate/stale calls, disallowed origins, unavailable runtime, partial failures, refresh/reconnect, actual full-chain journey, and desktop/mobile/keyboard behavior. Browser-mocked state tests prove presentation only; a separate real browser run must verify all steps and resulting balances/signatures by RPC. Preserve original product/rehearsal/browser checks. Root tests, typecheck, production build, package checks and relevant AMM regressions must pass. Save concise acceptance evidence and screenshots, then back up publicly under existing authorization.

## Future demos

Keep a small clearly planned list, with no enabled controls or claimed integrations: **Trade stock exposure (PT)**, then **Borrow against stock exposure** if a venue supports permissionless market creation and defensible pricing/liquidation. A standard SPL mint is necessary but does not automatically make collateral eligible. Research and verify venue admission, oracle requirements, maturity handling and liquidity before selecting a lending integration. Do not add speculative APYs, reward farming or leverage to this slice.
