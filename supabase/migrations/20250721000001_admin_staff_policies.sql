-- Helper avoids recursive RLS when admins query store_staff for their stores.
create or replace function public.is_store_admin(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_staff
    where user_id = auth.uid()
      and store_id = p_store_id
      and role = 'admin'
  );
$$;

revoke all on function public.is_store_admin(uuid) from public;
grant execute on function public.is_store_admin(uuid) to authenticated, service_role;

create policy "admins read store staff"
  on public.store_staff for select to authenticated
  using (public.is_store_admin(store_id));

create policy "admins insert store staff"
  on public.store_staff for insert to authenticated
  with check (public.is_store_admin(store_id));

create policy "admins update store staff"
  on public.store_staff for update to authenticated
  using (public.is_store_admin(store_id))
  with check (public.is_store_admin(store_id));

create policy "admins delete store staff"
  on public.store_staff for delete to authenticated
  using (public.is_store_admin(store_id));
