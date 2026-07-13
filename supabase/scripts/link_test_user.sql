insert into public.store_staff (user_id, store_id, role)
values (
  '<USER_UUID>',
  (select id from public.stores where name = 'Rice Store A' limit 1),
  'cashier'
)
on conflict (user_id, store_id) do nothing;
