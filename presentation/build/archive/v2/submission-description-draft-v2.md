# Submission description draft

DivX is a proposed Solana vault that separates a tokenized stock position into stock exposure and one event's dividend rights. A holder can keep the stock exposure while offering the dividend claim to a buyer. Both claims remain backed by the same locked xStock collateral and redeem in xStock units, so their dollar value can change.

The current prototype includes an approved product interface and a working historical calculator. It uses xStocks' verified KOx cash-dividend adjustment from 15 September 2026 and shows how 100 pre-event displayed KOx allocate to 100.0000 KOx of stock exposure plus 0.4152 KOx of dividend rights. The calculator uses a dated source snapshot and does not claim a vault captured the historical event.

The hackathon build target is a complete test-asset flow: deposit xStock, issue paired PT and DR claims, sell the DR claim using a controlled counterparty, process the verified historical event, and redeem both claims separately. The accounting checks issuer event classification against the onchain multiplier so a stock split cannot become dividend yield. KOx supplies the dividend case; the exact HONx reverse-split event supplies the rejection control.

Next, DivX would validate a future live series before adding more stocks or issuers. Backpack remains an expansion candidate pending reliable corporate-action data. No deployed mainnet vault, production liquidity, partnership, or guaranteed return is claimed in this draft.
