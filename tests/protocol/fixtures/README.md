# Protocol test fixtures

These fixtures drive only the controlled local DivX program at
`2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE`. They contain no wallet,
issuer, deployment, or mainnet private keys.

`sdk-instructions.json` is generator-owned output from
`packages/transaction-sdk` and the genuine program IDL. Its SHA-256 is
`673db2036b28c10aebbddd7bbcaabd66ce3cc2e11f1190f9f2dbf12ae2d1a6a8` for
IDL SHA-256
`d4953c8a234e1b235e07db92f464dfb0033b62ff41bf378657fe1357a3211da4`.
The Rust suite parses all 13 vectors, checks the declared program ID, account
counts/flags, and independent Anchor/Borsh bytes, then executes the generated
`initialize_config` vector against the compiled ELF.

The KOx and Backpack MU arithmetic cases read their canonical f64 bit values
from the frozen source records in `packages/demo-fixtures/events.json`. Test
ex-dates are synthetic and explicit. The suite does not edit or reinterpret
the source fixtures, and neither record represents a complete annual journal.

In the original suite, all other mints, holders, events, clocks, deposits,
donations, deficits, burns and pause/freeze states are synthetic local test data.

Actual Token-2022 setup instructions build every tested profile. Accepted
profiles are ScaledUiAmount alone at 6, 8, and 9 decimals; ScaledUiAmount with
Pausable; ScaledUiAmount with PermanentDelegate; and the representative
passive xStocks combination of ScaledUiAmount, ConfidentialTransferMint,
null TransferHook, and DefaultAccountState Initialized. Registration rejects
actual mints containing TransferFeeConfig, an active TransferHook,
DefaultAccountState Frozen, or unsupported NonTransferable.

## Captured issuer configurations

`issuer-mints-2026-09-18.json` contains public finalized mint bytes for all 15
selected stock tokens and Clock from one RPC context, slot `447920461`.
The capture uses only `getGenesisHash` and `getMultipleAccounts`; no keys or
private holder accounts are read. Exact file SHA-256:
`5f75decb014072a82708ff76319df5dee15646460f8006461ba4786978fed7ac`.

The separate captured-custody tests preserve each mint's complete bytes,
including supply, authorities and multipliers. Holder accounts are initialized
through actual ATA instructions, then funded synthetically in the offline test
harness. The copied supply is not reconciled to a complete mainnet ledger.
Later Clock values, events and completeness attestations are synthetic. No
issuer authority signs, no mainnet transaction is sent, and this fixture does
not certify live custody or a real annual dividend payout.

```sh
npm run verify:issuer-mints
npm run test:issuer-mints
npm run test:issuer-custody
```

The first two commands validate the saved bytes and Node reader; the last runs
the compiled DivX program with packaged SPL/Token-2022 executables. See
the [conformance contract](../../../spec/issuer-custody-conformance-v1.md).
Future captures must use a new filename; the capture command refuses to
overwrite existing evidence.
