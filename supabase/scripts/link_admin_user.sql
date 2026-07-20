insert into public.store_staff (user_id, store_id, role)
values (
  'c115419e-8c65-4a64-9cd5-1163df32c531',
  (select id from public.stores where name = 'Rice Store A' limit 1),
  'admin'
)
on conflict (user_id, store_id) do update set role = excluded.role;
