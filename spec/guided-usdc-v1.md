# Guided demo: test USDC quote

17 September 2026. The user requests USDC as the demo quote and offers Circle devnet faucet funding. This supersedes the private quote for new guided runs; preserve all earlier receipts as historical evidence.

## Frozen decisions

- Circle's official Solana devnet USDC mint is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, six decimals, classic SPL Token. Primary identity source: [Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses). Parent RPC confirms devnet genesis and mint at finalized slot 499829920.
- Keep collateral/annual claims and nine guided actions unchanged. Scale only quote funding: 40 DR / 4 test USDC seed, 60 DR / 6 test USDC added, buyer spends 1 test USDC. One [Circle faucet](https://faucet.circle.com/) request supplies 20 test USDC; the public run needs 11.
- Public devnet: use this existing mint and transfer checked from the explicitly selected dedicated admin wallet into provider/buyer ATAs. Verify mint owner, length, initialization, decimals, expected Circle authorities and funding before any run mutation. Never mint, change authorities or synthesize balances on public devnet. Capture funding account and before/after balances in public receipt. Preserve existing mock CLI mode and historical tests; add an explicit Circle quote option with bounded constants.
- Local guided annual walkthrough: load an exact captured public USDC mint into offline Surfpool, retain its supply/authorities/data bytes, and initialize two test token balances totaling 11 USDC through explicit local-only state setup. Disclose synthetic local funding in receipt; it is not a faucet transfer or public USDC. All subsequent pool swaps/transfers/redemptions remain real local signed instructions. Reject public genesis before synthetic setup. Verify known quote-account conservation independently of global mint supply.
- Browser wording: **Test USDC**, with **USDC** units and a brief local-copy explanation in boundary/evidence. Show 4 / 6 / 1 amounts. No mainnet dollar-backing claim, dollar price, issuer-dividend-in-USDC claim or local public-explorer links. Retain exact raw-unit inspection and actual observed mint identity. Version the guided runtime DTO so an old private-quote runtime cannot be mislabeled USDC.
- Preserve `/app/`, port 4180, user's existing wallet tab, old evidence/screenshots and approved visuals. New guided backend may be restarted only after replacement checks are ready. Use separate QA runtime/chain as needed, avoiding live 4181 until handoff.
- No program or transaction-SDK change, new venue, PT market or lending implementation in this slice.

## Acceptance

Capture the official mint with source URL, cluster/genesis, finalized slot, owner, bytes/hash, supply, authorities and decimals. Local smoke plus real browser run must complete all nine actions, independently verifying official mint bytes, synthetic funding boundary, actual signatures, exact swap bounds, residual LP/DR backing and final custody. Save new versioned receipts; never overwrite the accepted generic-quote proof.

When faucet funding arrives, run the explicit Circle-USDC public CLI on fresh test collateral with the existing dedicated wallet. Verify funding transfers and actual official-mint pool vaults from finalized chain data. Until that succeeds, report public USDC support as prepared/pending funding, not proven. A public future annual series still exits through paired recombination; accelerated maturity belongs only to the local walkthrough.
