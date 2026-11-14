import { column, Schema, Table } from '@powersync/web';

export const STORES_TABLE = 'stores';
export const STORE_STAFF_TABLE = 'store_staff';
export const CATEGORIES_TABLE = 'categories';
export const PRODUCTS_TABLE = 'products';
export const INVENTORY_LEVELS_TABLE = 'inventory_levels';
export const STOCK_ADJUSTMENTS_TABLE = 'stock_adjustments';
export const CUSTOMERS_TABLE = 'customers';
export const STOCK_RECEIPTS_TABLE = 'stock_receipts';
export const STOCK_RECEIPT_LINES_TABLE = 'stock_receipt_lines';
export const SALES_TABLE = 'sales';
export const SALE_LINES_TABLE = 'sale_lines';
export const SALE_PAYMENTS_TABLE = 'sale_payments';

export const STOCK_ADJUSTMENT_REASONS = ['damage', 'loss', 'correction'] as const;
export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number];

export const PAYMENT_METHODS = ['cash', 'gcash', 'paymongo_qr', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SALE_PAYMENT_STATUSES = ['paid', 'pending'] as const;
export type SalePaymentStatus = (typeof SALE_PAYMENT_STATUSES)[number];

export const RECEIPT_PAYMENT_STATUSES = ['pending', 'paid'] as const;
export type ReceiptPaymentStatus = (typeof RECEIPT_PAYMENT_STATUSES)[number];

export const STAFF_ROLES = ['cashier', 'inventory_manager', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function parseStaffRole(role: string | null | undefined): StaffRole {
  if (role === 'admin' || role === 'inventory_manager' || role === 'cashier') return role;
  return 'cashier';
}

/** Highest privilege across store assignments: admin > inventory_manager > cashier. */
export function resolveStaffAccess(roles: Iterable<string>): {
  isAdmin: boolean;
  canManageInventory: boolean;
  canUseCashier: boolean;
} {
  let isAdmin = false;
  let canManageInventory = false;
  for (const role of roles) {
    if (role === 'admin') {
      isAdmin = true;
      canManageInventory = true;
    } else if (role === 'inventory_manager') {
      canManageInventory = true;
    }
  }
  return {
    isAdmin,
    canManageInventory,
    // Admins and inventory managers stay off the register.
    canUseCashier: !isAdmin && !canManageInventory
  };
}

/** amountCents is applied to the bill; tenderedCents is cash handed over (change = tendered - amount). */
export type Tender = {
  method: PaymentMethod;
  amountCents: number;
  tenderedCents?: number;
};

export type PaymentMethodToggles = Record<PaymentMethod, boolean>;

const DEFAULT_PAYMENT_METHODS: PaymentMethodToggles = {
  cash: true,
  gcash: true,
  paymongo_qr: false,
  card: false
};

function unwrapJsonObject(raw: unknown): Record<string, unknown> | null {
  let value: unknown = raw;
  // PowerSync stores jsonb as text; a bad upload round-trip can double-encode the payload.
  for (let depth = 0; depth < 3; depth++) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return null;
      try {
        value = JSON.parse(trimmed);
      } catch {
        return null;
      }
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }
  return null;
}

export function parsePaymentMethods(raw: unknown): PaymentMethodToggles {
  const parsed = unwrapJsonObject(raw);
  if (!parsed) return { ...DEFAULT_PAYMENT_METHODS };

  return {
    cash: parsed.cash === true,
    gcash: parsed.gcash === true,
    paymongo_qr: parsed.paymongo_qr === true,
    card: parsed.card === true
  };
}

export function serializePaymentMethods(toggles: PaymentMethodToggles): string {
  return JSON.stringify(toggles);
}

export function paymentMethodLabel(method: string) {
  if (method === 'paymongo_qr') return 'QR transfer';
  if (method === 'gcash') return 'GCash';
  if (method === 'cash') return 'Cash';
  if (method === 'card') return 'Card';
  if (method === 'split') return 'Split';
  if (method === 'utang') return 'Utang';
  return method;
}

export function paymentStatusLabel(status: string) {
  if (status === 'pending') return 'Not paid yet';
  if (status === 'paid') return 'Paid';
  return status;
}

/** PowerSync SQLite may store Postgres booleans as 0/1, true/false, or omit until synced. */
export function isStoreEnabled(store: { enabled?: number | boolean | null }) {
  const value = store.enabled;
  if (value == null) return true;
  if (typeof value === 'boolean') return value;
  return value !== 0;
}

/** Defaults to sellable when column is missing or null (pre-migration rows). */
export function isProductSellable(product: { sellable?: number | boolean | null }) {
  const value = product.sellable;
  if (value == null) return true;
  if (typeof value === 'boolean') return value;
  return value !== 0;
}

const stores = new Table({
  name: column.text,
  payment_methods: column.text,
  // Postgres boolean → SQLite integer (0/1) via PowerSync
  enabled: column.integer,
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
    // Postgres boolean → SQLite integer (0/1) via PowerSync
    sellable: column.integer,
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

const stockAdjustments = new Table(
  {
    product_id: column.text,
    store_id: column.text,
    qty_delta: column.text,
    reason: column.text,
    note: column.text,
    created_by: column.text,
    created_at: column.text
  },
  { indexes: { product: ['product_id'], store: ['store_id'] } }
);

const customers = new Table(
  {
    store_id: column.text,
    name: column.text,
    phone: column.text,
    created_at: column.text,
    updated_at: column.text
  },
  { indexes: { store: ['store_id'] } }
);

const stockReceipts = new Table(
  {
    store_id: column.text,
    payment_status: column.text,
    total_cents: column.integer,
    due_at: column.text,
    paid_at: column.text,
    note: column.text,
    created_by: column.text,
    created_at: column.text
  },
  { indexes: { store: ['store_id'] } }
);

const stockReceiptLines = new Table(
  {
    receipt_id: column.text,
    product_id: column.text,
    qty: column.text,
    unit_cost_cents: column.integer,
    line_total_cents: column.integer
  },
  { indexes: { receipt: ['receipt_id'], product: ['product_id'] } }
);

const sales = new Table(
  {
    store_id: column.text,
    cashier_id: column.text,
    total_cents: column.integer,
    payment_method: column.text,
    payment_status: column.text,
    customer_id: column.text,
    discount_cents: column.integer,
    created_at: column.text
  },
  { indexes: { store: ['store_id'], customer: ['customer_id'] } }
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

const salePayments = new Table(
  {
    sale_id: column.text,
    method: column.text,
    amount_cents: column.integer,
    tendered_cents: column.integer,
    created_at: column.text
  },
  { indexes: { sale: ['sale_id'] } }
);

export const AppSchema = new Schema({
  stores,
  store_staff: storeStaff,
  categories,
  products,
  inventory_levels: inventoryLevels,
  stock_adjustments: stockAdjustments,
  customers,
  stock_receipts: stockReceipts,
  stock_receipt_lines: stockReceiptLines,
  sales,
  sale_lines: saleLines,
  sale_payments: salePayments
});

export type Database = (typeof AppSchema)['types'];
export type StoreRecord = Database['stores'];
export type CategoryRecord = Database['categories'];
export type ProductRecord = Database['products'];
export type InventoryLevelRecord = Database['inventory_levels'];
export type StockAdjustmentRecord = Database['stock_adjustments'];
export type CustomerRecord = Database['customers'];
export type StockReceiptRecord = Database['stock_receipts'];
export type StockReceiptLineRecord = Database['stock_receipt_lines'];
export type SaleRecord = Database['sales'];

export const RICE_CATEGORY_SLUG = 'rice';

export function isRiceCategory(category: { slug?: string | null } | null | undefined) {
  return category?.slug === RICE_CATEGORY_SLUG;
}

/** Client-generated bigint PK for inventory_levels / stock_adjustments (PowerSync requires an id on insert). */
export function newInventoryLevelId() {
  return String(Date.now() * 4096 + Math.floor(Math.random() * 4096));
}

export function newStockAdjustmentId() {
  return newInventoryLevelId();
}
