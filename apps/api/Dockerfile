# syntax=docker/dockerfile:1
FROM node:24.22.2-bookworm-slim AS build
WORKDIR /build
# Optional CA is used only by the managed Cloud build; it never enters a layer.
RUN --mount=type=secret,id=proxy_ca \
    if [ -r /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi \
    && npm install --global pnpm@11.25.0 --strict-ssl=true
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN --mount=type=secret,id=proxy_ca \
    if [ -r /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi \
    && pnpm install --frozen-lockfile --filter ai-companion --filter @companion/api...
COPY . .
RUN pnpm build:api
RUN --mount=type=secret,id=proxy_ca \
    if [ -r /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi \
    && pnpm --filter @companion/api deploy --prod --legacy /bundle

FROM node:24.22.2-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NODE_USE_ENV_PROXY=1
WORKDIR /app
COPY --from=build --chown=node:node /bundle/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||3000)+"/v1/health/live",{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'
CMD ["node", "dist/apps/api/src/main.js"]
