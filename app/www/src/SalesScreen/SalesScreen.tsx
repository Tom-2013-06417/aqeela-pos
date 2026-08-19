import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import {
  PRODUCTS_TABLE,
  SALES_TABLE,
  SALE_LINES_TABLE,
  STORES_TABLE,
  paymentMethodLabel
} from '../schema';
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

  return (
    <div className="panel-view">
      <header className="panel-view-header">
        <h1>Sales</h1>
        <p className="muted">Recent orders on this device</p>
      </header>

      <div className="panel-view-body">
        {isLoading && <p className="muted">Loading…</p>}
        {!isLoading && sales.length === 0 && <p className="muted">No sales yet.</p>}
        <ul className="sales-list">
          {sales.map((sale) => {
            const isExpanded = expandedSaleIds[sale.id] === true;
            const lines = linesBySaleId.get(sale.id) ?? [];
            return (
              <li key={sale.id} className="sales-item">
                <button
                  type="button"
                  className="sales-row"
                  aria-expanded={isExpanded}
                  onClick={() => toggleSaleExpanded(sale.id)}
                >
                  <span>{formatMoney(sale.total_cents)}</span>
                  <span className="muted">{paymentMethodLabel(sale.payment_method)}</span>
                  {isAdmin && <span className="muted">{sale.store_name ?? 'Unknown branch'}</span>}
                  <span className="muted">{new Date(sale.created_at).toLocaleString()}</span>
                </button>

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
