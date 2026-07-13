create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.store_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  role text not null check (role in ('cashier', 'inventory_manager', 'admin')),
  created_at timestamptz not null default now(),
  unique (user_id, store_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  unit text not null default 'kg',
  price_cents integer not null check (price_cents >= 0),
  stock_qty numeric(12, 3) not null default 0 check (stock_qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  cashier_id uuid not null references auth.users (id) on delete restrict,
  total_cents integer not null check (total_cents >= 0),
  payment_method text not null check (payment_method in ('cash', 'gcash')),
  created_at timestamptz not null default now()
);

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  qty numeric(12, 3) not null check (qty > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0)
);

create index products_store_id_idx on public.products (store_id);
create index sales_store_id_created_at_idx on public.sales (store_id, created_at desc);
create index sale_lines_sale_id_idx on public.sale_lines (sale_id);

grant select, insert, update, delete on public.stores to authenticated, service_role;
grant select, insert, update, delete on public.store_staff to authenticated, service_role;
grant select, insert, update, delete on public.products to authenticated, service_role;
grant select, insert, update, delete on public.sales to authenticated, service_role;
grant select, insert, update, delete on public.sale_lines to authenticated, service_role;

alter table public.stores enable row level security;
alter table public.store_staff enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;

create policy "staff read own store assignments"
  on public.store_staff for select to authenticated
  using (user_id = auth.uid());

create policy "staff read assigned stores"
  on public.stores for select to authenticated
  using (
    id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff read store products"
  on public.products for select to authenticated
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff update store products"
  on public.products for update to authenticated
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  )
  with check (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff insert store products"
  on public.products for insert to authenticated
  with check (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff read store sales"
  on public.sales for select to authenticated
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff insert store sales"
  on public.sales for insert to authenticated
  with check (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
      and cashier_id = auth.uid()
  );

create policy "staff read sale lines"
  on public.sale_lines for select to authenticated
  using (
    sale_id in (
      select s.id from public.sales s
      where s.store_id in (select store_id from public.store_staff where user_id = auth.uid())
    )
  );

create policy "staff insert sale lines"
  on public.sale_lines for insert to authenticated
  with check (
    sale_id in (
      select s.id from public.sales s
      where s.store_id in (select store_id from public.store_staff where user_id = auth.uid())
    )
  );

insert into public.stores (name) values ('Rice Store A'), ('Frozen Store B');

insert into public.products (store_id, name, unit, price_cents, stock_qty)
select s.id, p.name, p.unit, p.price_cents, p.stock_qty
from public.stores s
cross join (
  values
    ('Sinandomeng Rice', 'kg', 5200, 120.0),
    ('Jasmine Rice', 'kg', 5800, 85.5),
    ('Rice Sack 25kg', 'sack', 125000, 40.0)
) as p(name, unit, price_cents, stock_qty)
where s.name = 'Rice Store A';

insert into public.products (store_id, name, unit, price_cents, stock_qty)
select s.id, p.name, p.unit, p.price_cents, p.stock_qty
from public.stores s
cross join (
  values
    ('Chicken Hotdog', 'pack', 8500, 60.0),
    ('Pork Dumplings', 'pack', 12000, 35.0),
    ('Plastic Bag Large', 'pc', 200, 500.0)
) as p(name, unit, price_cents, stock_qty)
where s.name = 'Frozen Store B';
