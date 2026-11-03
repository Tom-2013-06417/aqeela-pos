-- Allow existing store admins to create new stores and bootstrap themselves as
-- the first admin on that store (needed so PowerSync can sync the new row).

create policy "admins insert stores"
  on public.stores for insert to authenticated
  with check (public.is_any_store_admin());

create policy "admins bootstrap first store staff"
  on public.store_staff for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'admin'
    and public.is_any_store_admin()
    and not exists (
      select 1
      from public.store_staff existing
      where existing.store_id = store_staff.store_id
    )
  );
