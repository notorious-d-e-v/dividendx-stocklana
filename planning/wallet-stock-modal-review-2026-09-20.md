# Stock modal and wallet flow refinement

Local follow-up to [wallet polish](wallet-polish-review-2026-09-20.md). Preserve the accepted designs, original illustrations and prior local evidence. No frontend release is authorized by this visual review pass.

## Changes requested

- Try a brand-guide hero illustration with the earlier editable diagram retained for comparison/rollback.
- Replace letter-square stock badges with small solid company-color dots. Names still identify the assets; colors do not imply endorsement.
- Market asset selection opens a stock modal with current holdings and a deliberate faucet action when needed. The button distinguishes stock funding from a potential SOL top-up.
- Keep Split/Redeem layout stable while changing selected stock. Correct-context balances may render immediately; transaction controls require a fresh matching quote. Never relabel another asset's cached quote.
- Offer a visible move to Redeem after a successful split, preserving issuer, mint, year and wallet context.

## Faucet source, capacity and policy

The faucet is `C6U91C2a2CxKfiDNTaTHvbQe41CdRwtjsr47ip6zKyVb`. It transfers prefunded devnet SOL; DividendX does not mint native SOL. The [18 September endowment evidence](evidence/devnet-public-faucet-endowment-2026-09-18.json) records a finalized 989,113,040-lamport transfer from the dedicated devnet deployer `DpbSCimwNNWMcREiJ7npkWuDVywWgHHekZGx6K9TeRsv`, bringing the faucet to 1 SOL. Earlier admin funding was user-confirmed; the upstream origin of that funding is not established by this record.

A read-only check at confirmed slot 501349135 found **953,368,120 lamports (0.95336812 SOL)**. Dividing by the per-grant maximum debit/reservation of 9,000,000 lamports gives **105 conservative full-cost grants** from that balance, absent other spending. This is not a remaining-quota promise. The private durable ledger can stop the faucet sooner and was not inspected in this UI pass.

Existing controls remain unchanged: 30 grants / 0.27 SOL reserved per day; three grants per visitor/day; 12 per observed IP/day; one idempotent grant per wallet/asset/day; and a 1 SOL lifetime reservation cap. From a fresh ledger the lifetime cap permits at most 111 nine-million-lamport reservations. Actual remaining capacity depends on prior reservations, not just the chain balance. The development preview shares one upstream visitor across its browser tabs.

The existing server tops the holder up by `max(0, 6_000_000 - holder_balance)` and mints 10 stock units. It pays the collateral token-account rent and the faucet transaction fee. Holder-paid split creates two classic token accounts; recombination usually reuses the collateral account. The browser's funding label is informational: the server makes the authoritative balance check.

This policy belongs to public devnet. The accelerated local/hosted wallet sandbox supplies 100 raw stock units per wallet/asset and funds each wallet with 2 local SOL once per runtime. Its modal therefore says “Request [symbol]” and explains the session funding rule, without promising the public devnet quantity or threshold.

At this audit's RPC rent values, a classic SPL ATA needs 1,488,440 lamports and a Token-2022 ATA needs 1,513,840. With a 5,000-lamport fee assumption, 0.006 SOL leaves about 0.00301812 after the initial split and 0.00301312 after recombination. Split plus one transfer creating a recipient's claim ATA leaves roughly 0.00152468. Two such new-account transfers leave little margin (0.00003124). The target covers the basic demonstrated flow, not arbitrary future accounts, changing rent, priority fees, or a recipient's later sends. No budget or target increase is part of this pass.

Code sources: [policy](../packages/hosted-devnet/src/contract.ts), [funding transaction](../packages/hosted-devnet/src/chain.ts), [durable quotas](../packages/hosted-devnet/src/ledger.ts), [holder transactions](../apps/web/src/wallet/chain.ts).

## Art

[Hero study v2](../design/illustrations/prompts/stock-dividend-separation-v2.md) uses the existing paper-certificate style and a separated amber annual-rights slip, with editable PT/DR captions. Canonical PNG and a 71 KB transparent WebP derivative are versioned; existing illustrations remain untouched.

## Verification

The [actual browser receipt](evidence/stock-modal-2026-09-20-r2.json) records two independently checked public devnet transactions using an existing dedicated QA holder: split one AAPLon into PT/DR, follow the new Redeem prompt with the same mint/year, then recombine. All token balances returned to their starting values; fees totaled 10,000 lamports (0.00001 SOL). No faucet grant was requested. The harness signed only the two approved instructions; this proves the local UI and public chain flow, not an installed browser extension or live issuer shares.

Desktop and mobile captures show the generated hero, all 15 company dots, stock balance modal, stable switching between two held stocks, and the Redeem nudge. No browser errors or horizontal overflow occurred at 1440px/390px. The [initial attempt](evidence/stock-modal-2026-09-20.json) stopped before signing because the QA driver expected ten stock units while the existing wallet held one; the corrected r2 run preserves that earlier evidence.

Root tests: **95 passed**. Type checking and production build passed. The full browser regression suite passed **93/93** cases. Targeted checks cover public SOL balances immediately below and at the threshold, distinct local funding copy, late wallet/SOL/quote responses, modal focus, and fresh-quote action gating. Transaction buttons also reject zero, invalid and above-balance amounts.

Review locally at `http://127.0.0.1:4184/app/`; append `?usehero=diagram` to compare the previous hero. Artwork passed alpha/background and browser placement review; user approval remains pending. Existing user edits and prior evidence are retained. No commit, push or frontend deployment is included.
