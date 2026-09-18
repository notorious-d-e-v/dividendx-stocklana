#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
DOCKER=${DOCKER:-/usr/local/bin/docker}
IMAGE=${DIVIDENDX_RUNTIME_IMAGE:-dividendx-runtime-probe:node24-linux-amd64}
CONTEXT=$("$SCRIPT_DIR/stage-linux-runtime.sh")

cleanup() {
  case "$CONTEXT" in
    "${TMPDIR:-/tmp}"/dividendx-linux-amd64.*) rm -rf -- "$CONTEXT" ;;
  esac
}
trap cleanup EXIT HUP INT TERM

"$DOCKER" build \
  --platform linux/amd64 \
  --label dev.dividendx.runtime-probe=true \
  --file "$CONTEXT/deploy/runtime/Dockerfile" \
  --tag "$IMAGE" \
  "$CONTEXT"

"$DOCKER" image inspect "$IMAGE" --format '{{json .RepoDigests}} {{.Id}} {{.Architecture}}/{{.Os}}'
