# Captured issuer mint custody conformance v1

18 September 2026. This slice tests the remaining ordinary-custody compatibility question without changing annual economics or promoting observations to settlement evidence. It is local compiled-program conformance, not mainnet execution or live issuer admission.

## Scope

Capture the exact 15 selected Solana mint accounts and Clock in one finalized public RPC read, preceded by the pinned mainnet genesis check. No keys, private holder accounts, issuer APIs or network writes. Preserve exact raw mint bytes, identity, owner, decimals, context slot, retrieval time and hashes. The frozen catalog stays unchanged.

Run those bytes through the existing transaction-SDK profile reader and the compiled DivX program in the isolated Mollusk test harness. Preserve every mint authority, extension, multiplier, supply and metadata byte. Use genuine packaged Token-2022, SPL Token and ATA programs. No native replacement processor or issuer-authority impersonation.

The holder account is created through Token-2022/ATA instructions with the extensions required by the captured mint. Seed only its raw balance through the offline harness; label that balance synthetic and do not change captured mint supply. This explicit incomplete ledger fixture proves transfer behavior, not issuer-backed issuance or whole-mainnet supply conservation. Issuer authority keys are never supplied as signers.

## Snapshot and verifier

Add `scripts/protocol/issuer-mint-snapshot.mjs` with explicit `capture --output PATH` and offline `verify --snapshot PATH` commands. Capture uses only `https://api.mainnet-beta.solana.com`, `getGenesisHash`, and `getMultipleAccounts` for the catalog mints plus Clock. No environment RPC override. Bound response/input sizes, timeouts and account count, reject null/invalid identities, and write a new exclusive file without overwriting source evidence. Reject unknown CLI options. Network errors must not yield a partial success artifact.

Snapshot schema `dividendx-issuer-mint-snapshot-v1`: `capturedAt`, `endpoint`, `genesisHash`, `commitment`, `contextSlot`, `catalogSha256`, `requests` (method, retrievedAt, responseSha256), `clock` (address, owner, lamports, executable, dataHex, dataSha256), and `assets` (issuerId, symbol, mint, decimals, tokenProgram, lamports, executable, dataHex, dataSha256). Include `purpose: "offline_custody_conformance"`, `liveCustodyTested: false`, `settlementReady: false`. Lamports/context slots must be safe nonnegative integers; raw bytes preserve all u64 fields. Rent epoch is not an economic input and may be test-local rather than pretending a rounded RPC number is exact.

Verify schema and bounds, the exact catalog digest and complete ordered identities, genesis/commitment, canonical raw hex/digests, Token-2022 owners, initialized decimals and raw Clock consistency. Independently derive the profile, extension list, fingerprint and scale tuple with the existing SDK. Profiles outside the accepted policy produce explicit unsupported results, never edits to mint bytes. The verifier emits a compact per-asset structural report; structural compatibility alone is not custody execution.

Capture to `tests/protocol/fixtures/issuer-mints-2026-09-18.json`. Keep a dated public verification summary under `planning/evidence/`. No authenticated Ondo response or credential belongs in either file.

## Compiled-program checks

Add a separate captured-mint test module and integration test. Load each fixture by exact mint identity, verify raw hashes/catalog binding and pinned compiled ELF, then use its captured chain time for initial local setup. Register the actual mint locally with a clearly synthetic test policy and local attestor. Create a 2027 series before its year-start cutoff.

For every supported captured mint prove:

- Real ATA creation with mint-required extensions; vault PDA ownership and no delegate/alternate close authority.
- Deposit transfers raw collateral to the vault and mints equal ordinary SPL PT/DR.
- Partial paired recombination burns both claims and returns the exact raw quantity, even after the observation becomes stale.
- A controlled multi-event journal and advanced local Clock exercise staged finalization; synthetic event factors/dates/coverage are explicitly separate from the snapshot's issuer multiplier and any real annual period.
- Independent PT and DR redemption preserve raw obligations, exhaust the test claims and return all accountable test backing with cumulative rounding.
- Every custody instruction executes nonzero SBF compute and appropriate real token CPIs; captured mint bytes remain identical throughout.

Use fractional raw test amounts and an independent arithmetic oracle. Existing generic tests already cover corrections, cancellations, unsupported actions and adverse issuer controls; preserve them. Do not broaden the accepted mint policy to force a captured asset to pass. Record unsupported assets accurately if found.

Produce a reproducible per-asset result containing input snapshot/hash, ELF hash, decoded profile, executed operations/compute and exact raw conservation, with explicit `environment: "mollusk_offline"`, synthetic funding/clock/events, `mainnetTransactions: 0`, `liveCustodyTested: false`, `settlementReady: false`. No live capability flag or qualification-dossier blocker changes.

## Acceptance

Parent independently verifies the snapshot through the SDK, inspects unchanged mint bytes and exact balances in test results, and runs capture/verifier tests plus the existing program suite. Run root tests/type/build for new Node scripts, building web output to a temporary directory to preserve the preview. Program and SDK sources/IDL must remain unchanged. Do not restart the app, either local runtime, or browser sessions.

This closes only local execution compatibility with the captured configurations. Mainnet token availability/transfer, issuer-controlled freezes/pauses/upgrades, event qualification, corrections/finality and complete annual coverage remain separate. No special permissioned vault or new issuer adapter is inferred from this test.
