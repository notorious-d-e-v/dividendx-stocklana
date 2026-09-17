#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"
platform_version=v1.54
sbf_rust_bin=${DIVIDENDX_SBF_RUST_BIN:-${XDG_CACHE_HOME:-$HOME/.cache}/solana/$platform_version/platform-tools/rust/bin}

if [ -x "$sbf_rust_bin/cargo" ] && [ -x "$sbf_rust_bin/rustc" ]; then
  # Use the SBF compiler directly when rustup is absent (including this host).
  DIVIDENDX_HOST_RUST_BIN="$sbf_rust_bin" \
    exec scripts/protocol/toolchain.sh exec cargo-build-sbf \
      --manifest-path programs/dividendx/Cargo.toml \
      --tools-version "$platform_version" --no-rustup-override -- --locked
elif command -v rustup >/dev/null 2>&1; then
  exec scripts/protocol/toolchain.sh exec cargo-build-sbf \
    --manifest-path programs/dividendx/Cargo.toml \
    --tools-version "$platform_version" -- --locked
else
  printf '%s\n' \
    "SBF compiler not found at $sbf_rust_bin and rustup is unavailable." \
    'Install the pinned platform tools, then rerun:' \
    "scripts/protocol/toolchain.sh exec cargo-build-sbf --install-only --tools-version $platform_version --no-rustup-override" \
    'Set DIVIDENDX_SBF_RUST_BIN if the compiler is installed elsewhere.' >&2
  exit 1
fi
