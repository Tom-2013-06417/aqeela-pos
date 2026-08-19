import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import {
  PRODUCTS_TABLE,
  SALES_TABLE,
  SALE_LINES_TABLE,
  STORES_TABLE,
  paymentMethodLabel
} from '../schema';
import { db } from '../powerSync';
import '../styles/panel-view.css';
import './SalesScreen.css';

function formatMoney(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function formatQty(qty: string) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return qty;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

export function SalesScreen({ isAdmin }: { isAdmin: boolean }) {
  const [expandedSaleIds, setExpandedSaleIds] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { data: sales = [], isLoading } = useQuery<{
    id: string;
    store_id: string;
    store_name: string | null;
    total_cents: number;
    payment_method: string;
    created_at: string;
  }>(
    `SELECT s.id, s.store_id, st.name as store_name, s.total_cents, s.payment_method, s.created_at
     FROM ${SALES_TABLE} s
     LEFT JOIN ${STORES_TABLE} st ON st.id = s.store_id
     ORDER BY s.created_at DESC
     LIMIT 50`
  );

  const { data: saleLines = [] } = useQuery<{
    sale_id: string;
    product_name: string | null;
    qty: string;
    line_total_cents: number | null;
  }>(
    `SELECT sl.sale_id, p.name as product_name, sl.qty, sl.line_total_cents
     FROM ${SALE_LINES_TABLE} sl
     LEFT JOIN ${PRODUCTS_TABLE} p ON p.id = sl.product_id`
  );

  const linesBySaleId = useMemo(() => {
    const map = new Map<string, { product_name: string | null; qty: string; line_total_cents: number | null }[]>();
    for (const line of saleLines) {
      const existing = map.get(line.sale_id);
      if (existing) {
        existing.push(line);
      } else {
        map.set(line.sale_id, [line]);
      }
    }
    return map;
  }, [saleLines]);

  function toggleSaleExpanded(saleId: string) {
    setExpandedSaleIds((prev) => ({
      ...prev,
      [saleId]: !prev[saleId]
    }));
  }

  async function deleteSale(saleId: string) {
    if (!window.confirm('Delete this sale and all its line items?')) return;
    setBusy(true);
    setMessage(null);
    try {
      await db.writeTransaction(async (tx) => {
        await tx.execute(`DELETE FROM ${SALE_LINES_TABLE} WHERE sale_id = ?`, [saleId]);
        await tx.execute(`DELETE FROM ${SALES_TABLE} WHERE id = ?`, [saleId]);
      });
      setExpandedSaleIds((prev) => {
        const next = { ...prev };
        delete next[saleId];
        return next;
      });
      setMessage('Sale deleted.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete sale.');
    } finally {
      setBusy(false);
    }
  }

  async function clearAllSales() {
    if (!window.confirm('Clear all sales history on this device? This cannot be undone.')) return;
    setBusy(true);
    setMessage(null);
    try {
      await db.writeTransaction(async (tx) => {
        await tx.execute(`DELETE FROM ${SALE_LINES_TABLE}`);
        await tx.execute(`DELETE FROM ${SALES_TABLE}`);
      });
      setExpandedSaleIds({});
      setMessage('All sales history cleared.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to clear sales history.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-view">
      <header className="panel-view-header">
        <h1>Sales</h1>
        <p className="muted">Recent orders on this device</p>
      </header>

      <div className="panel-view-body">
        {message && <p className={`sales-toast ${message.includes('Failed') ? 'error' : 'success'}`}>{message}</p>}
        {isAdmin && (
          <div className="sales-admin-actions">
            <button type="button" className="sales-danger-btn" disabled={busy || sales.length === 0} onClick={() => void clearAllSales()}>
              Clear all sales
            </button>
          </div>
        )}
        {isLoading && <p className="muted">Loading…</p>}
        {!isLoading && sales.length === 0 && <p className="muted">No sales yet.</p>}
        <ul className="sales-list">
          {sales.map((sale) => {
            const isExpanded = expandedSaleIds[sale.id] === true;
            const lines = linesBySaleId.get(sale.id) ?? [];
            return (
              <li key={sale.id} className="sales-item">
                <div className="sales-row">
                  <button
                    type="button"
                    className="sales-expand"
                    aria-expanded={isExpanded}
                    onClick={() => toggleSaleExpanded(sale.id)}
                  >
                    <span>{formatMoney(sale.total_cents)}</span>
                    <span className="muted">{paymentMethodLabel(sale.payment_method)}</span>
                    {isAdmin && <span className="muted">{sale.store_name ?? 'Unknown branch'}</span>}
                    <span className="muted">{new Date(sale.created_at).toLocaleString()}</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className="sales-row-delete"
                      disabled={busy}
                      onClick={() => void deleteSale(sale.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="sales-lines">
                    {lines.length === 0 ? (
                      <p className="muted">No line items found for this order.</p>
                    ) : (
                      <ul>
                        {lines.map((line, index) => (
                          <li key={`${sale.id}:${line.product_name ?? 'unknown'}:${index}`}>
                            <span>
                              {line.product_name ?? 'Unknown item'} x {formatQty(line.qty)}
                            </span>
                            <span>{formatMoney(line.line_total_cents ?? 0)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
