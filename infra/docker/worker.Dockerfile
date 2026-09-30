FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
RUN mkdir -p /data/uploads && chown -R node:node /data/uploads
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile=false
COPY apps/worker apps/worker
COPY packages/core packages/core
COPY packages/database packages/database
RUN pnpm --filter @baixada/worker build
USER node
CMD ["node", "apps/worker/dist/index.js"]
