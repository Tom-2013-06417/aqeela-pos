# AGENTS.md

## Cursor Cloud specific instructions

Offline-first POS monorepo. Three moving parts must run together for an end-to-end dev
loop:

- `app/www` — React + Vite PWA (the product UI). Standard scripts in `app/www/package.json`
  (`npm run dev`, `npm run build`, `npm run preview`). There is **no lint or test script**;
  `npm run build` (`tsc -b && vite build`) is the type-check/build gate.
- **Local Supabase** — Postgres + Auth (Docker). Config in `supabase/config.toml`; migrations
  auto-apply on `supabase start`. `enable_confirmations` is already `false`, so admin-created
  users can sign in immediately.
- **Local PowerSync** — sync service (Docker) that replicates Supabase Postgres and serves the
  app's local SQLite. In production this runs on Railway (see `README.md`); locally it runs as a
  container against local Supabase.

`README.md` documents the production (cloud Supabase + Railway PowerSync) setup. The notes below
are only what differs for a fully-local Cursor Cloud dev loop.

### Running the stack (services are NOT started by the update script)

Dependencies (Docker, Supabase CLI, `npm install`) are baked into the VM / handled by the update
script. Services must be started manually each session:

1. Ensure the Docker daemon is running and usable. Docker 29 needs the `fuse-overlayfs` storage
   driver **and** `containerd-snapshotter` disabled (already set in `/etc/docker/daemon.json`).
   If `docker ps` fails: start `sudo dockerd` (background) and run `sudo chmod 666 /var/run/docker.sock`.
2. `supabase start` (from repo root). Get keys/URLs with `supabase status`. Local user access
   tokens are **ES256** and the local JWKS endpoint serves the matching key, so PowerSync accepts
   them out of the box.
3. Start PowerSync locally (production `services/powersync/config/service.yaml` pins
   `sslmode: verify-full` for Railway; local Postgres has no TLS, so a dev override config lives at
   `/home/ubuntu/powersync-local/config/` with `sslmode: disable`). It runs on the Supabase Docker
   network and uses a dedicated `powersync_storage` database:

   ```bash
   docker exec supabase_db_pos psql -U postgres -c "create database powersync_storage;" 2>/dev/null || true
   docker run -d --name powersync-local --network supabase_network_pos -p 8080:8080 \
     -e PS_DATA_SOURCE_URI='postgresql://powersync_role:CHANGE_ME@supabase_db_pos:5432/postgres' \
     -e PS_STORAGE_SOURCE_URI='postgresql://postgres:postgres@supabase_db_pos:5432/powersync_storage' \
     -e PS_JWKS_URI='http://supabase_kong_pos:8000/auth/v1/.well-known/jwks.json' \
     -e PS_PORT=8080 -e POWERSYNC_CONFIG_PATH=/config/service.yaml \
     -v /home/ubuntu/powersync-local/config:/config:ro \
     journeyapps/powersync-service:latest start -r unified -c /config/service.yaml
   ```

   `powersync_role` (password `CHANGE_ME`) and the `powersync` publication are created by migration
   `20250714000002_powersync_setup.sql`. Health check: `curl localhost:8080/probes/liveness`.
4. `app/www/.env.local` must point at the local stack (loopback hosts matter — see below):
   ```
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<ANON_KEY from `supabase status`>
   VITE_POWERSYNC_URL=http://localhost:8080
   ```
5. `npm run dev` → app on `https://localhost:5173` (self-signed cert via `@vitejs/plugin-basic-ssl`;
   accept the browser warning).

### Non-obvious gotchas

- **Use loopback hosts in `.env.local`.** The dev server is HTTPS. Browsers treat `localhost` /
  `127.0.0.1` as trustworthy, so HTTP calls to local Supabase/PowerSync are *not* blocked as mixed
  content, and `localhost` satisfies PowerSync's secure-context (`navigator.locks`) requirement. A
  LAN IP (`192.168.x.x`) would break both.
- Service workers are disabled in `npm run dev`. Test offline/PWA behavior with `npm run build` +
  `npm run preview -w @pos/www` (README §"Offline app shell").
- A user only sees data after being linked in `store_staff` (RLS + PowerSync sync rules are scoped
  by `store_id`). Create Auth users via the admin API, then insert a `store_staff` row.

### Test users (local)

Seeded during setup, both linked to store "Rice Store A" (password `password123`):
`cashier@pos.local` (cashier) and `admin@pos.local` (admin). Recreate via the Supabase auth admin
API + a `store_staff` insert if the DB is reset.
