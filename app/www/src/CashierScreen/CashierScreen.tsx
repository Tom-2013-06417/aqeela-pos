import { useMemo, useState, type CSSProperties } from 'react';
import { useQuery, useStatus } from '@powersync/react';
import { CashPaymentModal } from '../CashPaymentModal/CashPaymentModal';
import type { SupabaseConnector } from '../connector';
import { db } from '../powerSync';
import { productColorHex, productColorTint } from '../productColors';
import {
  CATEGORIES_TABLE,
  PRODUCTS_TABLE,
  SALE_LINES_TABLE,
  SALES_TABLE,
  STORE_STAFF_TABLE,
  isRiceCategory,
  type CategoryRecord,
  type ProductRecord
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

type CartLine = {
  product: ProductRecord;
  qty: number;
};

export function CashierScreen({ connector }: { connector: SupabaseConnector }) {
  const status = useStatus();
  const [search, setSearch] = useState('');
  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const [draftQtyInput, setDraftQtyInput] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);

  const { data: products = [], isLoading: productsLoading } = useQuery<ProductRecord>(
    `SELECT * FROM ${PRODUCTS_TABLE} ORDER BY name ASC`
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
    const map = new Map<string, ProductRecord>();
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
  const totalCents = cartLines.reduce(
    (sum, line) => sum + Math.round(line.qty * (line.product.price_cents ?? 0)),
    0
  );

  function productIsRice(product: ProductRecord) {
    if (!product.category_id) return false;
    return isRiceCategory(categoriesById.get(product.category_id));
  }

  function maxQty(product: ProductRecord) {
    const stock = Number(product.stock_qty);
    if (!Number.isFinite(stock) || stock < 0) return 0;
    return productIsRice(product) ? stock : Math.floor(stock);
  }

  function setQty(product: ProductRecord, next: number) {
    const stockCap = maxQty(product);
    const capped = Math.max(0, Math.min(roundQty(next), stockCap));
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

  function qtyInputValue(product: ProductRecord, qty: number) {
    if (Object.prototype.hasOwnProperty.call(draftQtyInput, product.id)) {
      return draftQtyInput[product.id];
    }
    return qty > 0 ? formatKg(qty) : '';
  }

  function commitQtyInput(product: ProductRecord) {
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

  async function placeOrder(paymentMethod: 'cash' | 'gcash') {
    if (cartLines.length === 0) {
      setMessage('Add items to the order first');
      return;
    }

    const session = connector.currentSession;
    if (!session?.user?.id) {
      setMessage('Not signed in');
      return;
    }

    for (const line of cartLines) {
      const stock = Number(line.product.stock_qty);
      if (line.qty > stock) {
        const unit = productIsRice(line.product) ? 'kg' : line.product.unit;
        setMessage(`Not enough stock for ${line.product.name} (have ${stock} ${unit})`);
        return;
      }
    }

    setBusy(true);
    setMessage(null);

    try {
      const staffRows = await db.getAll<{ store_id: string }>(
        `SELECT store_id FROM ${STORE_STAFF_TABLE} WHERE user_id = ? LIMIT 1`,
        [session.user.id]
      );
      const storeId = staffRows[0]?.store_id;
      if (!storeId) {
        throw new Error('No store assignment found for this user. Run store_staff insert in Supabase.');
      }

      const saleId = crypto.randomUUID();
      const now = new Date().toISOString();
      const total = cartLines.reduce(
        (sum, line) => sum + Math.round(line.qty * (line.product.price_cents ?? 0)),
        0
      );

      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO ${SALES_TABLE} (id, store_id, cashier_id, total_cents, payment_method, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, storeId, session.user.id, total, paymentMethod, now]
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
          await tx.execute(
            `UPDATE ${PRODUCTS_TABLE} SET stock_qty = ?, updated_at = ? WHERE id = ?`,
            [newStock, now, line.product.id]
          );
        }
      });

      setMessage(`Order placed (${paymentMethod}) — ${formatMoney(total)}`);
      setCartQty({});
      setDraftQtyInput({});
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sale failed');
    } finally {
      setBusy(false);
    }
  }

  function openCashModal() {
    if (cartLines.length === 0) {
      setMessage('Add items to the order first');
      return;
    }
    setMessage(null);
    setShowCashModal(true);
  }

  async function confirmCashPayment() {
    setShowCashModal(false);
    await placeOrder('cash');
  }

  function renderPieceQty(product: ProductRecord, qty: number, compact = false) {
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
        <span className="qty-value" aria-live="polite">
          {qty}
        </span>
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

  function renderRiceQty(product: ProductRecord, qty: number, compact = false) {
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
          {message && (
            <p className={`cashier-toast ${message.startsWith('Order') ? 'success' : 'error'}`} role="status">
              {message}
            </p>
          )}
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
              <p className="muted">No products synced yet.</p>
            ) : (
              <p className="muted">No products match your search.</p>
            )}
          </div>
        )}
      </section>

      <aside className="cashier-order" aria-label="Current order">
        <header className="cashier-order-header">
          <h2>Order</h2>
          <span className="muted">{itemCount === 0 ? 'Empty' : `${formatKg(itemCount)} item${itemCount === 1 ? '' : 's'}`}</span>
        </header>

        <div className="cashier-order-list">
          {cartLines.length === 0 ? (
            <p className="cashier-order-empty muted">Tap + on a product to add it.</p>
          ) : (
            <ul>
              {cartLines.map(({ product, qty }) => {
                const lineTotal = Math.round(qty * (product.price_cents ?? 0));
                const rice = productIsRice(product);
                return (
                  <li key={product.id} className="order-line">
                    <div className="order-line-main">
                      <span className="order-line-name">{product.name}</span>
                      <span className="order-line-meta muted">
                        {rice ? `${formatKg(qty)} kg` : qty} × {formatMoney(product.price_cents ?? 0)}
                        {rice ? '/kg' : ''}
                      </span>
                      {rice && renderRiceQty(product, qty, true)}
                    </div>
                    <div className="order-line-aside">
                      <span className="order-line-total">{formatMoney(lineTotal)}</span>
                      {!rice && renderPieceQty(product, qty, true)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="cashier-order-footer">
          <div className="cashier-total">
            <span>Total</span>
            <strong>{formatMoney(totalCents)}</strong>
          </div>
          <div className="cashier-pay-actions">
            <button type="button" className="pay-cash" disabled={busy || cartLines.length === 0} onClick={openCashModal}>
              Cash
            </button>
            <button type="button" className="pay-gcash" disabled={busy || cartLines.length === 0} onClick={() => void placeOrder('gcash')}>
              GCash
            </button>
          </div>
        </footer>
      </aside>

      {showCashModal && (
        <CashPaymentModal
          totalCents={totalCents}
          busy={busy}
          onCancel={() => setShowCashModal(false)}
          onConfirm={() => void confirmCashPayment()}
        />
      )}
    </div>
  );
}
