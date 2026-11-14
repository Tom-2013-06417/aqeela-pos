import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@powersync/react';
import { db } from '../powerSync';
import { StatusBanner } from '../StatusBanner/StatusBanner';
import {
  CUSTOMERS_TABLE,
  SALE_PAYMENTS_TABLE,
  SALES_TABLE,
  STOCK_RECEIPTS_TABLE,
  STORES_TABLE,
  paymentMethodLabel,
  paymentStatusLabel,
  type PaymentMethod
} from '../schema';
import '../styles/panel-view.css';
import './LedgerScreen.css';

function formatMoney(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

type ReceiptRow = {
  id: string;
  store_id: string;
  store_name: string | null;
  payment_status: string;
  total_cents: number;
  due_at: string | null;
  paid_at: string | null;
  note: string | null;
  created_at: string;
};

type PendingSaleRow = {
  id: string;
  store_id: string;
  store_name: string | null;
  total_cents: number;
  discount_cents: number | null;
  customer_id: string | null;
  customer_name: string | null;
  created_at: string;
};

const SETTLE_METHODS: PaymentMethod[] = ['cash', 'gcash', 'paymongo_qr', 'card'];

export function LedgerScreen() {
  const viewRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [storeFilter, setStoreFilter] = useState('');
  const [settleSaleId, setSettleSaleId] = useState<string | null>(null);
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('cash');

  const { data: stores = [] } = useQuery<{ id: string; name: string | null }>(
    `SELECT id, name FROM ${STORES_TABLE} ORDER BY name ASC`
  );

  const receiptSql = storeFilter
    ? `SELECT r.id, r.store_id, st.name as store_name, r.payment_status, r.total_cents,
              r.due_at, r.paid_at, r.note, r.created_at
       FROM ${STOCK_RECEIPTS_TABLE} r
       LEFT JOIN ${STORES_TABLE} st ON st.id = r.store_id
       WHERE r.store_id = ?
       ORDER BY r.created_at DESC
       LIMIT 100`
    : `SELECT r.id, r.store_id, st.name as store_name, r.payment_status, r.total_cents,
              r.due_at, r.paid_at, r.note, r.created_at
       FROM ${STOCK_RECEIPTS_TABLE} r
       LEFT JOIN ${STORES_TABLE} st ON st.id = r.store_id
       ORDER BY r.created_at DESC
       LIMIT 100`;

  const { data: receipts = [] } = useQuery<ReceiptRow>(
    receiptSql,
    storeFilter ? [storeFilter] : []
  );

  const pendingSalesSql = storeFilter
    ? `SELECT s.id, s.store_id, st.name as store_name, s.total_cents, s.discount_cents,
              s.customer_id, c.name as customer_name, s.created_at
       FROM ${SALES_TABLE} s
       LEFT JOIN ${STORES_TABLE} st ON st.id = s.store_id
       LEFT JOIN ${CUSTOMERS_TABLE} c ON c.id = s.customer_id
       WHERE s.payment_status = 'pending' AND s.store_id = ?
       ORDER BY s.created_at DESC
       LIMIT 100`
    : `SELECT s.id, s.store_id, st.name as store_name, s.total_cents, s.discount_cents,
              s.customer_id, c.name as customer_name, s.created_at
       FROM ${SALES_TABLE} s
       LEFT JOIN ${STORES_TABLE} st ON st.id = s.store_id
       LEFT JOIN ${CUSTOMERS_TABLE} c ON c.id = s.customer_id
       WHERE s.payment_status = 'pending'
       ORDER BY s.created_at DESC
       LIMIT 100`;

  const { data: pendingSales = [] } = useQuery<PendingSaleRow>(
    pendingSalesSql,
    storeFilter ? [storeFilter] : []
  );

  const pendingReceipts = useMemo(
    () => receipts.filter((r) => r.payment_status === 'pending'),
    [receipts]
  );

  async function markReceiptPaid(receipt: ReceiptRow) {
    if (!window.confirm(`Mark ${formatMoney(receipt.total_cents)} as already paid to the supplier?`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE ${STOCK_RECEIPTS_TABLE}
         SET payment_status = 'paid', paid_at = ?
         WHERE id = ?`,
        [now, receipt.id]
      );
      setMessage(`Saved: supplier paid — ${formatMoney(receipt.total_cents)}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function collectSale(sale: PendingSaleRow) {
    setBusy(true);
    setMessage(null);
    try {
      const now = new Date().toISOString();
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO ${SALE_PAYMENTS_TABLE}
             (id, sale_id, method, amount_cents, tendered_cents, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), sale.id, settleMethod, sale.total_cents, null, now]
        );
        await tx.execute(
          `UPDATE ${SALES_TABLE}
           SET payment_status = 'paid', payment_method = ?
           WHERE id = ?`,
          [settleMethod, sale.id]
        );
      });
      setSettleSaleId(null);
      setMessage(
        `Got ${formatMoney(sale.total_cents)} from ${sale.customer_name ?? 'customer'} (${paymentMethodLabel(settleMethod)})`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save payment. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-view" ref={viewRef}>
      <header className="panel-view-header">
        <h1>Balances</h1>
        <p className="muted">Who still owes you, and who you still need to pay.</p>
      </header>

      <div className="panel-view-body">
        <StatusBanner
          message={message}
          variant={message?.toLowerCase().includes('fail') ? 'error' : 'success'}
          onDismiss={() => setMessage(null)}
        />

        {stores.length > 1 && (
          <label className="ledger-filter">
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

        <section className="ledger-section">
          <h2>Customers who still owe</h2>
          {pendingSales.length === 0 ? (
            <p className="muted">Nobody has unpaid utang right now.</p>
          ) : (
            <ul className="ledger-list">
              {pendingSales.map((sale) => (
                <li key={sale.id} className="ledger-item">
                  <div className="ledger-item-main">
                    <strong>{formatMoney(sale.total_cents)}</strong>
                    <span className="muted">
                      {sale.customer_name ?? 'Unnamed customer'}
                      {sale.discount_cents ? ` · −${formatMoney(sale.discount_cents)}` : ''}
                      {stores.length > 1 && !storeFilter
                        ? ` · ${sale.store_name ?? 'Store'}`
                        : ''}
                    </span>
                    <span className="muted ledger-when">{formatWhen(sale.created_at)}</span>
                  </div>
                  {settleSaleId === sale.id ? (
                    <div className="ledger-settle">
                      <select
                        value={settleMethod}
                        disabled={busy}
                        onChange={(e) => setSettleMethod(e.target.value as PaymentMethod)}
                        aria-label="How they paid"
                      >
                        {SETTLE_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {paymentMethodLabel(m)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="ledger-action"
                        disabled={busy}
                        onClick={() => void collectSale(sale)}
                      >
                        Save payment
                      </button>
                      <button
                        type="button"
                        className="ledger-action ledger-action-secondary"
                        disabled={busy}
                        onClick={() => setSettleSaleId(null)}
                      >
                        Back
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ledger-action"
                      disabled={busy}
                      onClick={() => {
                        setSettleMethod('cash');
                        setSettleSaleId(sale.id);
                      }}
                    >
                      They paid
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ledger-section">
          <h2>Stock from suppliers</h2>
          {pendingReceipts.length === 0 && receipts.length === 0 ? (
            <p className="muted">No supplier purchases yet. Add stock from the Stock page.</p>
          ) : (
            <ul className="ledger-list">
              {(pendingReceipts.length > 0 ? pendingReceipts : receipts.slice(0, 20)).map(
                (receipt) => (
                  <li key={receipt.id} className="ledger-item">
                    <div className="ledger-item-main">
                      <strong>{formatMoney(receipt.total_cents)}</strong>
                      <span className="muted">
                        {paymentStatusLabel(receipt.payment_status)}
                        {receipt.note ? ` · ${receipt.note}` : ''}
                        {stores.length > 1 && !storeFilter
                          ? ` · ${receipt.store_name ?? 'Store'}`
                          : ''}
                      </span>
                      <span className="muted ledger-when">
                        {receipt.payment_status === 'pending'
                          ? `Pay by ${formatWhen(receipt.due_at)}`
                          : `Paid on ${formatWhen(receipt.paid_at)}`}
                        {' · '}
                        Added {formatWhen(receipt.created_at)}
                      </span>
                    </div>
                    {receipt.payment_status === 'pending' && (
                      <button
                        type="button"
                        className="ledger-action"
                        disabled={busy}
                        onClick={() => void markReceiptPaid(receipt)}
                      >
                        We paid them
                      </button>
                    )}
                  </li>
                )
              )}
            </ul>
          )}
          {pendingReceipts.length === 0 && receipts.length > 0 && (
            <p className="muted ledger-footnote">Recent purchases — all already paid.</p>
          )}
        </section>
      </div>
    </div>
  );
}
