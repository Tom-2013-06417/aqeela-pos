create role powersync_role with replication bypassrls login password 'CHANGE_ME';

grant select on all tables in schema public to powersync_role;
alter default privileges in schema public grant select on tables to powersync_role;

create publication powersync for table
  public.stores,
  public.store_staff,
  public.products,
  public.sales,
  public.sale_lines;
