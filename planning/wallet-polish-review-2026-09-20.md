# Wallet and asset discovery — local review

This pass follows the user's review of the 15-asset devnet app. It remains local until approved for publication. Earlier [navigation review](navigation-wallet-review-2026-09-20.md) and [devnet catalog release](devnet-catalog-release-2026-09-20.md) remain preserved.

## Decisions

- Wallet connection lives in the header modal. Keep the existing official Solana Wallet Standard integration and transaction-message verification; show installed compatible wallets, official download links for Phantom/Solflare/Backpack, and a temporary memory-only wallet.
- Market uses the approved guided-demo visual language and a short explanation. Split and Redeem remain focused on actions. Remove the inline connection section and the explanatory dropdown.
- Issuer choices sort Ondo, Backpack/Trek, then xStocks. Colored ticker and issuer-initial badges identify assets without introducing external image dependencies or claiming endorsement.
- Discover supported collateral and annual PT/DR balances in canonical associated token accounts. This matches the accounts the transaction SDK spends. Unsupported mints and balances in non-associated token accounts are outside this inventory. Selected transaction quotes still independently validate policy, mint, series and custody.
- Show real devnet account and transaction links on Solscan with `cluster=devnet`. Local/sandbox receipts have no public explorer links; runtime IDs, domain digests and genesis hashes are not account links.
- All 15 devnet stock profiles are synthetic mints created by DivX. The faucet provides these tokens and a small devnet SOL allowance; it does not distribute actual issuer securities.

## Local preview

From the repository root, after building the transaction SDK:

```sh
VITE_DIVIDENDX_NETWORK=devnet VITE_DIVIDENDX_RUNTIME_URL=/api/devnet \
  node node_modules/vite/bin/vite.js --config scripts/hosting/devnet-review.vite.mjs
```

Open http://127.0.0.1:4184/app/. The development-only bridge forwards exactly the public manifest and faucet routes to our existing `dividendx.payai.network` service. It loads no signer keys or service secrets and shares one upstream visitor across local browser tabs. Existing durable visitor/IP/global/lifetime faucet quotas remain enforced. It accepts only the fixed loopback host/origin, caps request size, rejects foreign origins and arbitrary paths, and never exposes the upstream cookie to the browser. The normal production Vite config does not include this bridge.

Faucet availability depends on the public service and remaining quota. A grant is 10 stock units plus bounded devnet SOL; it is not the accelerated guided tour's 100-stock scenario. Public devnet uses the real calendar. No dividend fast-forward or settlement change is part of this pass.

## Verification

- Root fixture/reference/research checks: 95 tests pass. Type checking and production build pass; the existing bundle-size advisory remains.
- Full browser suite: 83 tests pass, including five inventory checks. Coverage includes Wallet Standard rejection/retry/disconnect, modal focus and install choices, empty/funded supported holdings, bad account identities, bounded RPC transport, devnet identity, hosted routes, and preserved demo/rehearsal behavior.
- Final focused wallet/inventory rerun after visual adjustments: 29/29 pass.
- Local preview bridge: three offline tests pass for fixed route/origin/body boundaries, hidden upstream cookie, and unchanged public quota errors.
- [Actual devnet browser evidence](evidence/wallet-polish-2026-09-20-r2.json): one existing bounded faucet grant to a fresh browser wallet, one-stock split, matching-pair recombination; all three signatures independently checked (two finalized, one confirmed at capture). Final independent token-account balances are 10 IBMon, 0 PT and 0 DR. The faucet initially returned pending, and the UI correctly waited for confirmation.
- Desktop/mobile layouts have no horizontal overflow. Astra reviewed the [Market](evidence/wallet-polish-2026-09-20-r2-market-1440.png), [mobile wallet modal](evidence/wallet-polish-2026-09-20-r2-wallet-390.png), and [mobile Split](evidence/wallet-polish-2026-09-20-r2-split-390.png) captures. Original user-edited and legacy QA images were restored after browser checks.
- The [first driver attempt](evidence/wallet-polish-2026-09-20.json) stopped on a mistaken QA selector before creating a wallet or sending any transaction. The corrected driver completed without browser errors.

Installed browser extensions require a manual follow-up; injected Wallet Standard tests and temporary-wallet execution do not prove every extension or mobile wallet environment. Public devnet synthetic assets do not prove live issuer custody or settlement. No frontend release was made.
