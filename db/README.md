# Database migrations

## Single file: `schema.sql`

All schema changes live in **one append-only file**. Each block starts with:

```sql
-- @migration 00X_description
```

## Rules

1. **Never edit** a migration block after it has been applied to production/demo DB.
2. **Only append** new `-- @migration` blocks at the bottom of `schema.sql`.
3. Re-running the apply script is safe — already-applied versions are skipped.

## Apply migrations

### Option A — Script (recommended)

```bash
cd keka-hours-tracker-api
cp .env.example .env
# Fill SUPABASE_DB_URL (Settings → Database → Connection string URI)
npm install
npm run db:migrate
```

### Option B — Supabase SQL Editor (manual)

1. Open Supabase Dashboard → SQL Editor
2. Check which versions exist: `SELECT * FROM schema_migrations;`
3. Copy **only the new** `@migration` block(s) from `schema.sql` and run them
4. Record the version:
   ```sql
   INSERT INTO schema_migrations (version) VALUES ('004_user_alert_state');
   ```

## Current migrations

| Version | Description |
|---------|-------------|
| `001_initial` | users, auth_tokens, attendance_days, attendance_swipes |
| `002_workspace_sessions` | encrypted workspace cookies |
| `003_teams_credentials` | encrypted Teams tokens |
| `004_user_alert_state` | per-user alert cooldown flags |

## All queries in code

Runtime DB access is centralized in [`lib/db/queries.js`](../lib/db/queries.js). Do not add ad-hoc SQL in route handlers.
