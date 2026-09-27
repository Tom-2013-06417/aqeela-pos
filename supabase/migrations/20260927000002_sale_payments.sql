-- Split tender: one row per payment applied to a sale. amount_cents is what was
-- applied to the bill; tendered_cents is what the customer handed over (cash only).
-- sales.payment_method stays as a summary: the single method, or 'split'.
create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  method text not null check (method in ('cash', 'gcash', 'paymongo_qr', 'card')),
  amount_cents integer not null check (amount_cents > 0),
  tendered_cents integer check (tendered_cents is null or tendered_cents >= amount_cents),
  created_at timestamptz not null default now()
);

create index sale_payments_sale_id_idx on public.sale_payments (sale_id);

grant select, insert, update, delete on public.sale_payments to authenticated, service_role;

alter table public.sale_payments enable row level security;

create policy "staff read sale payments"
  on public.sale_payments for select to authenticated
  using (
    sale_id in (
      select s.id from public.sales s
      where s.store_id in (select store_id from public.store_staff where user_id = auth.uid())
    )
  );

create policy "staff insert sale payments"
  on public.sale_payments for insert to authenticated
  with check (
    sale_id in (
      select s.id from public.sales s
      where s.store_id in (select store_id from public.store_staff where user_id = auth.uid())
    )
  );

create policy "admins delete store sale payments"
  on public.sale_payments for delete to authenticated
  using (
    exists (
      select 1
      from public.sales s
      where s.id = sale_payments.sale_id
        and public.is_store_admin(s.store_id)
    )
  );

grant select on public.sale_payments to powersync_role;
alter publication powersync add table public.sale_payments;

alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method in ('cash', 'gcash', 'paymongo_qr', 'card', 'split'));

insert into public.sale_payments (sale_id, method, amount_cents, created_at)
select id, payment_method, total_cents, created_at
from public.sales
where total_cents > 0;
