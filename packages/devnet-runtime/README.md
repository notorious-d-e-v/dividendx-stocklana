# DividendX public-devnet runtime foundation

This package prepares and serves the fixed real-calendar DividendX devnet registry. It creates three synthetic Token-2022 ScaledUiAmount assets for the existing 2027 annual program: `TestKOx` (8 decimals), `TestMU` (6), and `TestIBMon` (9). It does not deploy a program, change the existing Config, create a Raydium pool, publish issuer events, finalize a series, advance time, or claim live issuer support.

The only HTTP data route is `GET /manifest`. `POST /faucet` returns a disabled response and `/advance` does not exist. Holder funding and observation refreshes are explicit operator commands. A public faucet needs durable quotas and rate limiting in a later reviewed slice.

The service itself binds HTTP for use behind the hosted platform's TLS terminator. Do not expose its port directly to the internet.

## Offline verification

```sh
npm ci --prefix packages/devnet-runtime
npm --prefix packages/devnet-runtime run typecheck
npm --prefix packages/devnet-runtime test
```

## Read-only devnet preflight

```sh
npm --prefix packages/devnet-runtime run preflight -- \
  --rpc-url https://api.devnet.solana.com
```

Preflight positively verifies the devnet genesis, the accepted program ELF SHA-256, upgrade authority, existing Config admin, and deployment domain. An alternate RPC must be an explicit credential-free HTTPS origin and must return the same identities.

## Reviewed bootstrap command

This command mutates devnet. It is documented for the parent review and must not be run casually. The state directory must be a new direct child of the repository's ignored `.local-tools` directory and mode `0700`. The admin signer must be supplied by absolute path and match `DpbSCimwNNWMcREiJ7npkWuDVywWgHHekZGx6K9TeRsv`; the default Solana wallet is rejected.

```sh
npm --prefix packages/devnet-runtime run bootstrap -- \
  --rpc-url https://api.devnet.solana.com \
  --admin-signer /absolute/path/to/.local-tools/keys/dividendx-devnet-deployer-keypair.json \
  --state-dir /absolute/path/to/.local-tools/dividendx-public-devnet-v1
```

The runner generates separate faucet, observation-attestor, and mint account signers in the private directory. It writes each submitted signature before confirmation, reconciles deterministic accounts and signature status before retry, simulates with signature verification, and refuses any transaction whose projected admin balance would exceed the aggregate 0.15 SOL bootstrap ceiling. Existing expected accounts are verified; conflicting accounts fail. The existing Config is only read and verified.

## Read-only service and operator commands

```sh
npm --prefix packages/devnet-runtime run serve -- \
  --manifest /absolute/path/to/.local-tools/dividendx-public-devnet-v1/manifest.json \
  --host 127.0.0.1 --port 4182

npm --prefix packages/devnet-runtime run fund-holder -- \
  --manifest /absolute/path/to/.local-tools/dividendx-public-devnet-v1/manifest.json \
  --state-dir /absolute/path/to/.local-tools/dividendx-public-devnet-v1 \
  --owner HOLDER_PUBLIC_KEY --asset-id xstocks-test-kox \
  --runtime-id RUNTIME_UUID --genesis-hash EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG

npm --prefix packages/devnet-runtime run refresh-test-observations -- \
  --manifest /absolute/path/to/.local-tools/dividendx-public-devnet-v1/manifest.json \
  --state-dir /absolute/path/to/.local-tools/dividendx-public-devnet-v1 \
  --lifetime-seconds 43200

npm --prefix packages/devnet-runtime run smoke-holder -- \
  --manifest /absolute/path/to/.local-tools/dividendx-public-devnet-v1/manifest.json \
  --state-dir /absolute/path/to/.local-tools/dividendx-public-devnet-v1 \
  --asset-id xstocks-test-kox --receipt /absolute/public/path/devnet-holder-smoke.json
```

`fund-holder` uses only the test faucet signer and has a fixed per-invocation cap of 10 test units plus a top-up to 0.006 devnet SOL, enough for two fresh classic SPL claim-token accounts and transaction fees. It is an operator command, not a public quota system. Observation refresh uses only the test attestor, rechecks the full current mint profile against policy, caps lifetime at 86,400 seconds, and labels its digest as a synthetic test-profile observation. The smoke command uses a private disposable holder signer and publishes only public identities, signatures, and exact split/recombine conservation amounts.
