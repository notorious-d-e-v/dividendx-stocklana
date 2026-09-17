# DividendX Raydium CPMM integration

This isolated test harness executes the real DividendX program and Raydium CPMM. It creates a future 2027 claim series backed by a Token-2022 scaled test-stock mint, deposits 100 test stock units, creates and adds liquidity to a DR/worthless-test-quote pool, buys DR, withdraws every provider-held LP token, and recombines the provider's recovered DR with retained PT.

The seeded ratio is artificial: 40 DR to 80 six-decimal test-quote units, followed by 60 DR and 120 test-quote units. The quote mint is not USDC, has no value, and has no redemption right. The package does not claim Raydium UI/indexer discovery or a public market price.

This mock quote remains the default. Public devnet runs can instead select Circle's official six-decimal devnet USDC mint explicitly. Test USDC is a faucet asset and this option does not make a mainnet backing or price claim.

## Install and verify

```sh
npm ci --prefix packages/amm-integration
npm --prefix packages/amm-integration run typecheck
npm --prefix packages/amm-integration test
```

The package pins `@raydium-io/raydium-sdk-v2@0.2.64-alpha`. It never calls Raydium HTTP APIs. Pool/config/mint/account reads use Solana RPC. Every transaction is signed locally, simulated with signature verification, submitted, confirmed, and recorded.

## Read-only devnet preflight

Use absolute paths:

```sh
npm --prefix packages/amm-integration run preflight -- \
  --manifest /absolute/path/to/packages/amm-integration/manifests/devnet.example.json
```

Preflight verifies the exact devnet genesis, DividendX and Raydium executable accounts, full loader-payload SHA-256 values, DividendX upgrade authority, enabled Raydium config, live fee bounds, and the initialized native-wSOL fee receiver. It rejects mainnet/testnet and arbitrary RPC URLs.

## Public devnet flow

This command sends transactions. The admin path is mandatory and cannot be the default Solana CLI wallet. Generated attestor/provider/buyer/mint keys and incremental receipts stay in a new private direct child of the repository's ignored `.local-tools` directory.

```sh
npm --prefix packages/amm-integration run run:public -- \
  --manifest /absolute/path/to/packages/amm-integration/manifests/devnet.example.json \
  --admin-signer /absolute/path/to/.local-tools/keys/dividendx-devnet-deployer-keypair.json \
  --state-dir /absolute/path/to/.local-tools/amm-integration-devnet-20260917 \
  --receipt /absolute/path/to/.local-tools/amm-integration-devnet-20260917/receipt.json
```

To use official Circle devnet USDC, fund the dedicated admin wallet's canonical USDC associated token account with at least 11 test USDC, then add the explicit quote option:

```sh
npm --prefix packages/amm-integration run run:public -- \
  --manifest /absolute/path/to/packages/amm-integration/manifests/devnet.example.json \
  --admin-signer /absolute/path/to/.local-tools/keys/dividendx-devnet-deployer-keypair.json \
  --state-dir /absolute/path/to/.local-tools/amm-integration-circle-usdc-devnet \
  --receipt /absolute/path/to/.local-tools/amm-integration-circle-usdc-devnet/receipt.json \
  --quote circle-devnet-usdc
```

Circle mode is restricted to the fixed public-devnet manifest. Before any chain mutation, it verifies mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` as an initialized 82-byte classic SPL mint with six decimals and the reviewed Circle mint/freeze authorities. It also requires a fresh provider and buyer ATA plus at least 11 USDC (11,000,000 raw units) in the admin source. The admin then signs checked transfers of 10 USDC to the provider and 1 USDC to the buyer. The flow seeds 40 DR / 4 USDC, adds 60 DR / 6 USDC, and swaps 1 USDC. Receipts record the mint source, observed data hash, funding account and before/after balances. Accounting conserves the controlled 11 USDC without equating those accounts to the mint's global supply.

The [accepted public Circle-USDC run](../../planning/usdc-demo-review.md) completed 14 finalized transactions in pool `Fi94TtWky2e9SnSFAUzoPAcKKNV1WziEmLtZZ3FTi65S`. Its [receipt](../../planning/evidence/amm-usdc-devnet-roundtrip-2026-09-17.json) and [independent RPC verification](../../planning/evidence/amm-usdc-devnet-verification-2026-09-17.json) preserve funding and custody evidence. Reproduce the read-only verification with `node scripts/protocol/amm-usdc-verify.mjs --receipt planning/evidence/amm-usdc-devnet-roundtrip-2026-09-17.json --output /tmp/amm-usdc-verification.json` from the root.

`progress.json` is rewritten after every confirmed transaction and accounting checkpoint. A failed run does not fabricate success; persisted keys and signatures support inspection and manual recovery. The bounded runner refuses a dirty fixture rather than minting/depositing twice.

The frozen run requires chain year + 1 to equal 2027 and must complete before 2027 starts. Public devnet cannot advance annual maturity, so this receipt ends with paired recombination. Independent mature redemption remains a separate controlled local proof.

Raydium may set a newly initialized pool's open time one chain second after its creation block. The harness reads that pool field and waits against the chain Clock with a 30-second bound before building the swap; it does not use host time or submit a transaction that is known to be premature.

## Captured-program local fallback

Use a separate validator on port 18899 or 19999. Load the accepted DividendX ELF as an upgradeable program, load the captured 742,640-byte Raydium devnet payload as the fixed CPMM program, and clone exact config `5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy` plus fee receiver `3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy` from devnet. Do not use ports 4174 or 4180.

The local manifest must use `mode: "local-clone"`, the actual fresh local genesis hash, its 32-byte public-key encoding as `deploymentDomainHex`, and the same accepted hashes/authority. `run:local` otherwise takes the same arguments. Local preflight rejects known public-cluster genesis hashes and the receipt identifies this as captured devnet bytecode, including source ProgramData, deploy slot, config observation slot, and payload digest. It does not claim public devnet execution or source-to-binary reproducibility.

## Accounting evidence

The receipt preserves distinct collateral, PT, DR, test-quote, and LP quantities. Checks require:

- exact seed/add/swap/withdraw/recombine deltas;
- exact buyer DR output from the creator-fee-disabled quote and nonzero minimum output encoded in the base-input instruction;
- protocol/fund fee-counter deltas and zero creator fees;
- zero provider LP mint balance/supply after withdrawal, with Raydium's internal 100 locked LP units and exact residual reserves;
- remaining PT supply = DR supply = DividendX vault backing;
- DR supply = provider + buyer + Raydium DR vault inventory, including fees and locked residuals.

No secret bytes are written to receipts or stdout.

## Executed local proof

[`evidence/local-captured-raydium-receipt-2026-09-17.json`](evidence/local-captured-raydium-receipt-2026-09-17.json) is the completed isolated-validator receipt. All 14 transactions were simulated, confirmed, and preserved at local slots 1143–1156. It records the captured Raydium loader payload hash and source deployment metadata, so it is evidence for the local captured-bytecode boundary only.

The buyer spent 20,000,000 quote raw and received the exact quoted 907,024,323 DR raw with a 902,489,201 minimum. Creator fee was zero. After the sole provider withdrew every minted LP unit, Raydium retained 100 internal locked LP units, 643 DR raw, and 8,016 quote raw including 6,000 protocol plus 2,000 fund-fee raw. The provider recombined 9,092,975,034 paired claims. Final PT supply, DR supply, and vault backing each equal 907,024,966 raw; that equals buyer DR 907,024,323 plus pool DR 643.
