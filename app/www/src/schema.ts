import { column, Schema, Table } from '@powersync/web';

export const STORES_TABLE = 'stores';
export const STORE_STAFF_TABLE = 'store_staff';
export const PRODUCTS_TABLE = 'products';
export const SALES_TABLE = 'sales';
export const SALE_LINES_TABLE = 'sale_lines';

const stores = new Table({
  name: column.text,
  created_at: column.text
});

const storeStaff = new Table({
  user_id: column.text,
  store_id: column.text,
  role: column.text,
  created_at: column.text
}, { indexes: { user: ['user_id'], store: ['store_id'] } });

const products = new Table(
  {
    store_id: column.text,
    name: column.text,
    unit: column.text,
    price_cents: column.integer,
    stock_qty: column.text,
    color: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { store: ['store_id'] } }
);

const sales = new Table(
  {
    store_id: column.text,
    cashier_id: column.text,
    total_cents: column.integer,
    payment_method: column.text,
    created_at: column.text
  },
  { indexes: { store: ['store_id'] } }
);

const saleLines = new Table(
  {
    sale_id: column.text,
    product_id: column.text,
    qty: column.text,
    unit_price_cents: column.integer,
    line_total_cents: column.integer
  },
  { indexes: { sale: ['sale_id'] } }
);

export const AppSchema = new Schema({
  stores,
  store_staff: storeStaff,
  products,
  sales,
  sale_lines: saleLines
});

export type Database = (typeof AppSchema)['types'];
export type ProductRecord = Database['products'];
export type SaleRecord = Database['sales'];
