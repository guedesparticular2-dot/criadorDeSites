FROM node:22-alpine

RUN apk add --no-cache postgresql17-client \
  && corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json

RUN pnpm install --frozen-lockfile

COPY packages/database packages/database
COPY infra/database infra/database
COPY infra/docker/migrate-entrypoint.sh infra/docker/migrate-entrypoint.sh

ENTRYPOINT ["sh", "infra/docker/migrate-entrypoint.sh"]
