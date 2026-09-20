# Stocklana wrap-up and submission packet

Checked 20 September 2026. This packet prepares the entry; no registration, submission or outreach has been sent.

## Official requirements

The [Stocklana rules](https://hackathons.solana.com/hackathons/stocklana) now give **Friday 25 September, 4 p.m. Eastern** as the deadline: **20:00 UTC / Saturday 26 September, 04:00 Asia/Makassar**. The local browser header shows September 26; the written timeline supplies the precise time. The older September 18 timeline in our notes is superseded. Judging continues through October 2.

Register, then use [Submit Project](https://hackathons.solana.com/hackathons/stocklana/submit). Include at least one repository, live-demo or video link. Teammates can be invited from the form, and entries can be edited until closing. One original entry per team; acknowledge open-source components. Judges emphasize a real user/problem, working end-to-end experience, Solana relevance and execution quality. The main track is $100,000; total listed cash prizes are $126,000. No public requirement specifies slides or video duration. Signed-in field requirements remain to be inspected.

**Track recommendation:** main track, credit/yield and infrastructure. No sponsor-bounty integration is currently proved: Meteora requires DBC use, Pyth requires meaningful data use, and the other listed bounties require their respective products. Do not add an unqualified integration just to chase a bounty.

## Ready-to-use entry copy

**Name:** DividendX

**Short description:** One stock. Two tokens. Separate a tokenized stock's price exposure from a year of dividend rights on Solana.

**Problem and user:** A stockholder may want cash today without selling their whole stock position. Another investor may want exposure to dividends without buying the stock. Traditional markets already trade dividend exposure separately; tokenized stocks let us bring that idea into wallets and DeFi.

**What we built:** DividendX deposits stock tokens into a Solana vault and issues two annual claims: PT for stock exposure and DR for qualified dividends within that year. Users can transfer the claims and recombine matching pairs. After the year ends and its dividend records are resolved and finalized, the claims redeem independently. DR keeps its accumulated entitlement without expiring. Allocations are paid in stock tokens, not a promised dollar amount.

**Try it:** The public devnet app lets users obtain synthetic stock tokens, split them and recombine them. Fifteen synthetic profiles represent selected xStocks, Ondo and Backpack/Trek assets across six companies. The separate private sandbox accelerates the year so visitors can see multiple dividends, partial recombination, DR trading through Raydium, liquidity provision/removal and the two holders' separate exits. The sandbox uses synthetic funds/events and real program execution; the public devnet follows the real calendar.

**Why Solana:** The vault and claims live on one shared network. Splits execute atomically, positions can be fractional, custody and claim supply are inspectable, and ordinary SPL claim tokens can interact with compatible Solana protocols. We have verified Raydium test transactions; other venue integrations remain future work.

**What is next:** Qualify issuer custody and complete dividend-event data, implement the reviewed evidence-to-settlement pipeline, and complete independent security, operational and legal review before any real-asset/mainnet launch. Current issuer readers and local mint-compatibility tests do not establish live issuer settlement or endorsement.

**Links:** [Live guided demo](https://dividendx.payai.network/), [Public Devnet](https://dividendx.payai.network/app/), [public repository](https://github.com/notorious-d-e-v/dividendx-stocklana), [known gaps](mainnet-readiness-2026-09-20.md), [technical proof index](../docs/artifact-map.md). Add the recorded video URL once available.

## Recommended three-minute recording

This is our suggested presentation format, not a hackathon rule. Record a fresh private guided session; its 15-minute lifetime gives enough room for retakes. Avoid wallet keys, cookies and authenticated issuer responses on screen.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:20 | Hero / stock becoming PT and DR | “One stock, two tokens. Keep the stock side and trade a year of dividend rights.” Name the two users: stockholder and dividend buyer. |
| 0:20–0:55 | Part One: choose stock, get balance, split, recombine | Explain the two claim tokens and partial recombination in plain language. Label the private accelerated sandbox once, clearly. |
| 0:55–1:25 | Part Two: two quarterly events, partial exit | Show the allocation changing. Say these are simulated events demonstrating a multi-event annual series. |
| 1:25–2:10 | Part Three: provide DR liquidity, buyer swaps USDC, withdraw LP | Follow both wallets. Distinguish swap proceeds/fees from the dividend allocation. |
| 2:10–2:35 | Year end and independent redemption | Explain that maturity stops new eligible ex-dates; complete, resolved records still need finalization. Unclaimed DR does not forfeit its allocation. |
| 2:35–3:00 | Public devnet plus roadmap/known gaps | Show the actual public app and transaction links. Close with issuer-grade settlement, reviewed mainnet custody and more compatible protocols as next steps. |

## Remaining work to finish the entry

1. **Release and acceptance:** merge reviewed changes, verify the canonical hosted routes and actual guided/public flows, and preserve release receipts. Track in [wallet release](wallet-release-2026-09-20.md).
2. **Signed-in form:** confirm required fields, limits, team invitations and any acknowledgments with the user's account. Prepare draft values; user submits the final entry. No required field is assumed from public copy.
3. **Record the short video:** host an accessible link, check it in a signed-out browser, and include repo + demo + video even though the public minimum is one link. A video keeps the story accessible if the bounded sandbox is busy.
4. **Version the final presentation:** preserve the user's [narration](../presentation/narration.md) and approved deck. A new export should replace singular-event DR wording and the old calculator centerpiece with annual rights and the verified guided flow. Keep the current market statistics explicitly dated or omit them; don't call historical numbers current.
5. **Credits and license decision:** acknowledge reused open-source dependencies (Solana/Anchor, Raydium programs/SDK, wallet tooling and other shipped packages with their notices). The repository is public, but no top-level license was found in this review; choose an explicit license before calling the project open source. Do not invent issuer or partner endorsement.
6. **Outside-user pass and submit:** let one new visitor finish the tour; check mobile, links and the disclosed limits, then submit early enough to correct any form problems. Recommended internal target: September 24, leaving a day before the official deadline. Retain confirmation and final submitted URLs.

## Launch and next week

Announce a **working devnet prototype**, with the guided tour as the first link and an easy-to-find limitations/roadmap link. A mainnet launch is a separate milestone, governed by the [readiness gates](mainnet-readiness-2026-09-20.md).

Start with xStocks, Ondo, Backpack/Trek and Raydium; they have the closest evidence/data overlap. Solana/Stocklana, Superteam and Circle are useful showcase routes. Jupiter Lock, Streamflow, Meteora, Squads and Pyth are prospective technical collaborators, not shipped DividendX integrations. The [ranked outreach plan](ecosystem-outreach-2026-09-20.md) includes official routes, a specific ask for each team and the week's sequence. No messages are scheduled or sent by this document.
