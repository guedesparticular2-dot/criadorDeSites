FROM postgres:17-alpine

COPY packages/database/migrations /migrations
COPY infra/database /infra/database
COPY infra/docker/migrate-entrypoint.sh /usr/local/bin/baixada-migrate

RUN chmod 0555 /usr/local/bin/baixada-migrate

ENTRYPOINT ["/usr/local/bin/baixada-migrate"]
