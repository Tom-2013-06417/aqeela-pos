-- Epic 4: supplier stock receipts (AP), customer utang (AR), bulk discounts.

-- ---------------------------------------------------------------------------
-- Customers (store-scoped; one open utang per customer)
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_store_id_idx on public.customers (store_id);
create index customers_store_name_idx on public.customers (store_id, name);

grant select, insert, update, delete on public.customers to authenticated, service_role;
grant select on public.customers to powersync_role;

alter table public.customers enable row level security;

create policy "staff read store customers"
  on public.customers for select to authenticated
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff insert store customers"
  on public.customers for insert to authenticated
  with check (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff update store customers"
  on public.customers for update to authenticated
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  )
  with check (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

alter publication powersync add table public.customers;

-- ---------------------------------------------------------------------------
-- Sales: payment status, customer, discount
-- ---------------------------------------------------------------------------
alter table public.sales
  add column if not exists payment_status text not null default 'paid',
  add column if not exists customer_id uuid references public.customers (id) on delete set null,
  add column if not exists discount_cents integer not null default 0;

alter table public.sales drop constraint if exists sales_payment_status_check;
alter table public.sales add constraint sales_payment_status_check
  check (payment_status in ('paid', 'pending'));

alter table public.sales drop constraint if exists sales_discount_cents_check;
alter table public.sales add constraint sales_discount_cents_check
  check (discount_cents >= 0);

alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method in ('cash', 'gcash', 'paymongo_qr', 'card', 'split', 'utang'));

-- At most one open utang per customer.
create unique index if not exists sales_one_open_utang_per_customer
  on public.sales (customer_id)
  where payment_status = 'pending' and customer_id is not null;

create index if not exists sales_customer_id_idx on public.sales (customer_id);
create index if not exists sales_payment_status_idx on public.sales (store_id, payment_status);

-- Staff may update sales in their store (settle utang, attach customer/discount).
drop policy if exists "staff update store sales" on public.sales;
create policy "staff update store sales"
  on public.sales for update to authenticated
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  )
  with check (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Stock receipts (AP) + lines
-- ---------------------------------------------------------------------------
create table public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid')),
  total_cents integer not null check (total_cents >= 0),
  due_at timestamptz,
  paid_at timestamptz,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index stock_receipts_store_id_idx on public.stock_receipts (store_id);
create index stock_receipts_payment_status_idx
  on public.stock_receipts (store_id, payment_status);
create index stock_receipts_created_at_idx on public.stock_receipts (created_at desc);

create table public.stock_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.stock_receipts (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  qty numeric(12, 3) not null check (qty > 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0)
);

create index stock_receipt_lines_receipt_id_idx on public.stock_receipt_lines (receipt_id);
create index stock_receipt_lines_product_id_idx on public.stock_receipt_lines (product_id);

grant select, insert, update, delete on public.stock_receipts to authenticated, service_role;
grant select, insert, update, delete on public.stock_receipt_lines to authenticated, service_role;
grant select on public.stock_receipts to powersync_role;
grant select on public.stock_receipt_lines to powersync_role;

alter table public.stock_receipts enable row level security;
alter table public.stock_receipt_lines enable row level security;

create policy "staff read store stock receipts"
  on public.stock_receipts for select to authenticated
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff insert store stock receipts"
  on public.stock_receipts for insert to authenticated
  with check (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff update store stock receipts"
  on public.stock_receipts for update to authenticated
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  )
  with check (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff read stock receipt lines"
  on public.stock_receipt_lines for select to authenticated
  using (
    receipt_id in (
      select r.id from public.stock_receipts r
      where r.store_id in (select store_id from public.store_staff where user_id = auth.uid())
    )
  );

create policy "staff insert stock receipt lines"
  on public.stock_receipt_lines for insert to authenticated
  with check (
    receipt_id in (
      select r.id from public.stock_receipts r
      where r.store_id in (select store_id from public.store_staff where user_id = auth.uid())
    )
  );

alter publication powersync add table public.stock_receipts;
alter publication powersync add table public.stock_receipt_lines;
