# Hosted public-devnet services

This Node 24 package adds the bounded public manifest, synthetic test-asset faucet, and six-hour synthetic observation refresh described by `spec/hosted-devnet-services-v1.md`. It does not deploy or upgrade the program, use an admin/default-wallet/issuer signer, publish events, finalize a journal, or change chain time.

The Vercel routes are `GET /api/devnet/manifest`, `POST /api/devnet/faucet`, and authenticated `GET /api/cron/refresh-observations`. The manifest remains the frozen three-asset 2027 registry and reports `faucetEnabled:true` only when private Blob storage and both exact server authority keys are configured.

Required server values are `BLOB_STORE_ID`, `DIVIDENDX_SESSION_SECRET`, `DIVIDENDX_SITE_ORIGIN`, `DIVIDENDX_FAUCET_SECRET_KEY_BASE64`, `DIVIDENDX_TEST_ATTESTOR_SECRET_KEY_BASE64`, and `CRON_SECRET`. The Blob SDK obtains OIDC from Vercel's request context, with `VERCEL_OIDC_TOKEN` as its environment fallback; `BLOB_READ_WRITE_TOKEN` remains accepted for legacy Blob deployments. Secret-key values must be canonical base64 encodings of exactly 64 bytes and must derive the compiled public identities `C6U91C2a2CxKfiDNTaTHvbQe41CdRwtjsr47ip6zKyVb` and `Demegvz6VfKDWjiiPiyRdnqfK3Vy2EJATU4dcNKqpcwk`. Local signer files are never read.

The private CAS journal reserves 0.009 SOL before faucet RPC work. Limits are one wallet/asset/day, three grants per visitor/day, twelve per observed IP/day, thirty globally/day, 0.27 SOL globally/day, and 1 SOL for the service lifetime. Each grant creates only an optional top-up to 0.006 SOL, an idempotent canonical Token-2022 ATA, and exactly ten synthetic units. Observation transactions reserve 0.00001 SOL each against a separate 0.01 SOL lifetime budget and contain only `refreshObservation`, with 12-hour validity.

A 45-second fenced preparation lease protects each signer. Exact signed bytes, signature, blockhash, last-valid block height, recipient, asset, quota reservation, and fencing token are durable before submission. Retries can resend only those bytes. Missing status after blockhash expiry becomes terminal and never creates a replacement transaction. Confirmed funding also verifies the canonical token-account owner and mint. Identity checks use the accepted devnet genesis, ELF hash, program authority, deployment domain, synthetic policy digests, mint profiles, and exact faucet/attestor authorities before signing and again before sending.

Run `npm test` in this directory. Tests use fake chain and CAS adapters; they never send a public transaction.
