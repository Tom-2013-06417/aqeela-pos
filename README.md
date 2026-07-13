# POS

Offline-first POS monorepo: Supabase + PowerSync on Railway + React.

## Layout

```
pos/
  app/www/               React POS UI (Vite)
  services/powersync/    PowerSync Docker deploy (Railway)
  supabase/              Migrations + scripts
```

Env files live next to the code that uses them:

| File | Package |
| --- | --- |
| `app/www/.env.local` | Vite (`VITE_*`) |
| `services/powersync/.env` | Railway / PowerSync (`PS_*`) |

## Setup

```bash
npm install
```

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com/dashboard)
2. **Auth → Email** → disable **Confirm email**
3. Link and push migrations:

```bash
supabase link
supabase db push
```

Or run migrations manually in SQL Editor (in order):

- `supabase/migrations/20250714000001_pos_schema.sql`
- `supabase/migrations/20250714000002_powersync_setup.sql` (set `powersync_role` password first)

4. **Auth → Users** → add a test cashier, copy the UUID
5. Edit `supabase/scripts/link_test_user.sql` with that UUID, then run it in SQL Editor

## 2. PowerSync on Railway

Supabase direct DB is IPv6-only. Host PowerSync on Railway (not local Docker on Mac).

Prerequisites: [Railway CLI](https://docs.railway.com/guides/cli) (`npm i -g @railway/cli`)

```bash
cd services/powersync
railway login
railway init

railway add --database postgres
railway add --service powersync
railway up --service powersync
```

Railway needs **two services**: Postgres (bucket storage) + powersync (Dockerfile). `railway add --database postgres` links your shell to Postgres — always deploy with `--service powersync`.

On the **powersync** service:

| Variable | Value |
| --- | --- |
| `PS_DATA_SOURCE_URI` | `postgresql://powersync_role:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=verify-full` |
| `PS_JWKS_URI` | `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `PS_STORAGE_SOURCE_URI` | `${{Postgres.DATABASE_URL}}` |
| `PS_PORT` | `8080` |

See `services/powersync/.env.example` for a local reference copy.

Networking:

- Enable **Outbound IPv6** (required for Supabase replication)
- Generate public domain on **powersync** (not Postgres), port **8080**

```bash
curl https://<powersync-domain>/probes/liveness
```

## 3. React app

```bash
cp app/www/.env.local.example app/www/.env.local
# edit VITE_* vars
npm run dev
```

Or from `app/www`: `npm run dev`

## 4. Verify

| Step | Expected |
| --- | --- |
| Login | 3 products for Rice Store A |
| Sell item | Stock drops, sale in Recent sales |
| Supabase tables | `sales`, `sale_lines`, `products` updated |
| Offline sale | Works without network; uploads on reconnect |

## Troubleshooting

**No second Railway service** — run `railway add --service powersync` then `railway up --service powersync`, not plain `railway up` while linked to Postgres.

**`ENETUNREACH` in PowerSync logs** — enable Outbound IPv6 on the powersync service and redeploy.

**Connected but local products = 0** — clear IndexedDB (`pos.db`), sign in again. Sync stream queries must not alias the `FROM` table (see `services/powersync/config/sync-config.yaml`).

**Remote store_staff = 0** — re-run `supabase/scripts/link_test_user.sql` with the Auth user UUID.

**Replication slots full** — in SQL Editor:

```sql
select slot_name, pg_drop_replication_slot(slot_name)
from pg_replication_slots
where active = false and slot_name like 'powersync%';
```

**Tablet stuck on "Loading…"** — PowerSync needs `navigator.locks`, which browsers only expose in a *secure context*. `http://localhost` counts, but `http://192.168.x.x` does not. Run `npm run dev`, then on the tablet open `https://<your-computer-ip>:5173` (note **https**), and accept the self-signed certificate warning. The dev server enables HTTPS automatically via `@vitejs/plugin-basic-ssl`.

**Remote debugging without tablet DevTools** — iPad: enable **Settings → Safari → Advanced → Web Inspector**, connect the tablet to a Mac, then use **Safari → Develop → [your iPad]**. Android Chrome: open `chrome://inspect` on your desktop while the tablet is on USB debugging.
