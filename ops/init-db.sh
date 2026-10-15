#!/bin/bash
set -e
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$APP_DB_PASSWORD" --set=ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE inventory LOGIN PASSWORD :'app_password';
ALTER DATABASE inventory OWNER TO inventory;
GRANT ALL ON SCHEMA public TO inventory;
SQL
