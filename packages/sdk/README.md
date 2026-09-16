# DividendX local SDK

Dependency-free TypeScript for the deterministic frontend rehearsal. Import the public surface from `src/index.ts` (or the private package export) and pass the normalized catalog and event JSON to `createDemoClient`.

All ledger amounts are `bigint`. The client is entirely in memory: it makes no wallet, chain, network, or signature calls. `getState()` and returned quotes/receipts are copies. `reset()` restores the seeded two-wallet state and invalidates earlier quote IDs.

Run checks with:

```sh
npm --prefix packages/sdk test
```

This SDK replays only pinned, positive, isolated `cash_dividend` fixtures. It intentionally rejects split classifications, zero-dividend settlements, missing or mismatched event identity, and unsupported live execution. Per-call fractional payouts can depend on burn order by less than one raw unit; the cumulative floor-difference rule guarantees exact total pool payout when the full supply burns.
