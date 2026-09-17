# DividendX annual program

This Anchor program implements one Token-2022 collateral mint and one calendar year per series. Series creation and deposits are permitted only before January 1 00:00 UTC for the series year. Deposits also require no unresolved or qualified in-year journal record; resolved cancelled, confirmed-zero, and out-of-year history remains auditable without permanently closing pre-year funding.

Claim mints are ordinary SPL Token mints. Custody is the canonical Token-2022 associated token account owned by the Series PDA. Matching PT and DR recombine before finalization. Staged finalization freezes the exact revision set and rational product, revokes both claim mint authorities, and enables independent cumulative PT or DR redemption.

The committed IDL is generated from the program rather than maintained by hand:

```sh
npm run build:idl
```

Build the SBF artifact with the repository toolchain. On a machine where the platform Rust toolchain is already selected, the ordinary command is:

```sh
npm run build:program
```
