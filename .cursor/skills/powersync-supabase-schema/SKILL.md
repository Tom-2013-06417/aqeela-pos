---
name: powersync-supabase-schema
description: >-
  Keep PowerSync in sync when adding or changing Supabase tables/columns in the
  POS monorepo (Projects/pos). Use when creating Supabase migrations, altering
  public schema, adding tables for offline sync, updating PowerSync sync-config
  or client schema.ts, or when synced rows appear in Supabase but disappear/never
  show in the app.
---

# PowerSync + Supabase schema changes

For the POS monorepo at `Projects/pos`. New Supabase tables/columns do **not**
reach the React app until PowerSync replication + sync streams + the client
schema are updated. `supabase db push` alone is not enough.

## Checklist (do all that apply)

```
Schema sync progress:
- [ ] 1. Migration (table/columns + RLS)
- [ ] 2. Publication + powersync_role SELECT (new tables only)
- [ ] 3. Client schema.ts
- [ ] 4. sync-config.yaml stream query
- [ ] 5. supabase db push
- [ ] 6. Redeploy PowerSync on Railway
- [ ] 7. Verify replication logs + app refresh
```

### 1. Migration

Add under `supabase/migrations/`. Match existing RLS patterns (store_staff scoped).

### 2. New tables only — publication + grants

```sql
grant select on public.<table> to powersync_role;
alter publication powersync add table public.<table>;
```

### 3. Client schema

Update `app/www/src/schema.ts` (numerics as `column.text` like `stock_qty`).

### 4. Sync streams

Update `services/powersync/config/sync-config.yaml`. Join via `store_staff`.
**Do not alias the `FROM` table.**

### 5–6. Push + redeploy

```bash
supabase db push
cd services/powersync && railway up --service powersync
```

Confirm logs: `To replicate: "public"."<table>"`.

### 7. Client refresh

Hard-refresh; if stale, clear IndexedDB `pos.db` and sign in again.

## Symptom → fix

| Symptom | Likely cause |
| --- | --- |
| In Supabase, missing in app | Sync stream missing or PowerSync not redeployed |
| Create in app → vanishes in UI | Upload works; download stream missing table |
| New table never in replication logs | Missing `alter publication powersync add table` |
