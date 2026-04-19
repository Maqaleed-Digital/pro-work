FROM postgres:16-alpine
WORKDIR /migrations
COPY app/storage/migrations/ ./
COPY infrastructure/migrations/run_migrations.sh ./
COPY infrastructure/migrations/run_migration_14_only.sh ./
COPY infrastructure/migrations/run_migration_16_17.sh ./
COPY infrastructure/migrations/run_fix_tenants_grant.sh ./
COPY infrastructure/migrations/run_fix_rls_login.sh ./
COPY infrastructure/migrations/run_migration_requisitions.sh ./
COPY infrastructure/migrations/run_migration_candidates.sh ./
RUN chmod +x run_migrations.sh
RUN chmod +x run_migration_14_only.sh
RUN chmod +x run_migration_16_17.sh
RUN chmod +x run_fix_tenants_grant.sh
RUN chmod +x run_fix_rls_login.sh
RUN chmod +x run_migration_requisitions.sh
RUN chmod +x run_migration_candidates.sh
ENTRYPOINT ["./run_migration_candidates.sh"]
