alter table public.products
  add column color text
  check (color is null or color in ('red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'));
