# Issuer readers

Server-only, one-shot observations for the 15 selected Solana assets. The readers validate current issuer registry identity and preserve source records without producing settlement instructions. Every report has `settlementReady: false`.

```sh
npm --prefix packages/issuer-readers run typecheck
npm --prefix packages/issuer-readers test
npm --prefix packages/issuer-readers run read -- --year 2026
npm --prefix packages/issuer-readers run read -- --year 2026 --issuer xstocks --symbol KOx
npm --prefix packages/issuer-readers run read -- --year 2026 --archive-dir /private/tmp/dividendx-issuer-archive
```

The default stdout document is a safe summary containing identities, counts, request provenance and blockers. `--archive-dir` creates a new mode-0600 normalized snapshot in a caller-owned mode-0700 directory outside the repository; existing snapshots are never overwritten and an existing directory's permissions are never changed. Ondo uses the reviewed `scripts/issuers/ondo-readonly.mjs` loader/GET transport. Its default external credential file is `/Users/node/.config/dividendx/issuer-api.env`, containing `ONDO_API_KEY`; `--ondo-env-file` selects another external file. Missing credentials report Ondo unavailable. Raw authenticated response bodies and credentials are never printed or archived.

The requested year labels the report only. Records are not filtered by activation or payment year because these sources do not establish official civil ex-dates and complete annual coverage.

Public reads use a 2 MiB response cap by default. The single Backpack assets registry uses an isolated 8 MiB cap because that documented endpoint returns the exchange's full asset catalog. Ondo retains the reviewed checker's 10 MiB cap.

## Unsigned qualification review

The offline review command consumes an existing detailed reader snapshot and, optionally, the public candidate-research artifact. It performs no requests, loads no API key, opens no wallet and emits no transaction or instruction:

```sh
npm --prefix packages/issuer-readers run review -- \
  --year 2026 \
  --snapshot /private/report.json \
  --supplement /absolute/path/to/dividendx-stocklana/planning/evidence/msftx-qualification-candidates-2026-09-17.json

npm --prefix packages/issuer-readers run review -- \
  --year 2026 \
  --snapshot /private/report.json \
  --archive-dir /private/dividendx-qualification
```

Expected evidence gaps are a successful review (exit 0). Malformed, mismatched, unsafe or unreadable input exits 1 with one stable error code. The compact stdout summary contains only frozen catalog identity, counts, blocker codes, observation timestamps and file/source digests. Source text, economics, URLs and detailed records remain excluded.

Detailed dossiers are written only when `--archive-dir` is supplied. The directory must be absolute, outside the repository, owned by the caller and mode 0700. Each dossier is a new mode-0600 exclusive file; existing evidence is never overwritten. Input files are limited to 8 MiB and must be regular non-symlinks. Known credential paths and hard-link aliases are refused.

Every v1 dossier has `state: "blocked"`, `settlementReady: false` and `signable: false`. Candidate company dates and binary64 encodings are review annotations, not issuer-confirmed joins or observed historical mint transitions. A matching current Token-2022 configuration corroborates current state only. Annual coverage, revision/finality policy, historical before/after bits and live custody admission remain explicit blockers before and after maturity. Backpack discovery and Ondo multiplier/pause records remain distinct from an issuer event ledger.
