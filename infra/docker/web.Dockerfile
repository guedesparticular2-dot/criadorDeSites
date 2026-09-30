FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile=false
COPY apps/web apps/web
COPY packages/core packages/core
COPY packages/contracts packages/contracts
COPY packages/database packages/database
COPY docs/design-tokens docs/design-tokens
RUN pnpm --filter @baixada/web build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
RUN mkdir -p /app/apps/web/.next/cache /data/uploads \
  && chown -R node:node /app/apps/web/.next /data/uploads
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
