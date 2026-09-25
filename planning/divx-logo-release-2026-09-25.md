# DivX logo integration — 25 September 2026

The user approved adding the generated logo set to the repository and website, specifying the second design with full, solid shapes and no chipped rectangle or detached shard. The five original PNGs are preserved byte-for-byte in `apps/web/public/brand/divx/v1/`; [usage and provenance](../design/brand/divx-v1/README.md) include generation prompts and checksums.

Website headers use the horizontal primary lockup, while decorative marks and favicons use the standalone icon. The repository README supports light and dark viewing. Existing product screenshots used for social previews are retained. Program, runtime, backend, registry, session quotas, and deployment configuration are outside this visual change.

The GitHub repository and Vercel project were renamed separately to `notorious-d-e-v/divx` and `payai/divx`. The canonical website remains `https://divx.payai.network`.

## Release checks

- All 95 root tests passed.
- All five PNG checksums match the approved local logo set.
- The Vercel upload dry run excludes environment files, keypairs, dependencies, existing build outputs, private runtime state, and historical evidence.
- Typecheck and the isolated hosted production build passed.
- Browser suite: 99 passed initially; one Node-side fixture check hit duplicate local `PublicKey` classes after nested dependency installation. Removing the redundant nested SDK dependencies in this disposable checkout made that check pass on its targeted rerun (100 cases covered). No application change was needed.
- Desktop (1440px) and mobile (390px) logo layouts were visually reviewed; all six entry points declare the new favicon. The built sandbox entry displays the approved icon without overflow.
- Original tracked QA screenshots were restored after the test suite regenerated them.
- Vercel preview build passed for reviewed source `9c4a8cc`. Production delivery and verification are recorded in [PR #15](https://github.com/notorious-d-e-v/divx/pull/15); merging to `main` publishes through the existing Git integration.

Known-good production before this update: `dpl_2tz3A2BLNXNRXrbr8zkDy9qGxyZ2`, `https://dividendx-stocklana-7po7nj3t7-payai.vercel.app`. The accepted v4 runtime snapshot is unchanged.
