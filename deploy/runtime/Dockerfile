ARG NODE_IMAGE=node:24.8.0-bookworm-slim@sha256:cadbfafeb6baf87eaaffa40b3640209c4b7fd38cebde65059d15bc39cd636b85

FROM ${NODE_IMAGE} AS build
WORKDIR /opt/dividendx

COPY . .

RUN sha256sum --check ARTIFACTS.sha256 \
 && test "$(dpkg --print-architecture)" = amd64 \
 && test "$(node --version)" = v24.8.0 \
 && mkdir -p /tmp/input-locks \
 && cp --parents package-lock.json packages/transaction-sdk/package-lock.json packages/amm-integration/package-lock.json packages/guided-runtime/package-lock.json packages/local-runtime/package-lock.json /tmp/input-locks \
 && npm ci --omit=dev --ignore-scripts \
 && npm ci --prefix packages/transaction-sdk --ignore-scripts \
 && npm --prefix packages/transaction-sdk run build \
 && npm ci --prefix packages/amm-integration --ignore-scripts \
 && npm --prefix packages/amm-integration run build \
 && npm ci --prefix packages/guided-runtime --ignore-scripts \
 && npm --prefix packages/guided-runtime run build \
 && npm ci --prefix packages/local-runtime --omit=dev --ignore-scripts \
 && npm prune --prefix packages/transaction-sdk --omit=dev --ignore-scripts \
 && npm prune --prefix packages/amm-integration --omit=dev --ignore-scripts \
 && npm prune --prefix packages/guided-runtime --omit=dev --ignore-scripts \
 && cp -R /tmp/input-locks/. . \
 && sha256sum --check ARTIFACTS.sha256 \
 && npm cache clean --force \
 && test -f packages/local-runtime/node_modules/@solana/surfpool-linux-x64-gnu/package.json \
 && test -f packages/guided-runtime/node_modules/@solana/surfpool-linux-x64-gnu/package.json

FROM ${NODE_IMAGE} AS runtime
WORKDIR /opt/dividendx

ENV NODE_ENV=production

COPY --from=build --chown=node:node /opt/dividendx/package.json ./package.json
COPY --from=build --chown=node:node /opt/dividendx/package-lock.json ./package-lock.json
COPY --from=build --chown=node:node /opt/dividendx/node_modules ./node_modules
COPY --from=build --chown=node:node /opt/dividendx/ARTIFACTS.sha256 ./ARTIFACTS.sha256
COPY --from=build --chown=node:node /opt/dividendx/target ./target
COPY --from=build --chown=node:node /opt/dividendx/scripts ./scripts
COPY --from=build --chown=node:node /opt/dividendx/deploy ./deploy
COPY --from=build --chown=node:node /opt/dividendx/packages/transaction-sdk/package.json ./packages/transaction-sdk/package.json
COPY --from=build --chown=node:node /opt/dividendx/packages/transaction-sdk/package-lock.json ./packages/transaction-sdk/package-lock.json
COPY --from=build --chown=node:node /opt/dividendx/packages/transaction-sdk/dist ./packages/transaction-sdk/dist
COPY --from=build --chown=node:node /opt/dividendx/packages/transaction-sdk/idl ./packages/transaction-sdk/idl
COPY --from=build --chown=node:node /opt/dividendx/packages/transaction-sdk/node_modules ./packages/transaction-sdk/node_modules
COPY --from=build --chown=node:node /opt/dividendx/packages/amm-integration/package.json ./packages/amm-integration/package.json
COPY --from=build --chown=node:node /opt/dividendx/packages/amm-integration/package-lock.json ./packages/amm-integration/package-lock.json
COPY --from=build --chown=node:node /opt/dividendx/packages/amm-integration/dist ./packages/amm-integration/dist
COPY --from=build --chown=node:node /opt/dividendx/packages/amm-integration/fixtures ./packages/amm-integration/fixtures
COPY --from=build --chown=node:node /opt/dividendx/packages/amm-integration/node_modules ./packages/amm-integration/node_modules
COPY --from=build --chown=node:node /opt/dividendx/packages/guided-runtime/package.json ./packages/guided-runtime/package.json
COPY --from=build --chown=node:node /opt/dividendx/packages/guided-runtime/package-lock.json ./packages/guided-runtime/package-lock.json
COPY --from=build --chown=node:node /opt/dividendx/packages/guided-runtime/dist ./packages/guided-runtime/dist
COPY --from=build --chown=node:node /opt/dividendx/packages/guided-runtime/fixtures ./packages/guided-runtime/fixtures
COPY --from=build --chown=node:node /opt/dividendx/packages/guided-runtime/node_modules ./packages/guided-runtime/node_modules
COPY --from=build --chown=node:node /opt/dividendx/packages/hosted-gateway ./packages/hosted-gateway
COPY --from=build --chown=node:node /opt/dividendx/packages/local-runtime/package.json ./packages/local-runtime/package.json
COPY --from=build --chown=node:node /opt/dividendx/packages/local-runtime/package-lock.json ./packages/local-runtime/package-lock.json
COPY --from=build --chown=node:node /opt/dividendx/packages/local-runtime/src ./packages/local-runtime/src
COPY --from=build --chown=node:node /opt/dividendx/packages/local-runtime/node_modules ./packages/local-runtime/node_modules

RUN sha256sum --check ARTIFACTS.sha256 \
 && test "$(dpkg --print-architecture)" = amd64 \
 && test "$(getconf GNU_LIBC_VERSION | cut -d' ' -f1)" = glibc \
 && ! find /opt/dividendx -type f \( -name '*.env' -o -name '*keypair*.json' \) -print -quit | grep -q . \
 && ! find /opt/dividendx -type d \( -name .git -o -name .local-tools \) -print -quit | grep -q . \
 && mkdir -p /opt/dividendx/planning/evidence /opt/dividendx/.local-tools/guided-runtime \
 && chown -R node:node /opt/dividendx/planning /opt/dividendx/.local-tools \
 && chmod 700 /opt/dividendx/.local-tools/guided-runtime

LABEL org.opencontainers.image.title="DividendX isolated Surfpool runtime probe" \
      org.opencontainers.image.description="Node 24 linux/amd64 glibc runtime with hash-pinned DividendX and captured guided artifacts" \
      org.opencontainers.image.source="dividendx-stocklana"

USER node
CMD ["node", "deploy/runtime/probe.mjs", "native"]
