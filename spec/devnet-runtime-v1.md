# Public devnet runtime v1

Status: implementation foundation; live bootstrap and receipts require a separate parent-reviewed execution.

## Fixed boundary

The runtime is bound to Solana devnet genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`, DivX program `2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE`, accepted ELF SHA-256 `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070`, upgrade/admin identity `DpbSCimwNNWMcREiJ7npkWuDVywWgHHekZGx6K9TeRsv`, and deployment domain `ce59db5080fc2c6d3bcf7ca90712d3c2e5e6c28f27f0dfbb9953bdb0894c03ab`.

RPC configuration is an explicit HTTPS origin. Every command checks the live genesis, executable program payload, upgrade authority, Config admin, and deployment domain. Mainnet and testnet are rejected before program reads. The runtime never initializes or updates Config and never deploys the program.

## Assets and authority separation

Bootstrap creates stable persisted signers and deterministic PDAs for three synthetic 2027 assets:

| Asset ID | Symbol | Decimals | Profile label |
| --- | --- | ---: | --- |
| `xstocks-test-kox` | `TestKOx` | 8 | xStocks test profile |
| `backpack-test-mu` | `TestMU` | 6 | Backpack/Trek test profile |
| `ondo-test-ibm` | `TestIBMon` | 9 | Ondo test profile |

Each collateral mint has only the Token-2022 ScaledUiAmount extension with an initial multiplier of 1. The exact symbol, decimals, issuer ID, mint, policy, and 2027 series addresses are reconciled before reuse. The dedicated faucet is mint authority; the dedicated test observation attestor is policy attestor. Both differ from the upgrade/admin identity and from each other. No real issuer mint or issuer credential is read.

Private keys and resumability state exist only in an explicitly named, mode-`0700` direct child of `.local-tools`; signer files and state are mode `0600`. The default Solana wallet is refused. Production manifests and public smoke receipts contain no secret bytes or private paths.

## Mutation controls

Bootstrap funds the faucet with at most 0.03 SOL and the attestor with at most 0.01 SOL. Before every transaction, it signs locally and simulates with signature verification while requesting the projected admin account. Submission is refused if projected aggregate admin spend from the persisted initial balance exceeds 0.15 devnet SOL. No Raydium pools are created.

After submission, the signature is persisted before confirmation. A retry first checks the intended deterministic state and then searches the stored signature. Confirmed state is accepted, a confirmed mismatch fails, an unresolved signature blocks resubmission, and only a definite failed signature can be replaced. This prevents a timeout from duplicating funded assets.

`fund-holder` is CLI-only. It requires manifest `runtimeId` and `genesisHash`, uses only the test faucet signer, and mints exactly 10 requested synthetic units per invocation with at most a top-up to 0.006 devnet SOL. That bound covers two fresh classic SPL claim-token accounts plus fees; the faucet separately pays for the collateral account. It is not exposed over HTTP and has no claim of abuse resistance. Durable holder quotas and rate limiting are prerequisites for a later public faucet slice.

`refresh-test-observations` is a one-shot operator command using only the test attestor. It reads the current Token-2022 mint and policy in a coherent quote snapshot, requires the full current profile to match the registered profile, and caps validity at 86,400 seconds. Its evidence digest explicitly identifies a synthetic test-profile observation. It does not publish events, assert live issuer evidence, begin finalization, or finalize.

## Public contract

The registry has `schemaVersion: 1` and the frontend shape:

```text
{kind:'devnet',rpcUrl,genesisHash,programId,deploymentDomainHex,runtimeId,
 clockControl:false,faucetEnabled:false,
 assets:[{id,company,symbol,issuerLabel,issuerIdHex,decimals,collateralMint,
          assetPolicy,series:[{year,address,accumulator,ptMint,drMint,vault}]}]}
```

The service exposes `GET /manifest`. `POST /faucet` returns HTTP 403 with `{signatures:[], message}` while `faucetEnabled` is false. There is no `/advance` route and no HTTP admin, custody, attestation, event, settlement, or arbitrary transaction dispatcher.

The signed smoke command creates a disposable private test holder, funds one synthetic unit, creates its claim accounts, splits and recombines the same raw amount, and checks exact collateral, PT, DR, and vault conservation. Its public receipt contains public keys, signatures, and quantities only.

## Lifecycle limits

This runtime uses real chain time. Deposits for the 2027 series close on 1 January 2027 UTC and maturity is 1 January 2028 UTC. There is no shortened series or clock control. Paired recombination remains available before finalization. Independent side redemption still requires maturity, a resolved event journal, reviewed coverage, and finalization; none is implemented here.
