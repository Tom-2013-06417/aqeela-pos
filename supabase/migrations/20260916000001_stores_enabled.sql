-- Soft enable/disable for stores. Disabled stores stay in the DB (and keep sales);
-- the app hides them from Inventory until a future filter lands on Sales.
alter table public.stores
  add column enabled boolean not null default true;
