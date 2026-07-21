-- Store-scoped product categories (Rice is a seeded preset with slug = 'rice').

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, slug)
);

create index categories_store_id_idx on public.categories (store_id);

alter table public.products
  add column category_id uuid references public.categories (id) on delete set null,
  add column kg_per_sack numeric(12, 3) check (kg_per_sack is null or kg_per_sack > 0);

create index products_category_id_idx on public.products (category_id);

grant select, insert, update, delete on public.categories to authenticated, service_role;

alter table public.categories enable row level security;

create policy "staff read store categories"
  on public.categories for select to authenticated
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff insert store categories"
  on public.categories for insert to authenticated
  with check (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff update store categories"
  on public.categories for update to authenticated
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  )
  with check (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
  );

create policy "staff delete store categories"
  on public.categories for delete to authenticated
  using (
    store_id in (select store_id from public.store_staff where user_id = auth.uid())
      and (slug is distinct from 'rice')
  );

-- Seed Rice for every store.
insert into public.categories (store_id, name, slug)
select s.id, 'Rice', 'rice'
from public.stores s
where not exists (
  select 1 from public.categories c
  where c.store_id = s.id and c.slug = 'rice'
);

-- Ensure new stores get a Rice category.
create or replace function public.seed_rice_category_for_store()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (store_id, name, slug)
  values (new.id, 'Rice', 'rice')
  on conflict (store_id, slug) do nothing;
  return new;
end;
$$;

create trigger stores_seed_rice_category
  after insert on public.stores
  for each row
  execute function public.seed_rice_category_for_store();

-- Assign rice products to Rice; set sack size; drop redundant sack product.
update public.products p
set
  category_id = c.id,
  kg_per_sack = 25,
  unit = 'kg',
  updated_at = now()
from public.categories c
where c.store_id = p.store_id
  and c.slug = 'rice'
  and p.name in ('Sinandomeng Rice', 'Jasmine Rice');

-- Drop redundant sack product when unused (sack is now a per-product kg shortcut).
delete from public.products p
where p.name = 'Rice Sack 25kg'
  and p.unit = 'sack'
  and not exists (
    select 1 from public.sale_lines sl where sl.product_id = p.id
  );

grant select on public.categories to powersync_role;

alter publication powersync add table public.categories;
