-- Allow inventory_manager (and admin) to create catalog products and to read/update
-- products that do not yet have inventory_levels (PowerSync upsert create path).

create or replace function public.is_any_store_catalog_editor()
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
      and role in ('admin', 'inventory_manager')
  );
$$;

revoke all on function public.is_any_store_catalog_editor() from public;
grant execute on function public.is_any_store_catalog_editor() to authenticated, service_role;

drop policy if exists "admins insert catalog products" on public.products;
drop policy if exists "catalog editors insert catalog products" on public.products;

create policy "catalog editors insert catalog products"
  on public.products for insert to authenticated
  with check (public.is_any_store_catalog_editor());

drop policy if exists "staff read catalog products" on public.products;
drop policy if exists "staff update catalog products" on public.products;

create policy "staff read catalog products"
  on public.products for select to authenticated
  using (
    public.is_any_store_catalog_editor()
    or exists (
      select 1
      from public.inventory_levels il
      where il.product_id = products.id
        and il.store_id in (select store_id from public.store_staff where user_id = auth.uid())
    )
  );

create policy "staff update catalog products"
  on public.products for update to authenticated
  using (
    public.is_any_store_catalog_editor()
    or exists (
      select 1
      from public.inventory_levels il
      where il.product_id = products.id
        and il.store_id in (select store_id from public.store_staff where user_id = auth.uid())
    )
  )
  with check (
    public.is_any_store_catalog_editor()
    or exists (
      select 1
      from public.inventory_levels il
      where il.product_id = products.id
        and il.store_id in (select store_id from public.store_staff where user_id = auth.uid())
    )
  );
