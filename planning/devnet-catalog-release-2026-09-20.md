# Devnet catalog release — 20 September 2026

The public registry expands from three to fifteen synthetic issuer-specific profiles across six companies. The program ELF, original three mints/series, runtime identity, signer authorities and real-calendar 2027 terms are unchanged. No issuer event settlement or mainnet custody is enabled.

[PR #3](https://github.com/notorious-d-e-v/dividendx-stocklana/pull/3) merged as `6e79a76192258af8530cbe874c02d2c14fa6b6b0`. Vercel production `dpl_4cyXy5Gk3tEUAi1CsZfMgsZiSU6S` serves `https://dividendx-stocklana-a0ir4lh27-payai.vercel.app` and the canonical `https://divx.payai.network`. The existing frontend and Sandbox snapshot remain unchanged; the separate navigation/wallet redesign stays local.

Provisioning: 48 finalized transactions, 0.26529408 devnet SOL admin spend under a separate 0.30 SOL migration cap. Verification: all 15 profiles mint, split and recombine exactly; all 61 proof transactions are independently finalized. Its dedicated wallet received 0.12 devnet SOL (admin funding cost 0.120005 SOL), and paid its own account rent and transaction fees. The public faucet signer supplied mint authority only during this proof.

Validation: 18 devnet-runtime tests, 39 hosted-devnet tests and two verification-harness tests pass. The exact Vercel build passes in an isolated checkout; no frontend changes are in the release. The original 0.15 SOL bootstrap guard remains unchanged. Completed migration replay verifies the full registry without issuing additional transactions.

The single existing six-hour refresh job now validates the selected profile at preparation and submission, and has a 300-second function limit. It retains the 45-second send lease, signed-byte journal, 12-hour observation validity and 0.01 SOL reservation budget. At 15 profiles per bucket, an unused budget covers at most 16⅔ days; its exhaustion remains a visible operational limit. Faucet quotas and the 1 SOL lifetime budget are unchanged.

Rollback target before this release: `dpl_DchchfnnkvRrt2GyCAwK9LyRQsvm`, `https://dividendx-stocklana-h0kylrxuk-payai.vercel.app`. Rollback restores the former manifest/service and UI; it does not remove new onchain accounts or undo transactions. Sandbox snapshot remains `snap_mtdgtBAGmcNu8Ucj1M9kCARBKYvq`.

## Hosted verification

The deliberate refresh run processed all 15 profiles in 118.861 seconds (11 confirmed, four pending). A 5.307-second reconciliation confirmed all 15 using identical recorded signatures. No operation was replaced or duplicated. The [public Apple browser test](evidence/devnet-catalog-apple-browser-2026-09-20.json) passes: one bounded 10-token grant, identical-request reuse of the same grant signature, one-unit split and recombination, ending at 10 stock / 0 PT / 0 DR. No browser errors or horizontal overflow occurred.

Evidence: [provisioning](evidence/devnet-catalog-expansion-2026-09-20.json), [holder proof](../packages/devnet-runtime/qa/summary.json), [independent holder finality](evidence/devnet-catalog-holder-finality-2026-09-20.json), [refresh](evidence/devnet-catalog-hosted-refresh-2026-09-20.json), [refresh reconciliation](evidence/devnet-catalog-hosted-refresh-reconciled-2026-09-20.json).
