FROM postgres:16-alpine
WORKDIR /migrations
COPY app/storage/migrations/ ./
COPY infrastructure/migrations/run_migrations.sh ./
COPY infrastructure/migrations/run_migration_14_only.sh ./
RUN chmod +x run_migrations.sh
RUN chmod +x run_migration_14_only.sh
ENTRYPOINT ["./run_migrations.sh"]
