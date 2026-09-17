#!/bin/sh

set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
if [ -n "${DIVIDENDX_HOST_RUST_BIN:-}" ]; then
  host_rust_bin=$DIVIDENDX_HOST_RUST_BIN
elif command -v cargo >/dev/null 2>&1; then
  host_rust_bin=$(dirname -- "$(command -v cargo)")
else
  host_rust_bin="$HOME/.cargo/bin"
  for candidate in "${RUSTUP_HOME:-$HOME/.rustup}"/toolchains/stable-*/bin "${RUSTUP_HOME:-$HOME/.rustup}"/toolchains/1.94.0-*/bin; do
    if [ -x "$candidate/cargo" ] && [ -x "$candidate/rustc" ]; then
      host_rust_bin=$candidate
      break
    fi
  done
fi
if [ -n "${DIVIDENDX_SOLANA_BIN:-}" ]; then
  solana_bin=$DIVIDENDX_SOLANA_BIN
elif command -v solana >/dev/null 2>&1; then
  solana_bin=$(dirname -- "$(command -v solana)")
else
  solana_bin="$HOME/.local/share/solana/install/active_release/bin"
fi
local_anchor_bin="$repo_root/.local-tools/anchor/bin"
tool_path="$local_anchor_bin:$host_rust_bin:$solana_bin"

fail() {
  printf 'toolchain error: %s\n' "$*" >&2
  exit 1
}

require_file() {
  [ -x "$1" ] || fail "missing executable $1"
}

require_version() {
  command_name=$1
  expected=$2
  actual=$($command_name --version 2>&1) || fail "$command_name --version failed"
  case "$actual" in
    *"$expected"*) printf '%-22s %s\n' "$command_name" "$(printf '%s\n' "$actual" | head -n 1)" ;;
    *) fail "$command_name expected $expected; got: $(printf '%s\n' "$actual" | head -n 1)" ;;
  esac
}

check_toolchain() {
  PATH="$tool_path:$PATH"
  export PATH

  require_file "$host_rust_bin/cargo"
  require_file "$host_rust_bin/rustc"
  require_file "$solana_bin/solana"
  require_file "$solana_bin/solana-test-validator"
  require_file "$solana_bin/cargo-build-sbf"
  require_file "$solana_bin/spl-token"

  require_version rustc '1.94.0'
  require_version cargo '1.94.0'
  require_version solana '4.1.1'
  require_version solana-test-validator '4.1.1'
  require_version cargo-build-sbf '4.1.0'
  require_version spl-token '5.6.1'

  if command -v anchor >/dev/null 2>&1; then
    require_version anchor '1.2.0'
  else
    printf '%-22s %s\n' anchor 'not installed (optional; repository IDL builder is available)'
  fi
}

usage() {
  cat <<'EOF'
Usage:
  scripts/protocol/toolchain.sh check
  scripts/protocol/toolchain.sh path
  scripts/protocol/toolchain.sh exec COMMAND [ARG...]

`path` prints the repository-local Anchor, host Rust, and Agave bin prefixes.
Use: export PATH="$(scripts/protocol/toolchain.sh path):$PATH"
EOF
}

mode=${1:-check}
case "$mode" in
  check)
    check_toolchain
    ;;
  path)
    printf '%s\n' "$tool_path"
    ;;
  exec)
    shift
    [ "$#" -gt 0 ] || fail 'exec requires a command'
    PATH="$tool_path:$PATH"
    export PATH
    exec "$@"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
