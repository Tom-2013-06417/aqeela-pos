import { column, Schema, Table } from '@powersync/web';

export const STORES_TABLE = 'stores';
export const STORE_STAFF_TABLE = 'store_staff';
export const CATEGORIES_TABLE = 'categories';
export const PRODUCTS_TABLE = 'products';
export const INVENTORY_LEVELS_TABLE = 'inventory_levels';
export const SALES_TABLE = 'sales';
export const SALE_LINES_TABLE = 'sale_lines';

export const PAYMENT_METHODS = ['cash', 'gcash', 'paymongo_qr'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentMethodToggles = Record<PaymentMethod, boolean>;

const DEFAULT_PAYMENT_METHODS: PaymentMethodToggles = {
  cash: true,
  gcash: true,
  paymongo_qr: false
};

export function parsePaymentMethods(raw: unknown): PaymentMethodToggles {
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw as Record<string, unknown>;
  }

  if (!parsed) return { ...DEFAULT_PAYMENT_METHODS };

  return {
    cash: parsed.cash !== false,
    gcash: parsed.gcash !== false,
    paymongo_qr: parsed.paymongo_qr === true
  };
}

export function paymentMethodLabel(method: string) {
  if (method === 'paymongo_qr') return 'Paymongo QR';
  if (method === 'gcash') return 'GCash';
  if (method === 'cash') return 'Cash';
  return method;
}

const stores = new Table({
  name: column.text,
  payment_methods: column.text,
  created_at: column.text
});

const storeStaff = new Table({
  user_id: column.text,
  store_id: column.text,
  role: column.text,
  created_at: column.text
}, { indexes: { user: ['user_id'], store: ['store_id'] } });

const categories = new Table(
  {
    name: column.text,
    slug: column.text,
    created_at: column.text,
    updated_at: column.text
  }
);

const products = new Table(
  {
    name: column.text,
    unit: column.text,
    price_cents: column.integer,
    color: column.text,
    category_id: column.text,
    kg_per_sack: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { category: ['category_id'] } }
);

const inventoryLevels = new Table(
  {
    product_id: column.text,
    store_id: column.text,
    qty: column.text
  },
  { indexes: { product: ['product_id'], store: ['store_id'] } }
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
  categories,
  products,
  inventory_levels: inventoryLevels,
  sales,
  sale_lines: saleLines
});

export type Database = (typeof AppSchema)['types'];
export type StoreRecord = Database['stores'];
export type CategoryRecord = Database['categories'];
export type ProductRecord = Database['products'];
export type InventoryLevelRecord = Database['inventory_levels'];
export type SaleRecord = Database['sales'];

export const RICE_CATEGORY_SLUG = 'rice';

export function isRiceCategory(category: { slug?: string | null } | null | undefined) {
  return category?.slug === RICE_CATEGORY_SLUG;
}

/** Client-generated bigint PK for inventory_levels (PowerSync requires an id on insert). */
export function newInventoryLevelId() {
  return String(Date.now() * 4096 + Math.floor(Math.random() * 4096));
}
