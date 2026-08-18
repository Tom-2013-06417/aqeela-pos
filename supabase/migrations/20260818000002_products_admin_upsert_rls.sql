-- PowerSync uploads with upsert (INSERT ON CONFLICT DO UPDATE).
-- Postgres then also applies the UPDATE WITH CHECK on the new row.
-- Catalog products are inserted before inventory_levels, so the old
-- "must have a level at my store" check blocked admin creates.

drop policy if exists "staff read catalog products" on public.products;
drop policy if exists "staff update catalog products" on public.products;

create policy "staff read catalog products"
  on public.products for select to authenticated
  using (
    public.is_any_store_admin()
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
    public.is_any_store_admin()
    or exists (
      select 1
      from public.inventory_levels il
      where il.product_id = products.id
        and il.store_id in (select store_id from public.store_staff where user_id = auth.uid())
    )
  )
  with check (
    public.is_any_store_admin()
    or exists (
      select 1
      from public.inventory_levels il
      where il.product_id = products.id
        and il.store_id in (select store_id from public.store_staff where user_id = auth.uid())
    )
  );
