# Solana tokenized-equity issuer landscape

**Research date:** 2026-09-16  
**Scope:** Solana mainnet products that are, represent, or reference individual company shares. Funds and ETFs are noted only where they clarify the boundary. xStocks, Ondo Global Markets, and Backpack Securities have separate project research; this report tests whether the rest of the market can share their integration path.

## Decision

“All tokenized stocks on Solana work automatically on day one” is false.

The wider market contains at least four incompatible asset models:

1. freely transferable total-return wrappers that encode reinvestment through a Token-2022 `ScaledUiAmount` multiplier;
2. issuer-sponsored registered shares whose accounts are frozen by default and may only be thawed for KYC-approved holders and protocols;
3. fee-on-transfer economic-exposure tokens that grant no share or dividend rights; and
4. restricted debt notes or microcap wrappers with bespoke legal payoffs, lockups, fees, and compliance controls.

For a two-day build, DividendX can credibly target only an explicit registry of verified mints whose transfer and dividend mechanics match implemented adapters. It cannot claim support until those adapters and deposit/claim flows are working. Superstate, Securitize, OTCM, Republic, PreStocks, and wound-down Remora assets should fail closed unless a provider-specific adapter and legal/allowlist path has been completed.

“Unsupported” should mean DividendX refuses deposits and does not calculate a dividend claim. “Restricted” should mean the mechanics may be implementable, but the issuer or transfer agent must first approve and allowlist DividendX's program-derived custody addresses or another compliant custody design. Neither label means the token is defective.

## Status map

| Family | Solana status | Instrument and rights | Mechanics relevant to DividendX | Day-one disposition |
|---|---|---|---|---|
| xStocks / Backed (Kraken-owned) | Live; separate inventory | Collateralized tracker/security, not an entry on the issuer's shareholder register | Token-2022, total-return multiplier | Candidate through separate adapter work |
| Ondo Global Markets | Live; separate inventory | 1:1-backed total-return trackers | Token-2022, balance scaling; separate event semantics | Candidate through separate adapter work |
| Backpack Securities | Live; separate report | Broker/issuer-sponsored products; rights vary by offering | Mint-specific controls and distribution | Candidate only for mints verified in that report |
| **Superstate Opening Bell** | **GLXY, EXOD, FWDI live; HSDT deployed with zero supply** | Actual registered public-company shares, recorded through the transfer agent | Token-2022; default frozen; permanent delegate; `ScaledUiAmount=1`; wallet and protocol allowlists | **Restricted; no automatic PDA custody** |
| **Securitize** | **SECZ and CURR products live; observed Solana mint identities await a public issuer registry or direct confirmation** | Actual issuer-sponsored common/ordinary shares with shareholder rights | Candidate mints are Token-2022, default frozen, permanent-delegate controlled, pausable, with `ScaledUiAmount=1` | **Restricted and provisional; no automatic PDA custody** |
| **OTCM Protocol** | **GROO production launch confirmed in issuer filing; MSPC is a separately indexed candidate mint** | Earlier products represent special preferred shares held by a transfer agent; platform later proposed direct Common Class B rights | Candidate MSPC mint is Token-2022 with a mutable 7% transfer fee; platform documents also describe a transfer-hook compliance architecture | **Unsupported without official mint confirmation and per-mint legal/fee/hook adapter** |
| **PreStocks** | **Live private-company exposure tokens** | SPV-linked economic exposure; expressly no ownership, voting, information, or dividend rights | Representative ANTHROPIC mint has 50 bp transfer fee, permanent delegate, pausability | **Out of dividend scope and accounting-incompatible** |
| **Republic Mirror Tokens** | Solana issuance/closed offerings; no official public mint found | RepublicX unsecured contingent-payout notes referencing private-company values; no underlying equity or dividends | Republic Wallet, KYC/AML, transfer lock/restrictions; proprietary Token-2022 security-token standard | **Out of stock-dividend scope** |
| **Remora Markets / Step Labs** | **Reported wind-down since Feb. 2026; historical accounts remain onchain** | Custodied-share tracker claims, not direct registered shares | Historical Token-2022 mints use `ScaledUiAmount`; no surviving public event API found | **Do not onboard** |
| **WisdomTree Digital Funds** | Live on Solana | SEC-registered open-end mutual-fund shares, including equity funds; not individual stocks | Token-2022 transfer hook requires compliance Soulbound Tokens | **Adjacent fund product; restricted and excluded** |
| **Alphaledger / Vulcan Forge / SILO** | Devnet/beta test; no mainnet product verified | Planned direct registered Silo Pharma shares through West Coast Stock Transfer | Platform supports SPL or Token-2022, freezes, hooks and whitelists | **Announced/test only** |
| **Dinari dShares** | Solana expansion announced, not live in official chain list | Custodial share-backed tokens with cash dividends and corporate actions | Current production is on EVM chains | **No Solana mint to support** |
| **bStocks, Reality, Figure OPEN** | Other chains | bStocks: BNB wrappers; Reality: Arbitrum/Morph wrappers; Figure: Provenance-native shares | Chain-specific implementations | **No native Solana product found** |

The status terms are intentionally narrow: “live” requires an issuer/platform statement plus a mainnet deployment or observable supply; “deployed, zero supply” is not treated as investable; “announced/test” lacks a verified production mainnet product; “historical” means the accounts remain onchain but the issuer no longer offers normal operations.

## Superstate Opening Bell

### What the tokens are

[Superstate's current equity documentation](https://docs.superstate.com/investors/tokenized-equities.md) says Opening Bell tokens are legal shares of public companies, not derivatives or synthetic wrappers. Superstate is the digital/SEC-registered transfer agent and maintains the shareholder registry across book-entry balances, tokens, and integrated protocols. The public companies remain the equity issuers; Superstate supplies issuance, registry, tokenization, and transfer-agent infrastructure.

Opening Bell also offers a [Direct Issuance Program](https://docs.superstate.com/integration-partners/direct-issuance-program.md) through which a public company can sell newly issued shares at or below the exchange price for stablecoin settlement. Those shares are recorded in the investor's name and carry the same economic and governance rights as traditional shares. This is a platform capability, not a separate stock class and not evidence that a live Direct Issuance market exists: the public `/v1/assets` registry returned `has_active_dip_market: false` for every asset observed.

### Current official Solana registry

Superstate's public [`/v1/assets`](https://api.superstate.com/v1/assets) and [`/v3/equities`](https://api.superstate.com/v3/equities?limit=200) endpoints returned:

| Symbol | Solana mint | Registry state on 2026-09-16 |
|---|---|---|
| GLXY | `2HehXG149TXuVptQhbiWAWDjbbuCsXSAtLTB5wc2aajK` | Completed; positive circulating supply |
| EXOD | `3DBudkWQNbXGAjzEAtpjMKorb76sjozcHCzc8ZtkHDAQ` | Completed; positive circulating supply |
| FWDI | `7GzQgf6DPo6ZANjnbhe9tNCpkGTv3zqHbsDx74jyQf9` | Completed; positive circulating supply |
| HSDT | `8UBqBGXM4NF22y5TZs8PhNVwVNqsHw2jBstfcxsSZaQ4` | Completed mint, but zero total and circulating supply |
| STKE, UPXI | — | Catalog records with no deployment |
| SBET | — | Ethereum and Linea only |
| PLAS | `EMFTTUntNWDoGwdWUs4wrycYWRKDfot1J2XMB62Q6z24` | Explicitly named `PLASTIC INC (test)`; excluded |

The evidence snapshot is in [`solana-landscape-superstate-api-2026-09-16.json`](../evidence/solana-landscape-superstate-api-2026-09-16.json). USTB, USCC, and CUSHY also appear in the API, but their `instrument_domain` is `Funds`; [Superstate's fund docs](https://docs.superstate.com/investors/tokenized-funds.md) identify them as fund shares. They are not stocks.

The live Opening Bell rows are shares of listed public companies. STKE's `allowlist_type: Private` describes access mode, not a private-company security; Sol Strategies is publicly listed and the row has no deployment. No live private-company or SPAC share token appeared in the observed Superstate registry. Direct Issuance is a primary-issuance workflow, not evidence of a SPAC or private-share product.

GLXY provenance is especially strong: [Galaxy's investor-relations page](https://investor.galaxy.com/ir-resources/tokenized-glxy-shares) publishes the same mint and says the tokens are SEC-registered Class A common shares with the same rights as conventional shares. [Exodus's instructions](https://www.exodus.com/support/en/articles/12582935-how-do-i-tokenize-my-shares-on-solana-through-superstate) describe moving EXOD from Securitize book entry to Superstate and then to an allowlisted Solana address.

### Why generic custody fails

The four Solana equity mints are Token-2022, six decimals, `DefaultAccountState=Frozen`, with a permanent delegate and live mint/freeze authorities. Each currently has `ScaledUiAmount.multiplier=1`; no transfer-hook extension appeared in the parsed mint accounts. The restriction is enforced through frozen token accounts and issuer-controlled thawing rather than a mint-level hook.

[Investor instructions](https://docs.superstate.com/investors/tokenized-equities.md) require identity onboarding and separately adding each third-party wallet to the equity allowlist. The [issuer guide](https://docs.superstate.com/issuers/opening-bell.md) says supported protocols are selected as part of setup. Therefore:

- Superstate API value `allowlist_type: Public` describes who may apply; it does not make arbitrary addresses permissionless receivers.
- A wallet owner being eligible does not establish that a DividendX PDA or vault token account is eligible.
- Merely creating an associated token account cannot make it transferable; the issuer-controlled freeze/thaw path matters.
- Permanent-delegate and freeze powers mean balances can be moved or stopped under the offering's compliance rules.

### Dividends and corporate actions

These are actual shares, so their economic rights include any declared dividends. Opening Bell advertises issuer support for splits, distributions, and other corporate actions. The public mint multiplier being present does **not** prove Superstate uses it for dividends; all four observed multipliers were `1`.

[Superstate's public API](https://docs.superstate.com/investors/api.md) exposes assets/equities and fund NAV/yield data. Its [OpenAPI schema](https://api.superstate.com/api-docs/openapi.json) contains internal/authenticated dividend transaction types such as distribution, reinvestment, withdrawal, and tax withholding, but no unauthenticated equity-dividend event feed was found. A DividendX adapter needs a provider-approved source for declaration, record, ex-dividend, payment, tax, and settlement data. It must also know whether a specific issuer pays cash/stablecoins, reinvests into shares, adjusts a multiplier, or uses another corporate-action process.

## Securitize direct shares

[Securitize's SECZ launch announcement](https://investors.securitize.io/news/news-details/2026/Tokenizing-SECZ-Securitize-Brings-Its-Own-Public-Stock-Onchain-at-Listing-Day/default.aspx) says tokenized SECZ is the same common stock trading on the NYSE, not a synthetic, wrapper, or separate class. Access is limited to eligible U.S. investors who complete onboarding and KYC/AML. It launched on Solana and Avalanche.

[Currenc's SEC filing](https://www.sec.gov/Archives/edgar/data/1862935/000149315226015819/form6-k.htm) says CURR ordinary shares are live on Ethereum and Solana through Securitize, its co-transfer agent. Tokenized holders have the same ownership, voting, and corporate-action rights as conventional holders.

Representative Solana observations:

| Symbol | Mint | Provenance and mechanics |
|---|---|---|
| SECZ | `5VzwKkvynPJzcgwhBe7ESEyNgqMbo15yBu7Sehssd9ED` | Token-2022 metadata names Securitize Corp./SECZ and points to `metadata.securitize.io/secz.json`; default frozen, permanent delegate, pausable, multiplier 1 |
| CURR | `Db7QEHL5keqhukiPFXo2zw6LXnkkyvToTBazge4aUZbG` | Token-2022 metadata names Currenc Group Inc./CURR and points to `metadata.securitize.io/currenc.json`; same control pattern, multiplier 1 |

No public Securitize registry page publishing those mint addresses was located. Their issuer-controlled metadata plus the issuer/SEC launch evidence makes them high-confidence candidates, but DividendX should require direct mint confirmation before production use.

[Securitize's SEC disclosure](https://www.sec.gov/Archives/edgar/data/2094496/000162828026054866/securitizeholdings-424b3.htm) describes asset servicing that includes distributions and dividend issuances, but no public equity corporate-action/event API was found. As with Opening Bell, the presence of `ScaledUiAmount` at multiplier 1 is not proof of a reinvestment method. Frozen-by-default accounts require an issuer-approved custody/onboarding design.

## OTCM Protocol: live, fee-bearing, and legally heterogeneous

OTCM's [2026 10-K](https://www.otcmarkets.com/filing/html?guid=5xj-kFHS952tV3h&id=19255403) describes ST22 tokens on Solana as issuer-sponsored Token-2022 securities backed 1:1 by Series M preferred shares held at Empire Stock Transfer. It also describes a transfer-hook security foundation with 42 compliance controls and identifies GROO as its first live production deployment. Earlier [Series M materials](https://www.sec.gov/files/ctf-written-input-otcm-protocol-010326.pdf) described non-voting, non-dividend shares. An [April 2026 SEC submission](https://www.sec.gov/about/crypto-task-force/written-submission/ctf-written-input-goovy-company-inc-dba-otcm-protocol-040226) says the architecture was changed to Common Class B shares with voting, dividend, and liquidation rights plus centralized KYC/KYB/AML/OFAC onboarding.

That evolution means the platform name is not enough to infer rights. Each mint needs its offering documents, backing class, holder eligibility, fee schedule, and live extensions checked.

Separately indexed candidate mint MSPC, `mSPC1w6z8shpabFpQFgUkBGTuytsiUtv8h7smruo6A3`, was observed on mainnet as Token-2022 with nine decimals, revoked mint/freeze authorities, no parsed transfer hook, and a mutable 700 bp transfer fee whose maximum is `u64::MAX`. Its metadata URL is under `ipfs.otc.meme`, and [Solflare indexes the same address as an MSPC Series M token](https://www.solflare.com/prices/mspc/mSPC1w6z8shpabFpQFgUkBGTuytsiUtv8h7smruo6A3/). This is public-chain and third-party identity evidence, not an issuer mint registry. DividendX must not accept it until OTCM confirms the address and current offering terms.

The fee alone defeats generic vault accounting: depositing an exact input amount does not deliver that amount to the vault, and any later distribution or withdrawal may incur another fee. The platform's documented hook/KYC architecture is an additional mint-specific compatibility question, even though MSPC itself had no parsed hook at the observation slot.

## PreStocks: exposure without dividends

[PreStocks' product page](https://prestocks.com/products) lists Solana tokens referencing private companies. Its [official FAQ](https://prestocks.com/faq) is explicit: a token provides economic exposure and does not provide ownership, voting, information, or dividend rights in the referenced company.

Representative official catalog mint ANTHROPIC, `Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw`, is Token-2022 with nine decimals, a permanent delegate, pausability, multiplier 1, and a 50 bp transfer fee with an effectively unbounded maximum. A transfer-hook extension record exists but currently has a null program id. Other product addresses include SpaceX `PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh`, OpenAI `PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF`, and xAI `PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx`.

PreStocks is not a DividendX dividend source: the legal terms disclaim dividends, and its transfer fee breaks exact-input accounting unless the vault explicitly handles net receipts and fee-bearing withdrawals.

## Republic Mirror Tokens: reference notes, not stock

[Republic's current rSPAX offering page](https://republic.com/rspax2) calls rSPAX a digital representation on Solana of RepublicX contingent-payout notes. It says investors receive no SpaceX equity, voting rights, or dividends. RepublicX is the sole counterparty; proceeds need not buy SpaceX shares. A payout may occur at an IPO, acquisition, dissolution, other qualifying event, or ten-year maturity and remains subject to issuer credit, fees, and valuation terms.

Receipt requires a Republic Wallet. Transfers are subject to lockups, KYC/AML, and Republic's discretion over any secondary listing. No official public mint address was found, so this report does not assert one.

Republic publishes an open-source [Solana Security Token Standard](https://github.com/Solana-Security-Token-Standard/solana-security-token-standard) with Token-2022 transfer restrictions, KYC/AML, corporate-action instructions, IDL, and generated clients. That is useful integration documentation, but the repository does not by itself prove the configuration or public mint of rSPAX.

## Remora: historical accounts are not live issuer support

Step Labs acquired Remora and launched stock trackers in 2025; its own [year-in-review post](https://stepfinance.medium.com/2025-the-year-of-the-step-d3a8823d9ecd) describes the product. A February 2026 [post at Step Finance's official X URL](https://x.com/StepFinance_/status/2025986934112145849) is indexed as announcing a wind-down and Remora unwind/redemption; direct retrieval returned an access error during this review. [Contemporaneous reporting](https://decrypt.co/358970/solana-defi-project-step-finance-wind-down-operations) corroborates the closure. The status is therefore well corroborated but not preserved here as a directly fetched primary statement.

Historical mints still visible onchain include TSLAr `FJug3z58gssSTDhVNkTse5fP8GRZzuidf9SRtfB2RhDe`, NVDAr `ALTP6gug9wv5mFtx2tSU1YYZ1NrEc2chDdMPoJA8f8pu`, SPYr `AVw2QGVkXJPRPRjLAceXVoLqU5DVtJ53mdgMXp14yGit`, and MSTRr `B8GKqTDGYc7F6udTHjYeazZ4dFCRkrwK2mBQNS4igqTv`. [Solflare's token registry indexes the TSLAr address as Remora's Tesla rStock](https://www.solflare.com/prices/tesla-rstock/FJug3z58gssSTDhVNkTse5fP8GRZzuidf9SRtfB2RhDe/), but no surviving official mint registry was found. These addresses are historical discovery records, not a production allowlist.

TSLAr remains a Token-2022 mint with nine decimals, permanent delegate, pausability, and multiplier 1; no transfer hook appeared. This resembles the low-level multiplier primitive used by current total-return wrappers, but provider operations have ceased and no surviving official dividend/corporate-action API was found. DividendX should reject Remora mints even if they retain supply or DEX quotes.

## Adjacent and other-chain exclusions

- [WisdomTree](https://ir.wisdomtree.com/news-events/press-releases/detail/774/wisdomtree-expands-tokenization-ecosystem-to-solana) offers its regulated tokenized **fund** suite on Solana, including equity funds. These are registered mutual-fund shares maintained by a transfer agent, not individual company stocks. Its [OpenZeppelin audit](https://dataspanapi.wisdomtree.com/pdr/documents/REGULATORY_MISC/WDT/US/EN-US/SOLANA-TOKENIZED-FUNDS-AUDIT-REPORT/) documents a Token-2022 transfer hook that checks compliance Soulbound Tokens. This is restricted custody and a separate fund/NAV integration.
- [Dinari's August 2026 launch post](https://dinari.com/blog/dinari-launches-724-tokenized-stocks-available-to-u-s-investors-and-businesses) lists Ethereum, Avalanche, Arbitrum, and Base as current chains and says Sei and Solana are future expansions. Its dShares may deliver cash dividends and corporate actions, but no live official Solana deployment was found as of the research date.
- [bStocks documentation](https://bstocker.finance/docs/introduction) says the securities are issued on and withdrawable to BNB Smart Chain. No native Solana deployment was found.
- Reality rTokens were found on Arbitrum and Morph, not Solana. The issuer is part of the Bitget group; Bitget Wallet is a distributor.
- [Figure OPEN](https://investors.figure.com/news-releases/news-release-details/figure-announces-chain-public-equity-network-open-running) is built on Provenance Blockchain. It is a direct-share model, but not a Solana product.
- [Alphaledger](https://www.alphaledger.com/insights/west-coast-stock-transfer-adopts-alphaledger-technology-to-tokenize-securities-and-deliver-direct-ownership-to-investors/) and West Coast Stock Transfer announced Silo Pharma as their first direct-share issuer. Alphaledger subsequently described the SILO deployment as a successful Solana **devnet/beta** test with mainnet next. Its [Vulcan Forge API docs](https://vulcan-forge-docs.alphaledger.com/api/v1/financial-instruments/create) support SPL/Token-2022 mints, freeze authorities, transfer hooks, whitelists, and regulated lifecycle operations. No production mainnet SILO mint was verified.

## Issuer, platform, and venue are different roles

| Name | Role in this market |
|---|---|
| Public companies such as Galaxy, Exodus, Forward, Securitize, and Currenc | Issuers of the actual corporate shares in direct-share models |
| Superstate, Securitize, West Coast Stock Transfer/Alphaledger | Transfer-agent, registry, issuance, and/or tokenization infrastructure |
| Backed/xStocks, Ondo, PreStocks, RepublicX, OTCM entities | Issuer/counterparty of wrappers, trackers, notes, or special tokenized share instruments; legal form varies |
| Backpack Securities | Regulated issuer/broker/distribution role; see dedicated report |
| Sunrise/Wormhole Labs | Listing and distribution infrastructure for Backpack-issued products, not the stock issuer |
| Jupiter, Raydium, Kamino, Pump, Kraken, Backpack Exchange, Phantom, Bitget Wallet | Routes, venues, wallets, liquidity, brokers, or distributors depending on product; listing a token does not make the venue its issuer |

[Pump's custom-pair documentation](https://pump.fun/docs/custom-pairs) makes the distinction concrete for recent listings: Backpack Securities is the issuer while Sunrise is the listing provider. [Solana's Sunrise launch description](https://solana.com/news/how-external-assets-start-trading-on-solana-from-day-one) similarly describes canonical mint and market-formation infrastructure, not a universal equity issuer.

## Capability taxonomy for the adapter registry

The registry must be keyed by mint, with issuer-family defaults used only as hints:

| Capability | Required observation | Effect on DividendX |
|---|---|---|
| Instrument rights | direct registered share, collateralized tracker, SPV exposure, note, fund, or broker entitlement | Determines whether “dividend” exists and who owes it |
| Lifecycle | live, zero-supply, announced/test, historical/unwind | Only live assets enter custody |
| Token program | legacy SPL Token or Token-2022 | Selects account decoder and transfer CPI |
| Balance transformation | none, `ScaledUiAmount`, rebase, NAV/accrual | Defines shares, UI units, and claim checkpoints |
| Transfer fee | current/next epoch bps, max fee, withheld authority | Requires net-receipt accounting; may make deposit/withdrawal lossy |
| Transfer restriction | default frozen, transfer hook, SBT/allowlist, memo or extra accounts | Requires eligibility and correct CPI account resolution |
| Issuer powers | mint, freeze, permanent delegate, pause, metadata/multiplier update | Determines seizure/freeze/pause and event risks |
| Corporate-action channel | public event API, authenticated issuer feed, verified filings, or none | Determines whether events can be classified safely |
| Dividend settlement | cash/stablecoin, reinvestment, multiplier/rebase, NAV accrual, contingent payout, none | Selects distribution algorithm; these are not interchangeable |
| Eligibility/custody | arbitrary wallet, KYC wallet, allowlisted protocol/PDA, broker-only | Determines whether a DividendX vault can lawfully and technically receive tokens |

A non-null `ScaledUiAmount` extension is not enough to infer dividends. A multiplier change can represent a dividend reinvestment, stock split, migration, or correction. Conversely, direct shares may pay cash while the token multiplier stays at one. Event classification needs issuer data, not balance deltas alone.

## Credible two-day acceptance target

Use this wording while implementation remains incomplete:

> DividendX is building support for an exact, verified registry of live Solana tokenized-stock mints, starting with the validated xStocks, Ondo, and Backpack set. Permissioned direct shares, fee-on-transfer tokens, private-company exposure notes, funds, test deployments, and wound-down issuers remain outside the initial acceptance target.

After the named adapters and end-to-end deposit/claim flows pass, “building support” may be changed to “supports,” and the second sentence may say those excluded classes are detected and rejected.

Do not say “all Solana tokenized stocks,” “any SPL stock,” or “automatic support for every issuer.”

Minimum implementation gates:

1. Allow only exact mint addresses from issuer registries or directly confirmed issuer metadata.
2. Re-read mint extensions at deposit and claim time; reject unknown extensions and configuration changes.
3. Reject `DefaultAccountState=Frozen`, active transfer hooks, and positive transfer fees unless a tested provider adapter explicitly enables them.
4. Reject zero-supply, test, inactive/unwind, and other-chain records.
5. Store raw token amounts and the applicable multiplier/checkpoint; never use UI balances as the sole ledger.
6. Require a trusted issuer/provider corporate-action source, keyed by mint and event id, that distinguishes dividends from splits, reversals, and migrations. The source can be public if its provenance and authenticity are verifiable.

## Provider questions before expanding support

For Superstate and Securitize:

- Can a program-owned PDA and every derived token account be onboarded and thawed? Who is the legally registered holder in a pooled vault?
- Can transfers into and out of a program be pre-approved, and are CPI-based transfers supported by the approved protocol list?
- How are cash and stock dividends delivered to tokenized holders? Are record-date snapshots based on the transfer-agent registry, token accounts, or both?
- Is `ScaledUiAmount` reserved for splits/rebases, or can it represent dividend reinvestment?
- Is there an authenticated corporate-action webhook/API with event ids, corrections, tax withholding, and settlement status?
- How are sanctions, lost-wallet recovery, freezes, permanent-delegate movements, and holder-level tax reporting handled for a pooled protocol position?

For OTCM and PreStocks:

- Which offering document and backing share class applies to each mint?
- What is the exact current/next-epoch transfer fee, and who may withdraw withheld fees?
- Which mints actually enable a hook, which extra accounts must transfers provide, and can a program vault pass KYC?
- Does any product create a holder-level cash entitlement, or only NAV/economic exposure?

For Republic:

- Is any Mirror Token transferable to a third-party program-owned account after its lockup?
- Is the open-source security-token standard deployed for the live rSPAX issuance, and what are the official program and mint addresses?
- Is there a machine-readable payout/maturity/qualified-event feed? This would be a note-redemption adapter, not a dividend adapter.

## Evidence and search limits

The normalized RPC snapshot is [`solana-landscape-rpc-2026-09-16.json`](../evidence/solana-landscape-rpc-2026-09-16.json). It records finalized public `getAccountInfo(jsonParsed)` observations and their slots. No transactions, signatures, account creation, or provider onboarding were performed.

Coverage included official issuer/platform sites and documentation, SEC/issuer filings, public registries/APIs, public GitHub/API documentation, and representative Solana mainnet RPC reads. Searches explicitly covered Superstate, Securitize, Remora, PreStocks, Republic, Sunrise, OTCM, Alphaledger/SILO, WisdomTree, Dinari, bStocks, Reality, Figure, and the venue/issuer distinction. RWA.xyz and Solana ecosystem pages were used as discovery aids, not as proof that every catalog row is a compatible Solana stock.

Absence findings are bounded: “no Solana deployment/mint/API found” means none appeared in the searched official materials and public registries as of 2026-09-16. It does not prove that a private, newly deployed, delisted, or poorly indexed product cannot exist. Candidate mints without an official address registry remain excluded from production until the provider confirms them.
