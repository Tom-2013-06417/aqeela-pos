import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import type { SupabaseConnector } from '../connector';
import { formatDateTime } from '../formatDate';
import {
  PRODUCTS_TABLE,
  STOCK_ADJUSTMENT_REASONS,
  STOCK_ADJUSTMENTS_TABLE,
  STORES_TABLE,
  type StockAdjustmentReason
} from '../schema';
import '../styles/panel-view.css';
import './AdjustmentsScreen.css';

const PAGE_SIZE = 50;

type AdjustmentRow = {
  id: string;
  product_id: string;
  product_name: string | null;
  store_id: string;
  store_name: string | null;
  qty_delta: string;
  reason: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

function formatQty(qty: string) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return qty;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

function reasonLabel(reason: string) {
  if (reason === 'damage') return 'Damage';
  if (reason === 'loss') return 'Loss';
  if (reason === 'correction') return 'Count fix';
  return reason;
}

function shortUserId(id: string | null, selfId: string) {
  if (!id) return '—';
  if (id === selfId) return 'You';
  return `${id.slice(0, 8)}…`;
}

export function AdjustmentsScreen({ connector }: { connector: SupabaseConnector }) {
  const userId = connector.currentSession?.user?.id ?? '';
  const viewRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [storeFilter, setStoreFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');

  const { data: stores = [] } = useQuery<{ id: string; name: string | null }>(
    `SELECT id, name FROM ${STORES_TABLE} ORDER BY name ASC`
  );
  const { data: products = [] } = useQuery<{ id: string; name: string | null }>(
    `SELECT id, name FROM ${PRODUCTS_TABLE} ORDER BY name ASC`
  );

  const filter = useMemo(() => {
    const clauses: string[] = [];
    const params: string[] = [];
    if (storeFilter) {
      clauses.push('a.store_id = ?');
      params.push(storeFilter);
    }
    if (productFilter) {
      clauses.push('a.product_id = ?');
      params.push(productFilter);
    }
    if (reasonFilter) {
      clauses.push('a.reason = ?');
      params.push(reasonFilter);
    }
    return {
      where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params
    };
  }, [storeFilter, productFilter, reasonFilter]);

  const { data: countRows = [] } = useQuery<{ total: number | string }>(
    `SELECT COUNT(*) as total FROM ${STOCK_ADJUSTMENTS_TABLE} a ${filter.where}`,
    filter.params
  );
  const total = Number(countRows[0]?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [storeFilter, productFilter, reasonFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const offset = (page - 1) * PAGE_SIZE;
  const { data: rows = [], isLoading } = useQuery<AdjustmentRow>(
    `SELECT a.id, a.product_id, p.name as product_name, a.store_id, st.name as store_name,
            a.qty_delta, a.reason, a.note, a.created_by, a.created_at
     FROM ${STOCK_ADJUSTMENTS_TABLE} a
     LEFT JOIN ${PRODUCTS_TABLE} p ON p.id = a.product_id
     LEFT JOIN ${STORES_TABLE} st ON st.id = a.store_id
     ${filter.where}
     ORDER BY a.created_at DESC
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    filter.params
  );

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);

  function goToPage(nextPage: number) {
    setPage(nextPage);
    viewRef.current?.scrollTo({ top: 0 });
  }

  return (
    <div className="panel-view" ref={viewRef}>
      <header className="panel-view-header">
        <h1>Stock changes</h1>
        <p className="muted">
          Damage, loss, and count fixes from the Stock page. You can look, not edit.
        </p>
      </header>

      <div className="panel-view-body">
        <div className="adj-toolbar">
          {stores.length > 1 && (
            <label className="adj-filter">
              <span className="sr-only">Filter by store</span>
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                aria-label="Filter by store"
              >
                <option value="">All stores</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name ?? 'Unnamed store'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="adj-filter">
            <span className="sr-only">Filter by product</span>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              aria-label="Filter by product"
            >
              <option value="">All products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name ?? 'Unnamed product'}
                </option>
              ))}
            </select>
          </label>
          <label className="adj-filter adj-filter-reason">
            <span className="sr-only">Filter by reason</span>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              aria-label="Filter by reason"
            >
              <option value="">All reasons</option>
              {STOCK_ADJUSTMENT_REASONS.map((reason: StockAdjustmentReason) => (
                <option key={reason} value={reason}>
                  {reasonLabel(reason)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading && rows.length === 0 && <p className="muted">Loading…</p>}
        {!isLoading && total === 0 && (
          <p className="muted">
            No stock changes yet. On Stock, type a Damage amount and tap Save — or use Fix
            count when the shelf number is wrong.
          </p>
        )}

        {rows.length > 0 && (
          <>
            <div className="adj-table-wrap desktop-only">
              <table className="adj-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Product</th>
                    <th>Store</th>
                    <th>Why</th>
                    <th>Amount</th>
                    <th>Who</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const qty = Number(row.qty_delta);
                    const negative = Number.isFinite(qty) && qty < 0;
                    return (
                      <tr key={row.id}>
                        <td className="adj-when">{formatDateTime(row.created_at)}</td>
                        <td>{row.product_name ?? 'Unknown product'}</td>
                        <td>{row.store_name ?? 'Unknown store'}</td>
                        <td>{reasonLabel(row.reason)}</td>
                        <td className={`adj-qty${negative ? ' negative' : ''}`}>
                          {formatQty(row.qty_delta)}
                        </td>
                        <td className="muted" title={row.created_by ?? undefined}>
                          {shortUserId(row.created_by, userId)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="adj-mobile-list mobile-only">
              {rows.map((row) => {
                const qty = Number(row.qty_delta);
                const negative = Number.isFinite(qty) && qty < 0;
                return (
                  <li key={row.id} className="adj-mobile-item">
                    <div className="adj-mobile-top">
                      <strong>{row.product_name ?? 'Unknown product'}</strong>
                      <span className={`adj-qty${negative ? ' negative' : ''}`}>
                        {formatQty(row.qty_delta)}
                      </span>
                    </div>
                    <div className="adj-mobile-meta muted">
                      <span>{reasonLabel(row.reason)}</span>
                      <span>{row.store_name ?? 'Unknown store'}</span>
                    </div>
                    <div className="adj-mobile-meta muted">
                      <span>{formatDateTime(row.created_at)}</span>
                      <span title={row.created_by ?? undefined}>
                        {shortUserId(row.created_by, userId)}
                      </span>
                    </div>
                    {row.note ? <p className="adj-note muted">{row.note}</p> : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {total > 0 && (
          <nav className="adj-pagination" aria-label="Stock change pages">
            {pages.map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                aria-current={pageNumber === page ? 'page' : undefined}
                onClick={() => goToPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
