#!/bin/sh
# Run only in a clean Linux build VM against the allowlisted staged context.
set -eu
[ "$(uname -s)" = Linux ]
[ "$(uname -m)" = x86_64 ]
node --input-type=module -e 'if (process.versions.node.split(".")[0] !== "24" || !process.report.getReport().header.glibcVersionRuntime) throw new Error("Node 24 with glibc required")'
sha256sum --check ARTIFACTS.sha256
npm ci --omit=dev --ignore-scripts
for runtime_package in transaction-sdk amm-integration guided-runtime; do
  npm ci --prefix "packages/$runtime_package" --ignore-scripts
  npm --prefix "packages/$runtime_package" run build
 done
npm ci --prefix packages/local-runtime --omit=dev --ignore-scripts
sha256sum --check ARTIFACTS.sha256
# npm build scripts above must not have started a runtime or created signer state.
[ ! -e .local-tools ]
mkdir -m 700 .local-tools
mkdir -m 700 .local-tools/guided-runtime
mkdir -p packages/amm-integration/evidence packages/guided-runtime/evidence
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
for (const folder of ['.', 'packages/local-runtime', 'packages/guided-runtime']) {
  const require = createRequire(resolve(folder, 'package.json'));
  assert.throws(() => require('bindings')({bindings:'bigint_buffer',module_root:resolve(require.resolve('bigint-buffer/package.json'),'..')}), 'native bigint-buffer must remain absent');
}
const require = createRequire(resolve('packages/local-runtime/package.json'));
assert.equal(typeof require('@solana/surfpool').Surfnet, 'function');
console.log('Native Surfpool loads; bigint-buffer uses its JavaScript fallback; no runtime started.');
JS
printf '%s\n' 'Code-only runtime snapshot is ready.'
