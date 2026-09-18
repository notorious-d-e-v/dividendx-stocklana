#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DOCKER=${DOCKER:-/usr/local/bin/docker}
IMAGE=${DIVIDENDX_RUNTIME_IMAGE:-dividendx-runtime-probe:node24-linux-amd64}
RUN_ID="dividendx-probe-$(date -u +%Y%m%dT%H%M%SZ)-$$"
CURRENT_CONTAINER=

cleanup() {
  if [ -n "$CURRENT_CONTAINER" ]; then
    "$DOCKER" rm -f "$CURRENT_CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT HUP INT TERM

if [ "${DIVIDENDX_SKIP_BUILD:-0}" != 1 ]; then
  "$SCRIPT_DIR/build-linux-runtime.sh"
fi

for mode in native wallet guided; do
  CURRENT_CONTAINER="$RUN_ID-$mode"
  "$DOCKER" run --rm \
    --platform linux/amd64 \
    --name "$CURRENT_CONTAINER" \
    --label dev.dividendx.runtime-probe=true \
    --network none \
    --memory 4g \
    --cpus 4 \
    "$IMAGE" node deploy/runtime/probe.mjs "$mode"
  CURRENT_CONTAINER=
done
