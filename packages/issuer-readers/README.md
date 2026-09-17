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
