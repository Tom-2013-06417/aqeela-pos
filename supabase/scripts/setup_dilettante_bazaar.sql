-- Dilettante bazaar: two booths, payment defaults, staff linking, optional catalog seed.
-- 1. Create Auth users in Supabase (admin + 2 cashiers).
-- 2. Paste their UUIDs below.
-- 3. Run in the SQL Editor after migrations (including catalog/inventory_levels).

-- AUTH UUIDS
-- admin is linked to both locations; cashier A → Rockwell, cashier B → Greenhills.
do $$
declare
  admin_id uuid := 'd13657a0-f7d9-4987-ab65-fd1ff17552c7';
  cashier_a_id uuid := '5c2b4b53-9308-4fb0-88c6-0e32f114538a';
  cashier_b_id uuid := '813dcfc6-ad4f-47b1-837e-e9496f225ef0';
  rockwell_id uuid;
  greenhills_id uuid;
  perfume_category_id uuid;
  product_id uuid;
begin
  if not exists (select 1 from public.stores where name = 'Dilettante Bazaar — Rockwell') then
    insert into public.stores (name, payment_methods)
    values ('Dilettante Bazaar — Rockwell', '{"cash": false, "gcash": false, "paymongo_qr": true}'::jsonb);
  end if;
  if not exists (select 1 from public.stores where name = 'Dilettante Bazaar — Greenhills') then
    insert into public.stores (name, payment_methods)
    values ('Dilettante Bazaar — Greenhills', '{"cash": false, "gcash": false, "paymongo_qr": true}'::jsonb);
  end if;

  select id into rockwell_id from public.stores where name = 'Dilettante Bazaar — Rockwell' limit 1;
  select id into greenhills_id from public.stores where name = 'Dilettante Bazaar — Greenhills' limit 1;

  update public.stores
  set payment_methods = '{"cash": false, "gcash": false, "paymongo_qr": true}'::jsonb
  where id in (rockwell_id, greenhills_id);

  insert into public.store_staff (user_id, store_id, role)
  values
    (admin_id, rockwell_id, 'admin'),
    (admin_id, greenhills_id, 'admin'),
    (cashier_a_id, rockwell_id, 'cashier'),
    (cashier_b_id, greenhills_id, 'cashier')
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

  -- Sample catalog (one product, stock at both locations). Skip if already present.
  if not exists (select 1 from public.products where name = 'Sample Eau de Parfum 50ml') then
    insert into public.products (name, unit, price_cents, color, category_id)
    values ('Sample Eau de Parfum 50ml', 'pc', 180000, 'violet', perfume_category_id)
    returning id into product_id;

    insert into public.inventory_levels (product_id, store_id, qty)
    values
      (product_id, rockwell_id, 12),
      (product_id, greenhills_id, 12);
  end if;
end $$;
