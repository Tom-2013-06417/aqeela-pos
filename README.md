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

- `supabase/migrations/` (all files, oldest first)

4. **Auth → Users** → add a test cashier, copy the UUID
5. Edit `supabase/scripts/link_test_user.sql` with that UUID, then run it in SQL Editor

For the Dilettante bazaar (two booths, Paymongo QR only), create 3 Auth users then edit and run `supabase/scripts/setup_dilettante_bazaar.sql`.

### Admin user

1. **Auth → Users** → add an admin user (email/password), copy the UUID
2. Edit `supabase/scripts/link_admin_user.sql` with that UUID, then run it in SQL Editor
3. Apply the admin staff policies if not already pushed:

```bash
supabase db push
```

(or run `supabase/migrations/20250721000001_admin_staff_policies.sql` in the SQL Editor)

4. Sign in with the admin account → **Admin** dashboard (inventory + users). Use **Open POS** for the cashier screen.

**Admin can:** edit/add catalog products and per-location stock, toggle payment methods per location, list store staff, link an existing Auth user by UUID, change roles, remove staff links.

**Admin cannot yet:** create Auth users from the app (create them in Supabase Auth first), manage staff while offline.

After the catalog/inventory migration, clear IndexedDB (`pos.db`) and sign in again so PowerSync picks up the new tables.

To promote an existing cashier to admin, re-run `link_admin_user.sql` with their UUID (it upserts the role).

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

### Common deploy pitfall (monorepo root)

If Railway logs show `Package-lock.json detected, assuming npm` and `No start command detected`,
it is deploying the repo root instead of `services/powersync`.

Use:

```bash
cd services/powersync
railway up --service powersync
```

And in the Railway UI for the `powersync` service confirm:
- **Root Directory** = `services/powersync`
- **Builder** = Dockerfile

This service includes `services/powersync/railway.toml` and `Dockerfile`; it should not be built as a Node app.

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

### Offline app shell (PWA)

The production build registers a service worker that precaches JS, CSS, WASM, and worker assets so the UI loads without network after the first visit.

```bash
npm run build
npm run preview -w @pos/www
```

Open `https://localhost:4173` (accept the self-signed cert), sign in once, then use DevTools → Network → Offline and refresh — the app should still load. Data continues to come from local PowerSync SQLite.

On a tablet, use **Add to Home Screen** for a standalone kiosk-style launch.

| Step | Expected |
| --- | --- |
| First visit online | Service worker installs; "App is ready for offline use" banner |
| Refresh while offline | App shell loads from cache |
| Close tab, reopen offline | Login session + POS work if previously signed in |
| New deploy | "A new version is available" banner; refresh when idle |

Service workers are disabled in `npm run dev` (HMR conflict). Test offline behavior with `build` + `preview`, or a deployed HTTPS host.

## 4. Verify

| Step | Expected |
| --- | --- |
| Login (cashier) | Products carried at that cashier's location |
| Login (admin) | Admin dashboard; catalog + stock per location + staff + payment methods |
| Sell item | Stock drops, sale in Recent sales |
| Admin edit stock | Product stock updates locally and in Supabase when online |
| Admin link staff | Paste Auth UUID → row appears in Users (online) |
| Supabase tables | `sales`, `sale_lines`, `products` updated |
| Offline sale | Works without network; uploads on reconnect |
| Offline refresh | App shell loads from service worker cache (production build) |

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
