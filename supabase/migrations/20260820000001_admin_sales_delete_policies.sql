-- Allow store admins to delete sales history (and line items) for their locations.
-- Without these policies, PowerSync upload of DELETE ops fails with 42501 and rows
-- reappear after the next sync.

create policy "admins delete store sales"
  on public.sales for delete to authenticated
  using (public.is_store_admin(store_id));

create policy "admins delete store sale lines"
  on public.sale_lines for delete to authenticated
  using (
    exists (
      select 1
      from public.sales s
      where s.id = sale_lines.sale_id
        and public.is_store_admin(s.store_id)
    )
  );
