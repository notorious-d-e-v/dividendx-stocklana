# DivX local runtime

This package runs a disposable, offline Surfpool 1.5.0 network for the wallet application. It loads the repository's compiled DivX ELF, creates three local Token-2022 collateral profiles and their 2027 series with genuine transactions, then exposes discovery and narrow test controls on `127.0.0.1:4180`.

From the repository root:

```sh
npm ci
npm --prefix packages/transaction-sdk ci
npm run build:transactions
# If target/deploy/dividendx.so is absent:
npm run build:program
cd packages/local-runtime
npm ci
npm start
```

The package expects the root dependencies, built transaction SDK and compiled `target/deploy/dividendx.so` artifact to exist. The repository's documented protocol build produces the ELF with the pinned Solana toolchain. Startup takes roughly one minute on the supported macOS arm64 host. The server prints its URL only after it verifies the genesis identity, upgradeable program and ProgramData authority, Config deployment domain, mint/program owners, derived PDAs and vault relationships. Restarting creates a new `runtimeId`, deployment domain, keys, mints and ledger; all prior test state is lost.

Surfpool emits RPC/simulator events into a bounded native buffer. The daemon drains that buffer continuously; removing the drain eventually blocks state-reading RPC calls even though `getHealth` still responds. The isolated probe includes more than 250 account reads and an idle follow-up as a regression check.

Annual eligibility and every program gate use the Clock sysvar. Surfpool block-time metadata is test-engine metadata and must not be presented as an issuer or market timestamp.

The HTTP surface follows `spec/wallet-integration-v1.md`:

- `GET /manifest`
- `POST /faucet` with `{ owner, assetId, genesisHash, runtimeId }`
- `POST /advance` with `{ step, assetId, genesisHash, runtimeId }`

The server accepts browser origins only from local port 4174, limits JSON request bodies to 4096 bytes and serializes mutations. The faucet sends a real SOL transfer and a real Token-2022 ATA/mint transaction, once per wallet and asset. It never issues PT or DR. Annual controls move the Surfnet Clock forward, update the test mint, write four stable synthetic event records, and run the program's begin/accumulate/complete finalization instructions. Administrative, mint and attestor keys remain only in process memory.

`npm run probe` performs an isolated offline runtime check: loader/ProgramData deployment, canonical token executables, signed Config initialization, rejection of a transaction missing its required signature, and forward Clock travel with state retention. `npm test` checks pinned provenance against the compiled ELF and IDL.

The npm install occupies about 33 MB for Surfpool itself on macOS arm64 (1.7 MB JS package and 32 MB native package), plus shared JavaScript dependencies. No Surfpool CLI, global install, remote RPC or custom RPC shim is used.
