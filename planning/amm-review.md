# Raydium integration acceptance

17 September 2026. Astra accepts the bounded [AMM contract](../spec/amm-integration-v1.md): **the annual DividendX program and Raydium CPMM completed a real public devnet round trip with test assets.** The integration is a Node transaction harness; the running wallet application's UI is unchanged.

## Public proof

The [public receipt](evidence/amm-devnet-roundtrip-2026-09-17.json) records 15 transactions at slots `499760641`–`499761026`. Astra independently checked all 15 as finalized and decoded fresh accounts at finalized slot `499762083`. The [deployment receipt](evidence/dividendx-devnet-deployment-2026-09-17.json) separately verifies the deployed program's bytes and authority.

| Identity | Address |
|---|---|
| DividendX program | `2EpQ2iKz921Ce2rremdnFrqG15DQq3Y2rSXbgixceDQE` |
| 2027 series | `3FZAAtHgXRGCG38r21UerVFWAK4tfJLKFE2oexUWxvWf` |
| Collateral vault | `23y6XRjGt6RgKwJWYZ6r77dpLxdW9Wy8fqcnr2jc3cXw` |
| DR mint | `yn3W8dngg5nVC6SwfkJ1qDYDFQcFNP3tSfyCejKyfj6` |
| PT mint | `GuU8pVQdsejgfzjsCDUNunPfi8coZ6cRpaJwbxuHsWXC` |
| Raydium CPMM pool | `2yhUcyx6jawJo9z5YMqFQgmxmvvE6Qz1g1zmDQjVH5Cm` |
| Worthless test quote mint | `EL5tzCbLPnZ7mH6dtGJgc39Dr5GGeAyT12PhcGzhSUSg` |

[Inspect the pool on Solana Explorer](https://explorer.solana.com/address/2yhUcyx6jawJo9z5YMqFQgmxmvvE6Qz1g1zmDQjVH5Cm?cluster=devnet). This is an account/transaction proof, not a Raydium website listing or an active liquid market after the provider's withdrawal.

The provider deposited 100 eight-decimal test stock units through DividendX, receiving 100 PT and 100 DR. It seeded 40 DR / 80 six-decimal test quote units, then added 60 DR / 120 quote units. A second wallet spent 20 quote units for **9.07024323 DR**, exactly matching the corrected quote. The quote currency has no value or dollar backing; its initial ratio is an experiment input.

After burning every provider-held LP token, the provider recovered and recombined **90.92975034 DR with matching PT**, receiving the same quantity of test collateral. Finalized reads prove:

```text
PT supply = DR supply = accountable backing = vault collateral
          = 907,024,966 raw units
          = 9.07024966 test stock units

Outstanding DR = buyer 907,024,323 + Raydium vault 643 raw units
Provider DR = 0; provider LP = 0; minted LP supply = 0
Raydium internal LP supply = 100 permanently locked raw units
```

The quote vault retains 8,016 raw quote units: 6,000 protocol-fee units, 2,000 fund-fee units and 16 liquidity-residual units. Creator fees are disabled and zero. Remaining DR backing was preserved, not swept. The controlled wallets' net SOL reduction for the 15-step flow was 0.21398632 devnet SOL, including account rent and fees; program deployment was separate.

## Implementation and validation

[`packages/amm-integration`](../packages/amm-integration/README.md) pins Raydium SDK `0.2.64-alpha`, checks the fixed devnet genesis, executable bytecode hashes, upgrade authority, exact config/fee receiver, mint owners/decimals and pool identity. It uses RPC reads, explicit private test signers, bigint accounting, simulated signed transactions and incremental submitted/confirmed receipts. A dirty fixture is refused; persisted keys and progress support manual recovery, not automatic resume.

Review and actual local execution resolved the SDK's disabled-creator-fee quoting issue, full payload versus logical ELF hash mismatch, byte-order mint sorting, liquidity slippage behavior, separate installed PublicKey classes, pool opening time and cached LP-account discovery. Pool accounting includes fee counters and exact locked-liquidity residues. The existing program and transaction SDK were not changed.

- **11 AMM tests**, package typecheck, self-import and pack dry-run pass.
- **14 actual local transactions** passed against captured Raydium devnet bytecode before the public run; [local receipt](../packages/amm-integration/evidence/local-captured-raydium-receipt-2026-09-17.json). Earlier local failures were corrected before public pool execution.
- **15 public transactions** were simulated, confirmed and independently verified finalized; actual balances matched the local proof.
- The fixture verifier, **71 existing root tests**, root typecheck and production build pass. The build used an isolated output directory, preserving the user's preview. No browser or program source changed, so those previously accepted suites were not repeated.
- DividendX ELF SHA-256 remains `a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070`; both IDL copies remain `d4953c8a234e1b235e07db92f464dfb0033b62ff41bf378657fe1357a3211da4`.

The public faucet first returned 429. The user funded the dedicated devnet wallet; an RPC program upload reached its retry limit, then the standard CLI validator transport successfully resumed the same buffer. The upload buffer closed. These attempts and the final deployment are retained in the funding/deployment evidence. No default wallet, real funds, issuer credentials or mainnet transaction was used.

## Boundaries and next work

This proves interoperability of actual annual claims with Raydium's published devnet deployment. It does not establish live stock custody, qualified annual dividends, price discovery or production readiness. The collateral and quote are controlled test mints. No dividend events were attested to this public series.

The 2027 series remains open before its January 1 cutoff. Public chain time was unchanged; paired recombination is the public exit proof. Independent redemption after maturity/finalization remains the separate [local wallet proof](wallet-review.md). Do not imply those local and public claims moved between networks.

The harness is deliberately fixed to this 2027 fixture and reviewed program/SDK hashes. It is not a general market router. Public RPC limits, a static minimum test-spend allowance and manual recovery remain operational limitations. Next, expose the validated liquidity flow in the wallet app, qualify issuer event/custody evidence, and refresh submission material to match working functionality. The separate guided walkthrough page remains deferred.
