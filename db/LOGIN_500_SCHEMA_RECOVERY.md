# Recovery: login HTTP 500 after switching to Unison branch

## Diagnosis

An API traceback containing `psycopg2.errors.UndefinedColumn: column users.must_change_password does not exist` means the **persistent PostgreSQL schema has not received the existing session-security migration**. The UI rebrand does not require a new authentication endpoint or a database reset.

The required migration is `db/init/127_session_security_controls.sql`. This migration adds the required user column and creates `security_session_settings` and `auth_sessions`. PostgreSQL initialization scripts under `db/init` are only automatically executed by the Postgres Docker image when the data directory is **first initialized**. Updating code or rebuilding containers does not replay them on an established volume.

## Safe recovery procedure (from repository root)

1. Verify this is the intended Codespaces/dev database, and take a database backup before DDL if it contains valuable data.
2. Verify the database container is running:

   ```bash
   cd /workspaces/stock-control
   docker compose -f infra/docker-compose.yml ps
   ```

3. Apply the existing, idempotent migration **to the current database**:

   ```bash
   docker compose -f infra/docker-compose.yml exec -T db \
     sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     < db/init/127_session_security_controls.sql
   ```

   This does not drop or recreate the database or delete application data. The migration uses `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`. It intentionally sets `must_change_password = TRUE` for existing accounts *if the column did not exist*, in line with the security migration's original design. Users may have to change their passwords on first login.

4. Check the schema objects were created:

   ```bash
   docker compose -f infra/docker-compose.yml exec -T db \
     sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT to_regclass('\''public.auth_sessions'\'') AS auth_sessions, to_regclass('\''public.security_session_settings'\'') AS security_session_settings;"'
   ```

5. Try the login again. If there is another HTTP 500, check `docker compose -f infra/docker-compose.yml logs --tail=100 api`. The login endpoint also requires `security_audit_events`, defined in `db/init/095_security_audit_events.sql`. Never blanket-replay unknown migrations or reset volumes merely to resolve a missing column.

## Important safeguards

- **Never run `docker compose down -v`** to fix this error; `-v` deletes the persistent database volume.
- Do not change the ORM model to omit `must_change_password`: this would break security controls.
- Do not run `python -m app.bootstrap_admin` as a schema fix: it resets the administrator password.
- The GitHub Codespaces `manifest.webmanifest` sign-in redirect/CORS warning concerns the PWA manifest and is separate from the login 500.
- If a default or shared admin password was exposed in a screenshot or log, change it and replace it with a unique password.

This is a **development environment migration runbook**, not evidence of production validation. Regulated deployments should apply schema changes under backup, change control and verification.
