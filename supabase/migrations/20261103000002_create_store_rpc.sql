-- Atomic store create: insert store + link creator as admin in one security-definer
-- function so PowerSync sync (stores ⋈ store_staff) always has a membership row.
-- Also bootstrap via trigger if a store is inserted another way (e.g. local upload).

create or replace function public.create_store(p_name text, p_enabled boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := trim(p_name);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_any_store_admin() then
    raise exception 'Only store admins can create stores';
  end if;

  if v_name is null or v_name = '' then
    raise exception 'Store name is required';
  end if;

  -- Trigger stores_bootstrap_creator_admin attaches auth.uid() as admin.
  insert into public.stores (name, enabled)
  values (v_name, coalesce(p_enabled, true))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_store(text, boolean) from public;
grant execute on function public.create_store(text, boolean) to authenticated, service_role;

create or replace function public.tg_stores_bootstrap_creator_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  insert into public.store_staff (user_id, store_id, role)
  values (auth.uid(), new.id, 'admin')
  on conflict (user_id, store_id) do nothing;

  return new;
end;
$$;

drop trigger if exists stores_bootstrap_creator_admin on public.stores;
create trigger stores_bootstrap_creator_admin
  after insert on public.stores
  for each row
  execute function public.tg_stores_bootstrap_creator_admin();
