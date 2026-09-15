-- Dilettante bazaar: add Merkado + Spectrum booths and staff links.
-- Run in the Supabase SQL Editor (production) after auth users exist.
--
-- cashier Merkado → 9471c0f6-4a0c-4a63-b465-99ff4a2bacb1
-- cashier Spectrum → e0b49c27-cbc0-471f-8b17-91e6fd39249e
-- admin keeps Rockwell + Greenhills and is also linked to both new booths.

do $$
declare
  admin_id uuid := 'd13657a0-f7d9-4987-ab65-fd1ff17552c7';
  cashier_merkado_id uuid := '9471c0f6-4a0c-4a63-b465-99ff4a2bacb1';
  cashier_spectrum_id uuid := 'e0b49c27-cbc0-471f-8b17-91e6fd39249e';
  merkado_id uuid;
  spectrum_id uuid;
  pay jsonb := '{"cash": false, "gcash": false, "paymongo_qr": true}'::jsonb;
begin
  if not exists (select 1 from public.stores where name = 'Dilettante Bazaar — Merkado') then
    insert into public.stores (name, payment_methods)
    values ('Dilettante Bazaar — Merkado', pay);
  end if;
  if not exists (select 1 from public.stores where name = 'Dilettante Bazaar — Spectrum') then
    insert into public.stores (name, payment_methods)
    values ('Dilettante Bazaar — Spectrum', pay);
  end if;

  select id into merkado_id from public.stores where name = 'Dilettante Bazaar — Merkado' limit 1;
  select id into spectrum_id from public.stores where name = 'Dilettante Bazaar — Spectrum' limit 1;

  update public.stores
  set payment_methods = pay
  where id in (merkado_id, spectrum_id);

  -- Drop accidental links of these cashiers to older booths (Users UI).
  delete from public.store_staff
  where user_id in (cashier_merkado_id, cashier_spectrum_id)
    and store_id not in (merkado_id, spectrum_id);

  insert into public.store_staff (user_id, store_id, role)
  values
    (admin_id, merkado_id, 'admin'),
    (admin_id, spectrum_id, 'admin'),
    (cashier_merkado_id, merkado_id, 'cashier'),
    (cashier_spectrum_id, spectrum_id, 'cashier')
  on conflict (user_id, store_id) do update set role = excluded.role;
end $$;
