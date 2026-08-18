-- Dilettante bazaar: two booths, payment defaults, staff linking, optional catalog seed.
-- 1. Create Auth users in Supabase (admin + 2 cashiers).
-- 2. Paste their UUIDs below.
-- 3. Run in the SQL Editor after migrations (including catalog/inventory_levels).

-- AUTH UUIDS
-- admin is linked to both booths; each cashier to one booth.
do $$
declare
  admin_id uuid := '<ADMIN_USER_UUID>';
  cashier_a_id uuid := '<CASHIER_A_USER_UUID>';
  cashier_b_id uuid := '<CASHIER_B_USER_UUID>';
  booth_a_id uuid;
  booth_b_id uuid;
  perfume_category_id uuid;
  product_id uuid;
begin
  if not exists (select 1 from public.stores where name = 'Dilettante Bazaar — Booth A') then
    insert into public.stores (name, payment_methods)
    values ('Dilettante Bazaar — Booth A', '{"cash": false, "gcash": false, "paymongo_qr": true}'::jsonb);
  end if;
  if not exists (select 1 from public.stores where name = 'Dilettante Bazaar — Booth B') then
    insert into public.stores (name, payment_methods)
    values ('Dilettante Bazaar — Booth B', '{"cash": false, "gcash": false, "paymongo_qr": true}'::jsonb);
  end if;

  select id into booth_a_id from public.stores where name = 'Dilettante Bazaar — Booth A' limit 1;
  select id into booth_b_id from public.stores where name = 'Dilettante Bazaar — Booth B' limit 1;

  update public.stores
  set payment_methods = '{"cash": false, "gcash": false, "paymongo_qr": true}'::jsonb
  where id in (booth_a_id, booth_b_id);

  insert into public.store_staff (user_id, store_id, role)
  values
    (admin_id, booth_a_id, 'admin'),
    (admin_id, booth_b_id, 'admin'),
    (cashier_a_id, booth_a_id, 'cashier'),
    (cashier_b_id, booth_b_id, 'cashier')
  on conflict (user_id, store_id) do update set role = excluded.role;

  select id into perfume_category_id
  from public.categories
  where name = 'Perfume'
  limit 1;

  if perfume_category_id is null then
    insert into public.categories (name, slug)
    values ('Perfume', null)
    returning id into perfume_category_id;
  end if;

  -- Sample catalog (one product, stock at both booths). Skip if already present.
  if not exists (select 1 from public.products where name = 'Sample Eau de Parfum 50ml') then
    insert into public.products (name, unit, price_cents, color, category_id)
    values ('Sample Eau de Parfum 50ml', 'pc', 180000, 'violet', perfume_category_id)
    returning id into product_id;

    insert into public.inventory_levels (product_id, store_id, qty)
    values
      (product_id, booth_a_id, 12),
      (product_id, booth_b_id, 12);
  end if;
end $$;
