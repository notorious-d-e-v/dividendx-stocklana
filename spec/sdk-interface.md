# SDK contract for the frontend rehearsal

> Preserved legacy client used by `/rehearsal/`. New implementation follows [annual accounting](annual-series-accounting.md) and the [annual SDK/reference contract](annual-series-sdk.md); an event ID is no longer a series ID.

Frozen 16 September 2026. Framework-independent TypeScript in `packages/sdk/src/index.ts`, with Node tests. The React frontend imports this public entry point and normalized JSON fixtures. All mutation methods return promises so a future transaction-backed client can replace the local client. No Solana program or real wallet adapter is implemented in this phase.

## Data

`IssuerId = 'xstocks' | 'backpack' | 'ondo'`; `WalletId = 'seller' | 'buyer'`; `ClaimSide = 'pt' | 'dr'`.

AssetDescriptor comes from `packages/demo-fixtures/catalog.json`: id, company, underlying, symbol, issuerId, mint, decimals, tokenProgram, snapshotAt, observedSlot, effectiveMultiplier, sourceUrls, evidencePaths, capabilities (recognized, mintObserved, dividendDocumented, custodyTested, executionTested, liveEnabled), eventFixtureId or null, statusDetail, issuerControlNote. The last three execution capabilities remain false.

EventDescriptor comes from `packages/demo-fixtures/events.json`: id, assetId, issuerEventId or null, revision or null, kind, evidenceKind, m0, m1, actualEventAt, snapshotAt, issuerRecordStatus, companyPaymentDate or null, netCashflowUsd or null, referencePriceUsd or null, sourceUrls, evidencePaths, sourceDigest, finality. Fixture finality is `trusted_frozen_replay`, never live-final. Exactly KOx and Backpack MU are enabled for rehearsal.

Export public types and a `DemoClient` interface. Ledger raw amounts use bigint. `DemoState` includes version, condition (`ready | stale | paused | rejected_event`), wallets, series and receipts. Each wallet holds `collateral: Record<assetId,bigint>`, `usdc: bigint`, and `claims: Record<seriesId,{pt:bigint,dr:bigint}>`. Each series stores id (the event fixture ID), assetId, eventId, phase, accounted raw collateral, original settled supply/pools, current pools, cumulative burned amounts, and replay clock status. Implementers may add fields but must document them in exported types.

`DemoReceipt` includes id prefixed `demo-`, kind `demo`, action, seriesId, timestamp and a plain summary plus exact amount changes. Never create a fake transaction signature or explorer link.

`AllocationPreview` includes assetId, eventId, input string, collateralRaw, ptPoolRaw, drPoolRaw and pairedClaimRaw, all amounts bigint. Export `parseDecimal`, `toRawAmount(display,decimals,multiplier)`, `formatUnits(raw,decimals,places?)`, `formatScaled(raw,decimals,multiplier,places?)`, `allocate(raw,m0,m1)`, and `parseUsdc`/`formatUsdc` helpers. Formatting may round for readability but cannot feed the ledger. Specify return types in the source.

## Client API

`createDemoClient(assets, events, options?: {now?:()=>number}): DemoClient`

- `getState(): DemoState` returns a deep copy.
- `preview(assetId, stockAmount): AllocationPreview` works before selecting a demo account. Missing fixtures return a typed error.
- `deposit(assetId, stockAmount): Promise<DemoReceipt>` uses the seller account, creates the isolated series if needed, and atomically deposits/creates paired claims.
- `quoteSale(seriesId, drRaw: bigint, usdcTotalRaw: bigint): SaleQuote` stores an immutable quote with id, quantity, consideration, version and expiry. Quotes live for 60 seconds using the injected clock.
- `acceptSale(quoteId, options?: {reject?:boolean}): Promise<DemoReceipt>` atomically exchanges DR and test USDC between seller and buyer. Rejection consumes no balances or successful receipt.
- `closeDeposits(seriesId): Promise<DemoReceipt>` moves the replay clock to the event and closes deposits.
- `settle(seriesId): Promise<DemoReceipt>` validates and consumes the pinned frozen fixture, then freezes pools once.
- `previewRedemption(seriesId,walletId,side,claimRaw): bigint` returns the exact current raw payout using cumulative rounding.
- `redeem(seriesId,walletId,side,claimRaw): Promise<DemoReceipt>` burns claims and credits the correct wallet's underlying balance.
- `recombine(seriesId,walletId,claimRaw): Promise<DemoReceipt>` before settlement only, burning both claims together.
- `setCondition(condition): void` is an explicit demo test control, increments state version and invalidates quotes. It cannot edit fixtures or mint profiles.
- `reset(): void` restores seeded demo state and clears series, quotes and receipts. It must also invalidate prior quote IDs.

Errors expose a stable `.code` and clear `.message`. Include invalid amount, missing event, insufficient balance, stale data, paused collateral, rejected event, deposits closed, wrong phase, stale/expired quote, user rejected, zero payout and already settled. Fail before mutating state. UI loading is the async action lifecycle, not a claim of chain confirmation.

## Ownership and checks

SDK worker owns `packages/sdk/**` only, including a private package.json and scripts if useful. Do not edit root dependency files or frontend. Frontend worker owns root scaffolding and `apps/web/**`, including bundling, imports and root scripts. Fixture worker owns `packages/demo-fixtures/**`. Coordinate any necessary contract changes with Astra before breaking callers.

Required SDK checks: exact KOx values; Backpack uses event M1; invalid/excess precision and overflow; 6/8/9 decimal profiles; pool conservation; fractional redemption in both orders; full redemption empties pools; two-wallet sale conserves test cash and claim supply; rejection/expiry/stale quotes are atomic; reusing a quote fails; reset invalidates quotes; no post-cutoff deposits; no double settlement/redemption; recombination cannot consume another holder's DR; missing Ondo event fails; stale/paused paths; unsupported split classification and wrong-asset event rejected; state snapshots cannot mutate internal balances.
