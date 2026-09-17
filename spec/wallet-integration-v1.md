# Wallet integration v1

17 September 2026. The user's “keep going” authorizes the next wallet/application phase. Preserve `/` as the approved annual preview and `/rehearsal/` as its historical fallback. Add the real transaction application at `/app/`, using the existing visual system. Mainnet, real funds, issuer outreach, AMM pools and public deployment remain outside this slice.

## Product contract

- Market / Split / Redeem stays the main flow. Company headings are distinct from exact issued tokens and annual series.
- Every balance and completed action on `/app/` comes from the configured local Solana runtime. Show the network, connected account, program identity and confirmed transaction signature. No simulated success or silent fallback to reference state.
- A persistent banner identifies disposable test assets and controlled test dates. The three initial test profiles represent xStocks (8 decimals), Backpack/Trek (6) and Ondo (9); they are locally minted test collateral, not issuer assets or proof of live integration.
- Discover installed wallets through Wallet Standard `standard:connect`, `standard:events` and `solana:signTransaction` with legacy transaction support. Submit only through the verified application RPC. Filter accounts without Solana signing support and invalidate snapshots on account/network/disconnect changes. For signing-only local transactions, the standard's optional `chain` field may be omitted, as the official adapter does; never label a mainnet/devnet chain as local or let the wallet broadcast through another RPC. A wallet that refuses the local transaction produces a clear error.
- Offer an explicit temporary test wallet only on localhost, for the local runtime. Generate its key in browser memory, never export or persist it, and explain that reloading loses this disposable wallet. It signs actual transactions; it is not a simulated balance.
- Local test collateral and SOL are requested through a tightly scoped faucet. Administrative and attestor keys stay in the local runtime and are never sent to the browser. Holder operations always require the holder's signature.
- Split mints the named PT/DR pair. Before finalization, matching pairs can recombine. After finalization, PT and DR redeem separately; zero-output burns require explicit consent. Show stock-token payouts, never invented cash prices or guaranteed dividends.
- PT and DR wallet transfers create/check the recipient's ordinary SPL ATA and use actual token transfers. Do not label a transfer as a sale. Trading and liquidity remain unavailable until a real venue is integrated.
- Keep exact integer units throughout. Stock display conversion uses the observed binary multiplier; claims use ordinary SPL decimals. Max uses the exact raw balance. Reject malformed, excessive or overflowing amounts. Refresh and quote immediately before signing, use state/expiry/minimum-output guards, and refetch after confirmation. A transaction error or expired quote must never become success.
- Resolve missing ATAs as zero balances, then create them idempotently when needed. Missing or invalid program/vault/mint accounts are errors, not empty positions. Bind cached reads and async completions to genesis, deployment, issuer, mint, year and wallet.
- Keep network errors, unavailable runtime, rejection, submitting, confirmed, stale data, disconnected and empty states legible. Disable duplicate submission and prevent stale asynchronous results from replacing a newly selected wallet or series.
- Bound RPC reads. A failed background refresh marks existing balances stale and blocks actions until recovery; periodic polling must not supersede a pending read indefinitely. Preserve confirmed partial faucet/control receipts when a later operation fails.

## Local runtime interface

Base URL is `http://127.0.0.1:4180`. The runtime binds only loopback, validates Host/Origin, limits request sizes, and exposes no arbitrary instruction/signing API. Browser origins are the local Vite/preview origin on port 4174. POST requests must carry the current `genesisHash` and unique `runtimeId`; old runtime manifests fail closed even if a testing engine reuses a genesis identity. No private keys appear in responses, logs or tracked files.

`GET /manifest` returns:

```ts
interface LocalManifest {
  schemaVersion: 1;
  kind: 'surfnet'; // offline SBF testing runtime; not a public validator network
  rpcUrl: string;
  genesisHash: string;
  programId: string;
  deploymentDomainHex: string;
  runtimeId: string;
  clockControl: boolean;
  assets: Array<{
    id: string;
    company: string;
    symbol: string; // e.g. TestKOx; must match the registered policy
    issuerLabel: string; // e.g. xStocks test profile
    issuerIdHex: string;
    decimals: 6 | 8 | 9;
    collateralMint: string;
    assetPolicy: string;
    series: Array<{
      year: number;
      address: string;
      accumulator: string;
      ptMint: string;
      drMint: string;
      vault: string;
    }>;
  }>;
}
```

Validate the genesis against RPC, executable program identity, Config deployment domain and derived PDAs before enabling transactions. Verify actual account owners/relationships through the SDK's coherent reads. The manifest is discovery metadata, not a substitute for those checks.

The selected runtime is pinned `@solana/surfpool@1.5.0`, offline with transaction-mode block production. The feasibility probe executed the unchanged ELF, real Token-2022 custody and PT/DR issuance, rejected an unsigned holder transaction, and advanced Clock while retaining balances. Display “Local SBF sandbox,” not public-chain settlement. Program deployment/upgrade authority and test SOL are harness setup; program state and token balances are created only through genuine instructions. Use a unique runtime identity and deployment domain per process. Restart resets the disposable network.

The long-running process must drain Surfpool's native event buffer. Account reads can otherwise block after the buffer fills even while `getHealth` returns success. Verify actual state reads after sustained traffic and idle periods. The test runtime's raw development RPC is loopback-only and is not a production service.

`POST /faucet` accepts `{ owner, assetId, genesisHash, runtimeId }` and funds only that wallet with bounded test SOL and the chosen runtime-created collateral. Return `{ signatures: string[] }` after confirmation. Keep claims obtainable only through real deposit/transfer operations.

If controlled runtime time is verified, `POST /advance` accepts `{ step, assetId, genesisHash, runtimeId }`, where `step` is `start-year`, `record-dividends`, `end-year` or `finalize`. Return `{ signatures: string[], message: string }`. Time changes affect the whole local network and must be labeled as demo controls. The chain Clock, not a frontend date, decides eligibility. Recording and finalization use genuine signed program instructions with visibly test-only event data. The production program gets no clock override or weakened annual gates. If no faithful clock-control path is available, disable these controls and record the limitation.

Bootstrap the 2027 series for all three profiles at a fixed pre-year test date. `record-dividends` processes four synthetic quarterly ex-date records for the selected asset, updates that test mint's Scaled UI Amount through token instructions, and attests matching exact factors. Time only moves forward; processing another asset's earlier records does not rewind the network. Recording is resumable/idempotent by stable event IDs. `end-year` moves past maturity but does not finalize. `finalize` waits for all four resolved test records and performs genuine begin/accumulate/complete instructions. Return only confirmed signatures; a partial operation is reported as partial and can resume without duplicate dividends.

## Acceptance

Run the preserved checks and browser suite. Add browser coverage for missing runtime, wallet connection/rejection/disconnect, network identity mismatch, exact amounts, actual split, partial recombination, PT/DR transfer to another wallet and independent redemption when controlled time is available. Actual execution tests must use the compiled program and confirmed RPC state. Test doubles may cover error UI but cannot substantiate custody or redemption.

Review desktop/mobile, keyboard operation, copy, asset provenance and browser-console errors. Save non-secret receipts and verification scope. Preserve the previous program/IDL hashes unless a separately reviewed integration defect requires a source change.

Primary wallet reference: [Solana Wallet Standard](https://github.com/anza-xyz/wallet-standard) and its [signTransaction interface](https://raw.githubusercontent.com/anza-xyz/wallet-standard/master/packages/core/features/src/signTransaction.ts).

Runtime references: [Surfpool configuration](https://solana.com/docs/tools/surfpool/sdk/configuration) and [time travel](https://solana.com/docs/tools/surfpool/sdk/time-travel).
