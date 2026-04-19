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
COPY infrastructure/migrations/run_fix_audit_log_review_grant.sh ./
RUN chmod +x run_migrations.sh
RUN chmod +x run_migration_14_only.sh
RUN chmod +x run_migration_16_17.sh
RUN chmod +x run_fix_tenants_grant.sh
RUN chmod +x run_fix_rls_login.sh
RUN chmod +x run_migration_requisitions.sh
RUN chmod +x run_migration_candidates.sh
RUN chmod +x run_fix_audit_log_review_grant.sh
COPY infrastructure/migrations/run_migration_offers.sh ./
COPY infrastructure/migrations/run_migration_contracts.sh ./
COPY infrastructure/migrations/run_migration_wps_readiness.sh ./
RUN chmod +x run_migration_offers.sh
RUN chmod +x run_migration_contracts.sh
COPY infrastructure/migrations/run_migration_probation.sh ./
COPY infrastructure/migrations/run_migration_esb.sh ./
RUN chmod +x run_migration_wps_readiness.sh
RUN chmod +x run_migration_probation.sh
COPY infrastructure/migrations/run_migration_offboarding.sh ./
RUN chmod +x run_migration_esb.sh
COPY infrastructure/migrations/run_migration_sdp.sh ./
RUN chmod +x run_migration_offboarding.sh
RUN chmod +x run_migration_sdp.sh
ENTRYPOINT ["./run_migration_sdp.sh"]
