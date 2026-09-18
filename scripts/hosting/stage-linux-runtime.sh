#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
EXPECTED_ELF=a05714204ee277ac58cdddb0b2aa9a44371c1aba6d00bab31f33175954bd0070
EXPECTED_IDL=d4953c8a234e1b235e07db92f464dfb0033b62ff41bf378657fe1357a3211da4

if [ "$#" -gt 1 ]; then
  echo "usage: $0 [empty-context-directory]" >&2
  exit 2
fi

if [ "$#" -eq 1 ]; then
  CONTEXT=$1
  mkdir -p "$CONTEXT"
  if [ -n "$(find "$CONTEXT" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    echo "context directory must be empty: $CONTEXT" >&2
    exit 2
  fi
else
  CONTEXT=$(mktemp -d "${TMPDIR:-/tmp}/dividendx-linux-amd64.XXXXXX")
fi
CONTEXT=$(CDPATH= cd -- "$CONTEXT" && pwd)

actual_elf=$(sha256sum "$REPOSITORY_ROOT/target/deploy/dividendx.so" | awk '{print $1}')
actual_idl=$(sha256sum "$REPOSITORY_ROOT/packages/transaction-sdk/idl/dividendx.json" | awk '{print $1}')
[ "$actual_elf" = "$EXPECTED_ELF" ] || { echo "accepted DividendX ELF hash mismatch: $actual_elf" >&2; exit 1; }
[ "$actual_idl" = "$EXPECTED_IDL" ] || { echo "accepted transaction IDL hash mismatch: $actual_idl" >&2; exit 1; }

mkdir -p \
  "$CONTEXT/deploy/runtime" \
  "$CONTEXT/scripts/protocol" \
  "$CONTEXT/target/deploy" \
  "$CONTEXT/packages/transaction-sdk" \
  "$CONTEXT/packages/amm-integration" \
  "$CONTEXT/packages/guided-runtime" \
  "$CONTEXT/packages/local-runtime"

cp "$REPOSITORY_ROOT/package.json" "$REPOSITORY_ROOT/package-lock.json" "$CONTEXT/"
cp "$REPOSITORY_ROOT/deploy/runtime/Dockerfile" "$REPOSITORY_ROOT/deploy/runtime/probe.mjs" "$CONTEXT/deploy/runtime/"
cp "$REPOSITORY_ROOT/scripts/protocol/wallet-runtime-smoke.mjs" "$CONTEXT/scripts/protocol/"
cp "$REPOSITORY_ROOT/target/deploy/dividendx.so" "$CONTEXT/target/deploy/"

for package in transaction-sdk amm-integration guided-runtime; do
  cp "$REPOSITORY_ROOT/packages/$package/package.json" \
     "$REPOSITORY_ROOT/packages/$package/package-lock.json" \
     "$REPOSITORY_ROOT/packages/$package/tsconfig.json" \
     "$CONTEXT/packages/$package/"
  cp -R "$REPOSITORY_ROOT/packages/$package/src" "$CONTEXT/packages/$package/src"
done
cp -R "$REPOSITORY_ROOT/packages/transaction-sdk/idl" "$CONTEXT/packages/transaction-sdk/idl"
cp -R "$REPOSITORY_ROOT/packages/amm-integration/fixtures" "$CONTEXT/packages/amm-integration/fixtures"
cp -R "$REPOSITORY_ROOT/packages/guided-runtime/fixtures" "$CONTEXT/packages/guided-runtime/fixtures"
cp -R "$REPOSITORY_ROOT/packages/guided-runtime/scripts" "$CONTEXT/packages/guided-runtime/scripts"
cp "$REPOSITORY_ROOT/packages/local-runtime/package.json" \
   "$REPOSITORY_ROOT/packages/local-runtime/package-lock.json" \
   "$CONTEXT/packages/local-runtime/"
cp -R "$REPOSITORY_ROOT/packages/local-runtime/src" "$CONTEXT/packages/local-runtime/src"

cat > "$CONTEXT/.dockerignore" <<'EOF'
.git
.git/**
.local-tools
.local-tools/**
**/node_modules
**/node_modules/**
.env
.env.*
**/.env
**/.env.*
**/*keypair*.json
**/*secret*
**/*credential*
EOF

(
  cd "$CONTEXT"
  sha256sum \
    target/deploy/dividendx.so \
    packages/transaction-sdk/idl/dividendx.json \
    packages/amm-integration/fixtures/raydium-devnet-2026-09-17/raydium-cpmm.so \
    packages/amm-integration/fixtures/raydium-devnet-2026-09-17/capture.json \
    packages/guided-runtime/fixtures/circle-devnet-usdc-2026-09-17.json \
    package-lock.json \
    packages/transaction-sdk/package-lock.json \
    packages/amm-integration/package-lock.json \
    packages/guided-runtime/package-lock.json \
    packages/local-runtime/package-lock.json > ARTIFACTS.sha256
)

if find "$CONTEXT" -type d \( -name .git -o -name .local-tools -o -name node_modules \) -print -quit | grep -q .; then
  echo "forbidden directory entered build context" >&2
  exit 1
fi
if find "$CONTEXT" -type f \( -name '*.env' -o -name '.env*' -o -name '*keypair*.json' \) -print -quit | grep -q .; then
  echo "forbidden private input entered build context" >&2
  exit 1
fi

printf '%s\n' "$CONTEXT"
