import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useQuery, useStatus } from '@powersync/react';
import { CashPaymentModal } from '../CashPaymentModal/CashPaymentModal';
import { PaymentConfirmModal } from '../PaymentConfirmModal/PaymentConfirmModal';
import { SplitPaymentModal } from '../SplitPaymentModal/SplitPaymentModal';
import type { SupabaseConnector } from '../connector';
import { db } from '../powerSync';
import { productColorHex, productColorTint } from '../productColors';
import { StatusBanner } from '../StatusBanner/StatusBanner';
import '../CashPaymentModal/CashPaymentModal.css';
import '../PaymentConfirmModal/PaymentConfirmModal.css';
import '../styles/fullscreen-modal.css';
import {
  CATEGORIES_TABLE,
  CUSTOMERS_TABLE,
  INVENTORY_LEVELS_TABLE,
  PRODUCTS_TABLE,
  SALE_LINES_TABLE,
  SALE_PAYMENTS_TABLE,
  SALES_TABLE,
  STORES_TABLE,
  STORE_STAFF_TABLE,
  isProductSellable,
  isRiceCategory,
  parsePaymentMethods,
  paymentMethodLabel,
  type CategoryRecord,
  type CustomerRecord,
  type PaymentMethod,
  type ProductRecord,
  type Tender
} from '../schema';
import './CashierScreen.css';

const RICE_STEP = 0.25;

function formatMoney(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function formatKg(qty: number) {
  if (Number.isInteger(qty)) return String(qty);
  return qty.toFixed(3).replace(/\.?0+$/, '');
}

function roundQty(n: number) {
  return Math.round(n * 1000) / 1000;
}

type CatalogProduct = ProductRecord & {
  stock_qty: string;
  inventory_level_id: string;
};

type CartLine = {
  product: CatalogProduct;
  qty: number;
};

const PAYMENT_METHOD_BUTTONS: PaymentMethod[] = ['cash', 'gcash', 'paymongo_qr', 'card'];

export function CashierScreen({ connector }: { connector: SupabaseConnector }) {
  const status = useStatus();
  const [search, setSearch] = useState('');
  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const [draftQtyInput, setDraftQtyInput] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [pendingMethod, setPendingMethod] = useState<Exclude<PaymentMethod, 'cash'> | null>(null);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [showUtangConfirm, setShowUtangConfirm] = useState(false);

  useEffect(() => {
    if (!orderSheetOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOrderSheetOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [orderSheetOpen]);

  const userId = connector.currentSession?.user?.id ?? '';

  const { data: staffRows = [] } = useQuery<{ store_id: string }>(
    userId
      ? `SELECT store_id FROM ${STORE_STAFF_TABLE} WHERE user_id = ? LIMIT 1`
      : `SELECT store_id FROM ${STORE_STAFF_TABLE} WHERE 1 = 0`,
    userId ? [userId] : []
  );
  const storeId = staffRows[0]?.store_id ?? '';

  const { data: storeRows = [] } = useQuery<{ name: string; payment_methods: string | null }>(
    storeId
      ? `SELECT name, payment_methods FROM ${STORES_TABLE} WHERE id = ?`
      : `SELECT name, payment_methods FROM ${STORES_TABLE} WHERE 1 = 0`,
    storeId ? [storeId] : []
  );
  const storeName = storeRows[0]?.name ?? '';
  const paymentToggles = useMemo(
    () => parsePaymentMethods(storeRows[0]?.payment_methods),
    [storeRows]
  );

  const { data: customers = [] } = useQuery<CustomerRecord>(
    storeId
      ? `SELECT * FROM ${CUSTOMERS_TABLE} WHERE store_id = ? ORDER BY name ASC`
      : `SELECT * FROM ${CUSTOMERS_TABLE} WHERE 1 = 0`,
    storeId ? [storeId] : []
  );

  const { data: openUtangRows = [] } = useQuery<{ customer_id: string }>(
    storeId
      ? `SELECT customer_id FROM ${SALES_TABLE}
         WHERE store_id = ? AND payment_status = 'pending' AND customer_id IS NOT NULL`
      : `SELECT customer_id FROM ${SALES_TABLE} WHERE 1 = 0`,
    storeId ? [storeId] : []
  );
  const customersWithOpenUtang = useMemo(() => {
    const set = new Set<string>();
    for (const row of openUtangRows) {
      if (row.customer_id) set.add(row.customer_id);
    }
    return set;
  }, [openUtangRows]);

  const { data: productsRaw = [], isLoading: productsLoading } = useQuery<
    CatalogProduct & { sellable?: number | boolean | null }
  >(
    storeId
      ? `SELECT p.id, p.name, p.unit, p.price_cents, p.color, p.category_id, p.kg_per_sack, p.sellable,
                il.qty as stock_qty, il.id as inventory_level_id
         FROM ${PRODUCTS_TABLE} p
         INNER JOIN ${INVENTORY_LEVELS_TABLE} il ON il.product_id = p.id
         WHERE il.store_id = ?
         ORDER BY p.name ASC`
      : `SELECT p.id, p.name, p.unit, p.price_cents, p.color, p.category_id, p.kg_per_sack, p.sellable,
                il.qty as stock_qty, il.id as inventory_level_id
         FROM ${PRODUCTS_TABLE} p
         INNER JOIN ${INVENTORY_LEVELS_TABLE} il ON il.product_id = p.id
         WHERE 1 = 0`,
    storeId ? [storeId] : []
  );

  const products = useMemo(
    () => productsRaw.filter((product) => isProductSellable(product)),
    [productsRaw]
  );

  const { data: categories = [] } = useQuery<CategoryRecord>(
    `SELECT * FROM ${CATEGORIES_TABLE} ORDER BY name ASC`
  );

  const categoriesById = useMemo(() => {
    const map = new Map<string, CategoryRecord>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const productById = useMemo(() => {
    const map = new Map<string, CatalogProduct>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name ?? '').toLowerCase().includes(q));
  }, [products, search]);

  const cartLines: CartLine[] = useMemo(() => {
    return Object.entries(cartQty)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const product = productById.get(id);
        return product ? { product, qty } : null;
      })
      .filter((line): line is CartLine => line !== null);
  }, [cartQty, productById]);

  const itemCount = cartLines.reduce((sum, line) => sum + line.qty, 0);
  const subtotalCents = cartLines.reduce(
    (sum, line) => sum + Math.round(line.qty * (line.product.price_cents ?? 0)),
    0
  );
  const discountCents = (() => {
    const trimmed = discountInput.trim();
    if (trimmed === '') return 0;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(Math.round(n * 100), subtotalCents);
  })();
  const totalCents = Math.max(0, subtotalCents - discountCents);

  const enabledMethods = PAYMENT_METHOD_BUTTONS.filter((method) => paymentToggles[method]);

  function productIsRice(product: ProductRecord) {
    if (!product.category_id) return false;
    return isRiceCategory(categoriesById.get(product.category_id));
  }

  function maxQty(product: CatalogProduct) {
    const stock = Number(product.stock_qty);
    if (!Number.isFinite(stock) || stock < 0) return 0;
    return productIsRice(product) ? stock : Math.floor(stock);
  }

  function setQty(product: CatalogProduct, next: number) {
    const stockCap = maxQty(product);
    const rounded = productIsRice(product) ? roundQty(next) : Math.floor(roundQty(next));
    const capped = Math.max(0, Math.min(rounded, stockCap));
    setCartQty((prev) => {
      if (capped <= 0) {
        const { [product.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [product.id]: capped };
    });
    setDraftQtyInput((prev) => {
      const nextDraft = { ...prev };
      delete nextDraft[product.id];
      return nextDraft;
    });
  }

  function qtyInputValue(product: CatalogProduct, qty: number) {
    if (Object.prototype.hasOwnProperty.call(draftQtyInput, product.id)) {
      return draftQtyInput[product.id];
    }
    if (qty <= 0) return '';
    return productIsRice(product) ? formatKg(qty) : String(qty);
  }

  function commitQtyInput(product: CatalogProduct) {
    const raw = draftQtyInput[product.id];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    if (trimmed === '') {
      setQty(product, 0);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      setDraftQtyInput((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      return;
    }
    setQty(product, n);
  }

  async function ensureCustomerId(): Promise<string | null> {
    if (customerId) return customerId;
    const name = newCustomerName.trim();
    if (!name) return null;
    if (!storeId) throw new Error('No store assignment found for this user.');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO ${CUSTOMERS_TABLE} (id, store_id, name, phone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, storeId, name, null, now, now]
    );
    setCustomerId(id);
    setNewCustomerName('');
    return id;
  }

  async function placeOrder(tenders: Tender[], options?: { asUtang?: boolean }) {
    const asUtang = options?.asUtang === true;
    if (cartLines.length === 0) {
      setMessage('Add products first');
      return;
    }

    if (!asUtang && tenders.length === 0) {
      setMessage('Choose how they paid first');
      return;
    }

    if (!asUtang) {
      const disabledTender = tenders.find((tender) => !paymentToggles[tender.method]);
      if (disabledTender) {
        setMessage(`${paymentMethodLabel(disabledTender.method)} is turned off for this store`);
        return;
      }
    }

    const session = connector.currentSession;
    if (!session?.user?.id) {
      setMessage('Please sign in first');
      return;
    }

    for (const line of cartLines) {
      const stock = Number(line.product.stock_qty);
      if (line.qty > stock) {
        const unit = productIsRice(line.product) ? 'kg' : line.product.unit;
        setMessage(
          `Not enough ${line.product.name} in stock (only ${stock} ${unit} left)`
        );
        return;
      }
    }

    setBusy(true);
    setMessage(null);

    try {
      if (!storeId) {
        throw new Error('Your account is not linked to a store yet. Ask an admin for help.');
      }

      let resolvedCustomerId: string | null = null;
      if (asUtang) {
        resolvedCustomerId = await ensureCustomerId();
        if (!resolvedCustomerId) {
          throw new Error('Pick or type the customer name first');
        }
        if (customersWithOpenUtang.has(resolvedCustomerId)) {
          throw new Error('This customer still has unpaid utang. Collect that first.');
        }
      } else if (customerId || newCustomerName.trim()) {
        resolvedCustomerId = await ensureCustomerId();
      }

      const saleId = crypto.randomUUID();
      const now = new Date().toISOString();
      const subtotal = cartLines.reduce(
        (sum, line) => sum + Math.round(line.qty * (line.product.price_cents ?? 0)),
        0
      );
      const discount = Math.min(discountCents, subtotal);
      const total = Math.max(0, subtotal - discount);

      if (!asUtang) {
        const paidCents = tenders.reduce((sum, tender) => sum + tender.amountCents, 0);
        if (paidCents !== total) {
          throw new Error(
            `Payments (${formatMoney(paidCents)}) do not match the total (${formatMoney(total)})`
          );
        }
      }

      const methods = new Set(tenders.map((tender) => tender.method));
      const saleMethod = asUtang
        ? 'utang'
        : methods.size === 1
          ? tenders[0].method
          : 'split';
      const paymentStatus = asUtang ? 'pending' : 'paid';

      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO ${SALES_TABLE}
             (id, store_id, cashier_id, total_cents, payment_method, payment_status, customer_id, discount_cents, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            saleId,
            storeId,
            session.user.id,
            total,
            saleMethod,
            paymentStatus,
            resolvedCustomerId,
            discount,
            now
          ]
        );

        for (const line of cartLines) {
          const unitPrice = line.product.price_cents ?? 0;
          const lineTotal = Math.round(line.qty * unitPrice);
          const stock = Number(line.product.stock_qty);
          const newStock = (stock - line.qty).toFixed(3);

          await tx.execute(
            `INSERT INTO ${SALE_LINES_TABLE} (id, sale_id, product_id, qty, unit_price_cents, line_total_cents)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), saleId, line.product.id, line.qty.toFixed(3), unitPrice, lineTotal]
          );
          await tx.execute(`UPDATE ${INVENTORY_LEVELS_TABLE} SET qty = ? WHERE id = ?`, [
            newStock,
            line.product.inventory_level_id
          ]);
        }

        if (!asUtang) {
          for (const tender of tenders) {
            if (tender.amountCents <= 0) continue;
            await tx.execute(
              `INSERT INTO ${SALE_PAYMENTS_TABLE} (id, sale_id, method, amount_cents, tendered_cents, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                crypto.randomUUID(),
                saleId,
                tender.method,
                tender.amountCents,
                tender.tenderedCents ?? null,
                now
              ]
            );
          }
        }
      });

      setMessage(
        asUtang
          ? `Saved as utang — ${formatMoney(total)}`
          : `Saved (${paymentMethodLabel(saleMethod)}) — ${formatMoney(total)}`
      );
      setCartQty({});
      setDraftQtyInput({});
      setDiscountInput('');
      setCustomerId('');
      setNewCustomerName('');
      setOrderSheetOpen(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save this sale');
    } finally {
      setBusy(false);
    }
  }

  async function confirmUtang() {
    setShowUtangConfirm(false);
    await placeOrder([], { asUtang: true });
  }

  function openUtang() {
    if (cartLines.length === 0) {
      setMessage('Add products first');
      return;
    }
    if (!customerId && !newCustomerName.trim()) {
      setMessage('Pick or type the customer name first');
      return;
    }
    if (customerId && customersWithOpenUtang.has(customerId)) {
      setMessage('This customer still has unpaid utang. Collect that first.');
      return;
    }
    setMessage(null);
    setShowUtangConfirm(true);
  }

  function openCashModal() {
    if (cartLines.length === 0) {
      setMessage('Add products first');
      return;
    }
    setMessage(null);
    setShowCashModal(true);
  }

  function openPaymentConfirm(method: Exclude<PaymentMethod, 'cash'>) {
    if (cartLines.length === 0) {
      setMessage('Add products first');
      return;
    }
    setMessage(null);
    setPendingMethod(method);
  }

  function openSplitModal() {
    if (cartLines.length === 0) {
      setMessage('Add products first');
      return;
    }
    setMessage(null);
    setShowSplitModal(true);
  }

  async function confirmCashPayment(tenderedCents: number) {
    setShowCashModal(false);
    await placeOrder([{ method: 'cash', amountCents: totalCents, tenderedCents }]);
  }

  async function confirmPendingPayment() {
    if (!pendingMethod) return;
    const method = pendingMethod;
    setPendingMethod(null);
    await placeOrder([{ method, amountCents: totalCents }]);
  }

  async function confirmSplitPayment(tenders: Tender[]) {
    setShowSplitModal(false);
    await placeOrder(tenders);
  }

  function renderPieceQty(product: CatalogProduct, qty: number, compact = false) {
    const stock = Number(product.stock_qty);
    const outOfStock = !Number.isFinite(stock) || stock <= 0;
    const cap = maxQty(product);

    return (
      <div className={`qty-control ${compact ? 'compact' : ''}`}>
        <button
          type="button"
          className="qty-btn"
          aria-label={`Decrease ${product.name}`}
          disabled={qty <= 0}
          onClick={() => setQty(product, qty - 1)}
        >
          −
        </button>
        <label className="qty-input-wrap">
          <span className="sr-only">Quantity for {product.name}</span>
          <input
            className="qty-input"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            placeholder="0"
            value={qtyInputValue(product, qty)}
            disabled={outOfStock && qty <= 0}
            onChange={(e) =>
              setDraftQtyInput((prev) => ({ ...prev, [product.id]: e.target.value }))
            }
            onBlur={() => commitQtyInput(product)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
          />
        </label>
        <button
          type="button"
          className="qty-btn"
          aria-label={`Increase ${product.name}`}
          disabled={outOfStock || qty >= cap}
          onClick={() => setQty(product, qty + 1)}
        >
          +
        </button>
      </div>
    );
  }

  function renderRiceQty(product: CatalogProduct, qty: number, compact = false) {
    const stock = Number(product.stock_qty);
    const outOfStock = !Number.isFinite(stock) || stock <= 0;
    const cap = maxQty(product);
    const kgPerSack = Number(product.kg_per_sack);
    const hasSack = Number.isFinite(kgPerSack) && kgPerSack > 0;

    return (
      <div className={`rice-qty ${compact ? 'compact' : ''}`}>
        <div className="rice-presets" role="group" aria-label={`${product.name} quick amounts`}>
          <button
            type="button"
            className="rice-preset"
            disabled={outOfStock || qty + 0.25 > cap + 1e-9}
            onClick={() => setQty(product, qty + 0.25)}
          >
            ¼
          </button>
          <button
            type="button"
            className="rice-preset"
            disabled={outOfStock || qty + 0.5 > cap + 1e-9}
            onClick={() => setQty(product, qty + 0.5)}
          >
            ½
          </button>
          <button
            type="button"
            className="rice-preset"
            disabled={outOfStock || qty + 1 > cap + 1e-9}
            onClick={() => setQty(product, qty + 1)}
          >
            1
          </button>
          {hasSack && (
            <button
              type="button"
              className="rice-preset"
              disabled={outOfStock || qty + kgPerSack > cap + 1e-9}
              onClick={() => setQty(product, qty + kgPerSack)}
              title={`Add ${formatKg(kgPerSack)} kg`}
            >
              Sack
            </button>
          )}
        </div>
        <div className={`qty-control ${compact ? 'compact' : ''}`}>
          <button
            type="button"
            className="qty-btn"
            aria-label={`Decrease ${product.name} by ${RICE_STEP} kg`}
            disabled={qty <= 0}
            onClick={() => setQty(product, qty - RICE_STEP)}
          >
            −
          </button>
          <label className="qty-input-wrap">
            <span className="sr-only">Kilograms for {product.name}</span>
            <input
              className="qty-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.001"
              placeholder="0"
              value={qtyInputValue(product, qty)}
              disabled={outOfStock && qty <= 0}
              onChange={(e) =>
                setDraftQtyInput((prev) => ({ ...prev, [product.id]: e.target.value }))
              }
              onBlur={() => commitQtyInput(product)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
            />
            <span className="qty-unit" aria-hidden="true">
              kg
            </span>
          </label>
          <button
            type="button"
            className="qty-btn"
            aria-label={`Increase ${product.name} by ${RICE_STEP} kg`}
            disabled={outOfStock || qty + RICE_STEP > cap + 1e-9}
            onClick={() => setQty(product, qty + RICE_STEP)}
          >
            +
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cashier">
      <section className="cashier-catalog" aria-label="Products">
        <div className="cashier-catalog-toolbar">
          <label className="cashier-search">
            <span className="sr-only">Search products</span>
            <input
              type="search"
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <StatusBanner
            message={message}
            variant={message?.startsWith('Saved') ? 'success' : 'error'}
            onDismiss={() => setMessage(null)}
          />
        </div>

        <div className="product-grid">
          {filtered.map((product) => {
            const qty = cartQty[product.id] ?? 0;
            const stock = Number(product.stock_qty);
            const outOfStock = !Number.isFinite(stock) || stock <= 0;
            const rice = productIsRice(product);
            const unitLabel = rice ? 'kg' : product.unit;

            return (
              <article
                key={product.id}
                className={`product-tile ${qty > 0 ? 'in-cart' : ''} ${rice ? 'rice' : ''}`}
                style={
                  {
                    '--product-color': productColorHex(product.color),
                    '--product-tint': productColorTint(product.color) ?? 'var(--surface)'
                  } as CSSProperties
                }
              >
                <div className="product-tile-image" aria-hidden="true">
                  <span>{(product.name ?? '?').slice(0, 1).toUpperCase()}</span>
                </div>
                <div className="product-tile-body">
                  <h2 className="product-tile-name">{product.name}</h2>
                  <p className="product-tile-price">
                    {formatMoney(product.price_cents ?? 0)}
                    {rice ? <span className="product-tile-per"> / kg</span> : null}
                  </p>
                  <p className="product-tile-stock muted">
                    {outOfStock ? 'Out of stock' : `${stock.toLocaleString()} ${unitLabel}`}
                  </p>
                </div>
                {rice ? renderRiceQty(product, qty) : renderPieceQty(product, qty)}
              </article>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="cashier-empty">
            {productsLoading || !status.hasSynced ? (
              <p className="muted">Loading products…</p>
            ) : products.length === 0 ? (
              <p className="muted">No products yet. Ask someone to add them on Stock.</p>
            ) : (
              <p className="muted">No products match your search.</p>
            )}
          </div>
        )}
      </section>

      <aside
        className={`cashier-order ${orderSheetOpen ? 'sheet-open' : ''}`}
        aria-label="Current sale"
      >
        <header className="cashier-order-header">
          <h2>This sale</h2>
          <span className="muted">
            {storeName ? `${storeName} · ` : ''}
            {itemCount === 0
              ? 'No items yet'
              : `${formatKg(itemCount)} item${itemCount === 1 ? '' : 's'}`}
          </span>
          <button
            type="button"
            className="cashier-order-close mobile-only"
            onClick={() => setOrderSheetOpen(false)}
          >
            Close
          </button>
        </header>

        <div className="cashier-order-list">
          {cartLines.length === 0 ? (
            <p className="cashier-order-empty muted">Tap products on the left to add them here.</p>
          ) : (
            <ul>
              {cartLines.map(({ product, qty }) => {
                const lineTotal = Math.round(qty * (product.price_cents ?? 0));
                const rice = productIsRice(product);
                return (
                  <li key={product.id} className="order-line">
                    <div className="order-line-top">
                      <div className="order-line-main">
                        <span className="order-line-name">{product.name}</span>
                        <span className="order-line-meta muted">
                          {rice ? `${formatKg(qty)} kg` : qty} × {formatMoney(product.price_cents ?? 0)}
                          {rice ? '/kg' : ''}
                        </span>
                      </div>
                      <span className="order-line-total">{formatMoney(lineTotal)}</span>
                    </div>
                    {rice
                      ? renderRiceQty(product, qty, true)
                      : renderPieceQty(product, qty, true)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="cashier-order-footer">
          <label className="cashier-discount">
            <span>Discount (₱ off)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={discountInput}
              disabled={busy || cartLines.length === 0}
              onChange={(e) => setDiscountInput(e.target.value)}
            />
          </label>
          {discountCents > 0 && (
            <div className="cashier-subtotal muted">
              <span>Before discount {formatMoney(subtotalCents)}</span>
              <span>−{formatMoney(discountCents)}</span>
            </div>
          )}
          <div className="cashier-total">
            <span>Total to pay</span>
            <strong>{formatMoney(totalCents)}</strong>
          </div>

          <label className="cashier-customer">
            <span>Customer (required for utang)</span>
            <select
              value={customerId}
              disabled={busy}
              onChange={(e) => {
                setCustomerId(e.target.value);
                if (e.target.value) setNewCustomerName('');
              }}
            >
              <option value="">Pick a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {customersWithOpenUtang.has(c.id) ? ' (still owes)' : ''}
                </option>
              ))}
            </select>
          </label>
          {!customerId && (
            <label className="cashier-customer">
              <span>Or type a new name</span>
              <input
                type="text"
                value={newCustomerName}
                disabled={busy}
                placeholder="Customer name"
                onChange={(e) => setNewCustomerName(e.target.value)}
              />
            </label>
          )}

          <p className="cashier-pay-label muted">How did they pay?</p>
          <div className="cashier-pay-actions">
            {enabledMethods.length === 0 && (
              <p className="muted">No payment options turned on for this store.</p>
            )}
            {enabledMethods.includes('cash') && (
              <button
                type="button"
                className="pay-cash"
                disabled={busy || cartLines.length === 0}
                onClick={openCashModal}
              >
                Cash
              </button>
            )}
            {enabledMethods.includes('gcash') && (
              <button
                type="button"
                className="pay-gcash"
                disabled={busy || cartLines.length === 0}
                onClick={() => openPaymentConfirm('gcash')}
              >
                GCash
              </button>
            )}
            {enabledMethods.includes('paymongo_qr') && (
              <button
                type="button"
                className="pay-paymongo"
                disabled={busy || cartLines.length === 0}
                onClick={() => openPaymentConfirm('paymongo_qr')}
              >
                Bank QR
              </button>
            )}
            {enabledMethods.includes('card') && (
              <button
                type="button"
                className="pay-card"
                disabled={busy || cartLines.length === 0}
                onClick={() => openPaymentConfirm('card')}
              >
                Card
              </button>
            )}
            {enabledMethods.length >= 2 && (
              <button
                type="button"
                className="pay-split"
                disabled={busy || cartLines.length === 0}
                onClick={openSplitModal}
              >
                Split
              </button>
            )}
            <button
              type="button"
              className="pay-utang"
              disabled={busy || cartLines.length === 0}
              onClick={openUtang}
            >
              Utang
            </button>
          </div>
        </footer>
      </aside>

      {!orderSheetOpen && (
        <button
          type="button"
          className="cashier-order-bar"
          onClick={() => setOrderSheetOpen(true)}
        >
          <span className="cashier-order-bar-count">
            {itemCount === 0
              ? 'No items yet'
              : `${formatKg(itemCount)} item${itemCount === 1 ? '' : 's'}`}
          </span>
          <span className="cashier-order-bar-total">{formatMoney(totalCents)}</span>
          <span className="cashier-order-bar-cta">View</span>
        </button>
      )}

      {orderSheetOpen && (
        <div
          className="cashier-order-backdrop"
          role="presentation"
          onClick={() => setOrderSheetOpen(false)}
        />
      )}

      {showCashModal && (
        <CashPaymentModal
          totalCents={totalCents}
          busy={busy}
          onCancel={() => setShowCashModal(false)}
          onConfirm={(tenderedCents) => void confirmCashPayment(tenderedCents)}
        />
      )}

      {showSplitModal && (
        <SplitPaymentModal
          methods={enabledMethods}
          totalCents={totalCents}
          busy={busy}
          onCancel={() => setShowSplitModal(false)}
          onConfirm={(tenders) => void confirmSplitPayment(tenders)}
        />
      )}

      {pendingMethod && (
        <PaymentConfirmModal
          method={pendingMethod}
          totalCents={totalCents}
          busy={busy}
          onCancel={() => setPendingMethod(null)}
          onConfirm={() => void confirmPendingPayment()}
        />
      )}

      {showUtangConfirm && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowUtangConfirm(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="utang-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="utang-confirm-title" className="modal-title">
              Save as utang?
            </h2>
            <div className="cash-row">
              <span>Total to pay</span>
              <strong className="cash-amount">{formatMoney(totalCents)}</strong>
            </div>
            <p className="payment-confirm-message">
              {customerId
                ? customers.find((c) => c.id === customerId)?.name ?? 'This customer'
                : newCustomerName.trim() || 'This customer'}{' '}
              will pay later. Each person can only have one unpaid utang at a time.
            </p>
            <div className="cash-actions">
              <button
                type="button"
                className="cash-cancel"
                onClick={() => setShowUtangConfirm(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="cash-confirm"
                disabled={busy}
                autoFocus
                onClick={() => void confirmUtang()}
              >
                Save utang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
