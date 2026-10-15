#!/bin/bash
set -e
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$APP_DB_PASSWORD" --set=ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE mizan LOGIN PASSWORD :'app_password';
ALTER DATABASE mizan OWNER TO mizan;
GRANT ALL ON SCHEMA public TO mizan;
SQL
