-- Remote DBs that applied an earlier composite-PK store_staff shape are missing `id`.
-- PowerSync and the app schema expect an id primary key.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_staff'
      and column_name = 'id'
  ) then
    alter table public.store_staff add column id uuid;
    update public.store_staff set id = gen_random_uuid() where id is null;
    alter table public.store_staff alter column id set default gen_random_uuid();
    alter table public.store_staff alter column id set not null;

    alter table public.store_staff drop constraint store_staff_pkey;
    alter table public.store_staff add primary key (id);

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.store_staff'::regclass
        and conname = 'store_staff_user_id_store_id_key'
    ) then
      alter table public.store_staff
        add constraint store_staff_user_id_store_id_key unique (user_id, store_id);
    end if;
  end if;
end $$;
