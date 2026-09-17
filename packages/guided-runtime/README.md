# DividendX guided demo runtime

This package serves the isolated `/demos/` transaction scenario on `127.0.0.1:4181`. It starts its own offline Surfpool, deploys the accepted DividendX ELF, loads the pinned captured Raydium devnet CPMM bytecode and public config fixtures, and manages two disposable in-memory test wallets. Its Test USDC quote uses the exact captured Circle devnet mint account and synthetic local balances. It does not use the wallet runtime on 4180, a default Solana wallet, public funding, mainnet, issuer credentials, or assets with value.

The fixed actions are split, create/seed a 40 DR / 4 USDC pool, add 60 DR / 6 USDC, swap the buyer's 1 USDC, remove provider liquidity, recombine recovered claims, settle the synthetic test year, redeem buyer DR, and redeem provider PT. Every mutation after initial local state setup is signed and confirmed locally. Raydium's locked DR residual remains backed after the two wallets redeem.

## Install and run

From the repository root:

```sh
npm ci
npm ci --prefix packages/transaction-sdk
npm run build:transactions
npm ci --prefix packages/amm-integration
npm run --prefix packages/amm-integration build
npm ci --prefix packages/guided-runtime
npm --prefix packages/guided-runtime run typecheck
npm --prefix packages/guided-runtime test
npm --prefix packages/guided-runtime start
```

The runtime requires the root workspace dependencies, the built transaction SDK, the built AMM integration package with its state export, and the accepted DividendX ELF at `target/deploy/dividendx.so`. Startup verifies the DividendX ELF and captured Raydium ELF hashes before launching Surfpool.

The browser API is `GET /state`, `POST /start`, `POST /step`, and `GET /receipt`. Mutations require the exact runtime/session revision, an approved loopback Origin, JSON content type, and `X-DividendX-Demo: 1`. Caller-supplied instructions, amounts, addresses and network targets are not accepted.

Run the complete local chain journey in its own in-process Surfpool, without binding port 4181, with:

```sh
npm --prefix packages/guided-runtime run smoke
```

Public progress is atomically stored under ignored `.local-tools/guided-runtime/`. Each session has a UUID-named evidence file; keys are never persisted. A server restart creates a new runtime identity and cannot resume the destroyed Surfpool.

## Test USDC boundary

[`fixtures/circle-devnet-usdc-2026-09-17.json`](fixtures/circle-devnet-usdc-2026-09-17.json) contains the exact 82-byte classic SPL Token mint account captured from finalized Solana devnet slot `499830485`. Startup pins its address, owner, data hash, supply, decimals, mint authority, freeze authority, Circle source URL, and devnet genesis.

Offline Surfpool receives synthetic provider and buyer token-account state totaling 11 Test USDC (10 plus 1). The mint bytes and global captured supply remain unchanged. This local setup is not a Circle faucet transfer, public USDC balance, or mint signature. All later USDC custody changes occur through signed Raydium transactions, and every checkpoint verifies exact conservation of the controlled 11 USDC independently of the captured global supply.

## Captured Raydium boundary

[`../amm-integration/fixtures/raydium-devnet-2026-09-17/capture.json`](../amm-integration/fixtures/raydium-devnet-2026-09-17/capture.json) records finalized public devnet slot `499784549`, exact account data hashes and the 742,640-byte deployed-program hash `87ef84634086209fc2c29b4163bbe5209a1e9383aff5c429781f5fff270d75fd`. Runtime startup verifies every byte before loading it.

This proves local execution against captured genuine Raydium devnet bytecode. It is separate from the accepted public devnet receipt and does not claim source-to-binary reproducibility, live liquidity, issuer custody or real dividend evidence.

The captured deployment slot is public provenance; local deployment has its own slot. The native fee receiver changes after pool creation: its lamports increase by exactly the captured 150,000,000-lamport fee, while native-token reserve/amount bookkeeping uses the local rent schedule. The independent verifier checks that reserve against local rent RPC, the exact balance delta and every remaining account byte. It does not require mutable final fee-account data to equal the source hash.
