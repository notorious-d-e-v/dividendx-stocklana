#!/bin/sh
# Vercel build, or a disposable checkout. Do not run over a user's live preview.
set -eu
# issuer-readers uses the root lockfile and is compiled by the root build.
for site_package in transaction-sdk devnet-runtime hosted-broker hosted-devnet; do
  npm ci --prefix "packages/$site_package" --ignore-scripts
 done
npm --prefix packages/transaction-sdk run build
npm --prefix packages/devnet-runtime run build
npm --prefix packages/hosted-broker run build
npm --prefix packages/hosted-devnet run build
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
for (const folder of ['.', 'packages/transaction-sdk', 'packages/devnet-runtime', 'packages/hosted-devnet']) {
  const require = createRequire(resolve(folder, 'package.json'));
  const moduleRoot = resolve(require.resolve('bigint-buffer/package.json'), '..');
  assert.throws(() => require('bindings')({ bindings: 'bigint_buffer', module_root: moduleRoot }),
    'The reviewed server build requires the JavaScript bigint-buffer fallback.');
}
console.log('Server dependencies verified: native bigint-buffer is absent.');
JS
VITE_DIVIDENDX_HOSTED=1 \
VITE_DIVIDENDX_NETWORK=devnet \
VITE_DIVIDENDX_RUNTIME_URL=/api/devnet \
VITE_DIVIDENDX_DEVNET_RPC_URL=https://api.devnet.solana.com \
npm run build
