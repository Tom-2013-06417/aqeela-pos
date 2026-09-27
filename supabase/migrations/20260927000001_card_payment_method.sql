-- Card as a sale payment method. Opt-in per store, like Paymongo QR.
alter table public.stores
  alter column payment_methods set default '{"cash": true, "gcash": true, "paymongo_qr": false, "card": false}'::jsonb;

alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method in ('cash', 'gcash', 'paymongo_qr', 'card'));
