FROM postgres:16-alpine
WORKDIR /migrations
COPY app/storage/migrations/ ./
COPY infrastructure/migrations/run_migrations.sh ./
COPY infrastructure/migrations/run_migration_14_only.sh ./
COPY infrastructure/migrations/run_migration_16_17.sh ./
COPY infrastructure/migrations/run_fix_tenants_grant.sh ./
RUN chmod +x run_migrations.sh
RUN chmod +x run_migration_14_only.sh
RUN chmod +x run_migration_16_17.sh
RUN chmod +x run_fix_tenants_grant.sh
ENTRYPOINT ["./run_fix_tenants_grant.sh"]
