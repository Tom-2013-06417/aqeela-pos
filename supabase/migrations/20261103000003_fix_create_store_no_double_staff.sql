-- create_store previously inserted store_staff and the bootstrap trigger did too,
-- causing a unique (user_id, store_id) violation. Rely on the trigger only.

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

  insert into public.stores (name, enabled)
  values (v_name, coalesce(p_enabled, true))
  returning id into v_id;

  return v_id;
end;
$$;
