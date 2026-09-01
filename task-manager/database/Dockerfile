FROM postgres:16-alpine

# Files in /docker-entrypoint-initdb.d/ are automatically run once,
# the first time the container starts with an empty data directory.
COPY init.sql /docker-entrypoint-initdb.d/

# Default port for postgres
EXPOSE 5432
