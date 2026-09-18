# Hosted sandbox broker

The broker implements `spec/hosted-sessions-v1.md`. It reserves capacity in a private Blob CAS ledger before any provider side effect, creates one nonpersistent Vercel Sandbox per visitor and flow, and exposes only fixed session-bound routes through `api/sandbox.ts` and the explicit Vercel rewrite. The unnamed `/(.*)` rewrite capture preserves the original request path without injecting routing query parameters. Named unused captures are unsuitable because Vercel appends them to the query; handlers deliberately reject genuine query strings.

Required production environment:

- `DIVIDENDX_SESSION_SECRET`: at least 32 random bytes, available only to Functions.
- `DIVIDENDX_SANDBOX_SNAPSHOT_ID`: reviewed code-only snapshot ID.
- `DIVIDENDX_SITE_ORIGIN`: comma-separated exact HTTPS origins.
- `BLOB_STORE_ID` and Vercel's rotating `VERCEL_OIDC_TOKEN` from the private Blob project connection.

The fixed snapshot root is `/vercel/sandbox/dividendx`. The sole launch command is `node packages/hosted-gateway/src/main.mjs`; port 3000 is published. The Sandbox receives only its kind, derived gateway bearer, and immutable expiry.

Build this package before Vercel bundles the root API entry:

```sh
npm ci --prefix packages/hosted-broker --ignore-scripts
npm --prefix packages/hosted-broker run build
```

`@dividendx/hosted-broker/json-store` and `@dividendx/hosted-broker/security` are narrow exports for other server-only Functions that need the same Blob CAS or visitor identity primitives without importing the Sandbox adapter.
