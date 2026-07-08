# Keka Hours Tracker API

Backend for the Chrome extension. Deploy to **Vercel**; extension ZIP talks only to this API.

## Quick start (local)

```bash
cd keka-hours-tracker-api
cp .env.example .env
# Fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL, ENCRYPTION_KEY
npm install
npm run db:migrate
npm run dev
```

Open http://localhost:3000/api/health

## Deploy to Vercel

### 1. Supabase setup

1. Open [Supabase Dashboard](https://supabase.com) → your project
2. **Settings → API** → copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY` (never put in extension)
3. **Settings → Database** → **Connection string (URI)** → `SUPABASE_DB_URL`
4. Run migrations locally:
   ```bash
   npm run db:migrate
   ```
   Or paste new `-- @migration` blocks from `db/schema.sql` into SQL Editor (see `db/README.md`).

### 2. Generate encryption key

```bash
openssl rand -hex 32
```

Use output as `ENCRYPTION_KEY` in Vercel env vars.

### 3. Vercel deploy

1. Push this folder to GitHub (or monorepo with root `keka-hours-tracker-api`)
2. [vercel.com](https://vercel.com) → **Add New Project** → import repo
3. **Root Directory:** `keka-hours-tracker-api` (if monorepo)
4. **Environment Variables** (Production):

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) |
| `ENCRYPTION_KEY` | 64-char hex from openssl |
| `API_VERSION` | `1` |

5. Deploy → copy URL e.g. `https://keka-tracker-api.vercel.app`

### 4. Configure extension

Edit `keka-hours-tracker-test/config.js`:

```javascript
const API_BASE_URL = 'https://your-project.vercel.app';
```

Reload extension in `chrome://extensions`.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/v1/auth/register` | Register/update user from Keka JWT |
| POST | `/api/v1/credentials/keka` | Store Keka token |
| POST | `/api/v1/credentials/workspace` | Store encrypted workspace cookies |
| GET | `/api/v1/credentials/workspace` | Session status |
| POST | `/api/v1/credentials/teams` | Store Teams credentials |
| GET | `/api/v1/credentials/teams` | Teams config status |
| GET | `/api/v1/attendance/today` | Fetch Keka attendance |
| POST | `/api/v1/attendance/sync` | Sync attendance to DB |
| GET | `/api/v1/workspace/status` | Timesheet + timer + tasks |
| POST | `/api/v1/workspace/timer/start` | Start workspace timer |
| GET | `/api/v1/alerts/check` | Check pending alerts |
| POST | `/api/v1/alerts/check` | Test alert (`{ test: true }`) |
| POST | `/api/v1/eod/send` | Send Teams message |
| GET | `/api/v1/eod/suggestion` | Smart EOD suggestion |
| POST/DELETE | `/api/v1/admin/reset-db` | Remove all data from all tables |

All `/api/v1/*` routes require header:

```
Authorization: Bearer <kekaAuthToken>
```

## Database

- Schema: single file `db/schema.sql` (append-only migrations)
- Queries: `lib/db/queries.js` only
- Apply: `npm run db:migrate` or manual SQL Editor

### Reset / Clear all data

To remove all application data from all tables (for testing/resetting), run:

```bash
# Local development
curl -X POST http://localhost:3000/api/v1/admin/reset-db

# Production (if ADMIN_SECRET is configured in Vercel environment variables)
curl -X POST https://your-project.vercel.app/api/v1/admin/reset-db \
  -H "x-admin-secret: your_admin_secret"
```

## Project structure

```
app/api/          Route handlers (thin)
lib/auth.js       Keka JWT validation
lib/crypto.js     Encrypt workspace/teams secrets
lib/db/queries.js All Supabase queries
lib/services/     Keka, Workspace, Teams, Alerts logic
db/schema.sql     Incremental migrations
```

## Test flow

1. Load extension → visit Keka (token captured)
2. Extension syncs to API automatically
3. Open Workspace → cookies synced
4. Open Teams → skype token synced
5. Settings → Test Alert (uses API when configured)
6. Workspace timer alerts use `GET /api/v1/alerts/check`

## Security

- Service role key and encryption key only on Vercel
- Extension ZIP contains only `API_BASE_URL`
- Workspace/Teams tokens encrypted at rest in Postgres
