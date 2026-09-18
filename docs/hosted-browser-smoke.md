# Hosted browser smoke driver

This is an opt-in production acceptance check. It uses real hosted pages, broker sessions, RPC calls, temporary in-memory browser wallets, and test assets. It does not mock network traffic or prove custody.

Run one flow against an explicit HTTPS deployment:

```sh
node scripts/hosting/hosted-browser-smoke.mjs \
  --execute true \
  --url https://example.test \
  --output /absolute/path/hosted-smoke.json \
  --flow sandbox
```

`--flow` accepts `sandbox`, `guided`, `devnet`, `isolation`, or `all`. The output path must be absolute and new. The driver also writes desktop and mobile PNGs beside the JSON file and refuses to replace planned files.

The `all` run starts at most four active VMs: one wallet sandbox, one guided sandbox, and two isolation visitors. The isolation flow resets one visitor after the mandatory 30-second cooldown. Other sessions are left to their 15-minute hard expiry. Separate runs use fresh cookies and can consume the broker's per-IP daily quota.

The driver never retries a transaction, session start, or reset after an unknown result. It uses read-only polling to reconcile progress. Once a devnet grant confirms, it deliberately repeats the identical faucet request and verifies the same signature and unchanged ten-token balance. HTTP waits are capped at 90 seconds and displayed transaction waits at 60 seconds. Evidence includes public session responses, manifests, receipts, RPC confirmation status, browser errors, layout checks, and 1440/390 screenshots. It does not save cookies or private keys.

For a local hosted QA build, `--url` may be an explicit `http://localhost:<port>` or `http://127.0.0.1:<port>` origin. This exception does not enable mocked broker, manifest, or RPC responses.
