# Current status

Updated 16 September 2026, after public GitHub backup and the user's request for a deeper prior-art review before program implementation.

Public repository: [notorious-d-e-v/dividendx-stocklana](https://github.com/notorious-d-e-v/dividendx-stocklana). The initial checkpoint includes source, design, research, pitch and preserved archives; regenerable caches stay local.

## Completed and approved

| Area | Current result |
| --- | --- |
| Brand | Design system, illustration guide and both-sides composability artwork |
| Pitch | Nine-slide [illustrated v2](../presentation/output/DividendX-illustrated-v2.pptx) and preserved [user narration](../presentation/narration.md) |
| Product | Market / Split / Redeem at `/`, with company/token hierarchy, PT/DR outputs, recombination and independent redemption |
| Fallback | Original technical rehearsal preserved at `/rehearsal/` |
| Accounting | Framework-independent bigint SDK with conservation, paired ownership, sale and redemption checks |
| Evidence | 15 candidate mints across xStocks, Backpack/Trek and Ondo; two sourced historical examples, KOx and Backpack MU |
| Verification | Fixture checks, 11 SDK tests, 15 browser tests, type checks and two-entry production build; independent Astra flow and layout review |
| Repository | Public README, operating rules, artifact map, Node 24 configuration, portable browser setup and an inactive GitHub Actions template |
| Prior art | [Architecture and feature review](research/prior-art-review.md) covering yield protocols, Solana precedents, equity-strip designs and traditional dividend contracts |

The app uses local test balances and simulated receipts. No wallet integration, actual PT/DR mints, deployed vault, live issuer reader or AMM pool exists yet. UI and artwork approval does not imply those capabilities.

## Next: program and transferable tokens

1. **Astra freezes the program contract.** Use the [prior-art handoff gates](research/prior-art-review.md) alongside existing allocation and SDK boundaries. Resolve unknown future outcomes, confirmed zero/cancellation, Token-2022 factor encoding, event trust/finality, authority/extension checks, tiny-fragment closure, direct token burns, custody failures and excess collateral. DR transfers carry the whole unredeemed event entitlement; keep issuer/mint/event series isolated.
2. **Sol implements the vault and transaction SDK at xhigh effort.** Test actual PDA custody, PT/DR minting, transfers, cutoff, paired recombination, settlement and independent redemption using representative test mints and the two sourced historical cases. Treat those fixtures as test attestations, not live-final issuer events.
3. **Astra verifies invariants; Sol connects the approved product at high effort.** Add wallet-signed test-network/local-validator transactions and real receipts. Event processing belongs in background readers/attestation; users see split, use and redeem.
4. **Prove one AMM round trip.** Target Raydium CPMM on devnet with DR and clearly labeled private test money: add liquidity, buy DR, withdraw liquidity, redeem recovered DR and retained PT. Verify deployment/config/funding first. Preserve backing for claims remaining in the AMM. See [feasibility and boundaries](research/claim-amm-feasibility.md).
5. **Refresh the submission package from working evidence.** Update slide 8, record the demo, check the actual submission form/deadline and publish only the verified capabilities.

Do not spend the next phase redesigning approved screens, broadening issuer scope, building a custom AMM or adding staking rewards. The immediate deliverable is a tested program with real token behavior.

## External dependencies

- **Ondo:** read-only API access and a classified historical dividend joined to exact factors/time; token discovery is already done. The outreach draft is in [issuer data requests](issuer-data-requests.md).
- **Backpack:** a documented durable corporate-action feed and correction/finality semantics. The MU onchain reconstruction is already available for the test flow.
- **Live series:** future-event policies, qualified real-token custody, ongoing sources and an operational signer remain unproven for every issuer, including xStocks.
- **Devnet:** program toolchain, RPC/faucet access and enough test SOL for deployment/accounts/pool setup must be checked during the program phase.

These do not block local program implementation against the existing fixtures and representative test collateral. Mainnet funds, mainnet deployment and hackathon submission are not part of this cleanup.

The prior-art review is sufficient to stop broad exploration and write the bounded program specification. Pendle's current docs already describe STRCx discrete yield; our differentiation is native Solana issuer handling and the chosen event-right contract, not a claim that Pendle cannot handle stock dividends. Confirmed-zero and exception paths must be specified before Sol's implementation handoff; a credible live resolution process remains a separate release gate.

## Operating and backup notes

- Astra owns decisions and independent acceptance. Sol handles bounded implementation under the [operating rules](../AGENTS.md) and [work orders](phase-work-orders.md).
- Verification can supersede the plan; record any change in the [decision log](decision-log.md).
- Source, research/evidence, user-edited narration, final decks, approved art and useful archives are retained. Dependencies, compiler state, browser reports and redundant presentation working renders are ignored without deleting local copies.
- Keys stay outside the repository and browser bundle. Public-repository authorization covers this backup; it does not authorize sending outreach or deploying real funds.
- GitHub rejected installation of an active workflow because the publishing OAuth login lacks `workflow` scope. The [CI template and activation instructions](../docs/ci-setup.md) are preserved; no automated GitHub run is claimed. This does not block the code/artifact backup.
- The [artifact map](../docs/artifact-map.md) identifies the current entry points and preserved history. No software license has been selected by this cleanup.
