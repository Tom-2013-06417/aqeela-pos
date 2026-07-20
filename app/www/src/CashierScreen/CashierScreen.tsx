import { useMemo, useState } from 'react';
import { useQuery, useStatus } from '@powersync/react';
import type { SupabaseConnector } from '../connector';
import { db } from '../powerSync';
import {
  PRODUCTS_TABLE,
  SALE_LINES_TABLE,
  SALES_TABLE,
  STORE_STAFF_TABLE,
  type ProductRecord
} from '../schema';
import './CashierScreen.css';

function formatMoney(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

type CartLine = {
  product: ProductRecord;
  qty: number;
};

export function CashierScreen({ connector }: { connector: SupabaseConnector }) {
  const status = useStatus();
  const [search, setSearch] = useState('');
  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: products = [], isLoading: productsLoading } = useQuery<ProductRecord>(
    `SELECT * FROM ${PRODUCTS_TABLE} ORDER BY name ASC`
  );

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

  function setQty(product: ProductRecord, next: number) {
    const stock = Number(product.stock_qty);
    const capped = Math.max(0, Math.min(next, Number.isFinite(stock) ? Math.floor(stock) : next));
    setCartQty((prev) => {
      if (capped <= 0) {
        const { [product.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [product.id]: capped };
    });
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
        setMessage(`Not enough stock for ${line.product.name} (have ${stock} ${line.product.unit})`);
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
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sale failed');
    } finally {
      setBusy(false);
    }
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

            return (
              <article key={product.id} className={`product-tile ${qty > 0 ? 'in-cart' : ''}`}>
                <div className="product-tile-image" aria-hidden="true">
                  <span>{(product.name ?? '?').slice(0, 1).toUpperCase()}</span>
                </div>
                <div className="product-tile-body">
                  <h2 className="product-tile-name">{product.name}</h2>
                  <p className="product-tile-price">{formatMoney(product.price_cents ?? 0)}</p>
                  <p className="product-tile-stock muted">
                    {outOfStock ? 'Out of stock' : `${stock.toLocaleString()} ${product.unit}`}
                  </p>
                </div>
                <div className="qty-control">
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
                    disabled={outOfStock || qty >= Math.floor(stock)}
                    onClick={() => setQty(product, qty + 1)}
                  >
                    +
                  </button>
                </div>
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
          <span className="muted">{itemCount === 0 ? 'Empty' : `${itemCount} item${itemCount === 1 ? '' : 's'}`}</span>
        </header>

        <div className="cashier-order-list">
          {cartLines.length === 0 ? (
            <p className="cashier-order-empty muted">Tap + on a product to add it.</p>
          ) : (
            <ul>
              {cartLines.map(({ product, qty }) => {
                const lineTotal = Math.round(qty * (product.price_cents ?? 0));
                return (
                  <li key={product.id} className="order-line">
                    <div className="order-line-main">
                      <span className="order-line-name">{product.name}</span>
                      <span className="order-line-meta muted">
                        {qty} × {formatMoney(product.price_cents ?? 0)}
                      </span>
                    </div>
                    <div className="order-line-aside">
                      <span className="order-line-total">{formatMoney(lineTotal)}</span>
                      <div className="qty-control compact">
                        <button
                          type="button"
                          className="qty-btn"
                          aria-label={`Decrease ${product.name}`}
                          onClick={() => setQty(product, qty - 1)}
                        >
                          −
                        </button>
                        <span className="qty-value">{qty}</span>
                        <button
                          type="button"
                          className="qty-btn"
                          aria-label={`Increase ${product.name}`}
                          disabled={qty >= Math.floor(Number(product.stock_qty))}
                          onClick={() => setQty(product, qty + 1)}
                        >
                          +
                        </button>
                      </div>
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
            <button type="button" className="pay-cash" disabled={busy || cartLines.length === 0} onClick={() => void placeOrder('cash')}>
              Cash
            </button>
            <button type="button" className="pay-gcash" disabled={busy || cartLines.length === 0} onClick={() => void placeOrder('gcash')}>
              GCash
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
