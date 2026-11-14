import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { db } from '../powerSync';
import {
  INVENTORY_LEVELS_TABLE,
  PRODUCTS_TABLE,
  STOCK_RECEIPT_LINES_TABLE,
  STOCK_RECEIPTS_TABLE,
  newInventoryLevelId,
  type ReceiptPaymentStatus
} from '../schema';
import '../CashPaymentModal/CashPaymentModal.css';
import './ReceiveStockModal.css';

function formatMoney(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  inventory_level_id: string | null;
  stock_qty: string | null;
};

export function ReceiveStockModal({
  storeId,
  userId,
  busy,
  initialProductId = '',
  onCancel,
  onSaved
}: {
  storeId: string;
  userId: string;
  busy: boolean;
  /** Prefill product when opened from an inventory row. */
  initialProductId?: string;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [productId, setProductId] = useState(initialProductId);
  const [qtyInput, setQtyInput] = useState('');
  const [costInput, setCostInput] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<ReceiptPaymentStatus>('paid');
  const [dueAt, setDueAt] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: products = [] } = useQuery<ProductOption>(
    storeId
      ? `SELECT p.id, p.name, p.unit, il.id as inventory_level_id, il.qty as stock_qty
         FROM ${PRODUCTS_TABLE} p
         LEFT JOIN ${INVENTORY_LEVELS_TABLE} il
           ON il.product_id = p.id AND il.store_id = ?
         ORDER BY p.name ASC`
      : `SELECT p.id, p.name, p.unit, null as inventory_level_id, null as stock_qty
         FROM ${PRODUCTS_TABLE} p WHERE 1 = 0`,
    storeId ? [storeId] : []
  );

  const selected = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );

  const qty = (() => {
    const n = Number(qtyInput);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const unitCostCents = (() => {
    const n = Number(costInput);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  })();

  const lineTotalCents =
    qty != null && unitCostCents != null ? Math.round(qty * unitCostCents) : null;

  async function confirm() {
    if (!storeId || !userId) {
      setError('Missing store or user');
      return;
    }
    if (!productId || !selected) {
      setError('Choose which product');
      return;
    }
    if (qty == null) {
      setError('Enter how many you got');
      return;
    }
    if (unitCostCents == null || lineTotalCents == null) {
      setError('Enter the price you paid per piece');
      return;
    }
    if (paymentStatus === 'pending' && dueAt.trim() === '') {
      setError('Pick the date you need to pay the supplier');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const receiptId = crypto.randomUUID();
      const lineId = crypto.randomUUID();
      const now = new Date().toISOString();
      const paidAt = paymentStatus === 'paid' ? now : null;
      const dueAtIso =
        paymentStatus === 'pending' && dueAt
          ? new Date(`${dueAt}T12:00:00`).toISOString()
          : null;

      const currentStock = Number(selected.stock_qty ?? 0);
      const baseStock = Number.isFinite(currentStock) ? currentStock : 0;
      const newStock = (baseStock + qty).toFixed(3);

      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO ${STOCK_RECEIPTS_TABLE}
             (id, store_id, payment_status, total_cents, due_at, paid_at, note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            receiptId,
            storeId,
            paymentStatus,
            lineTotalCents,
            dueAtIso,
            paidAt,
            note.trim() || null,
            userId,
            now
          ]
        );
        await tx.execute(
          `INSERT INTO ${STOCK_RECEIPT_LINES_TABLE}
             (id, receipt_id, product_id, qty, unit_cost_cents, line_total_cents)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [lineId, receiptId, productId, qty.toFixed(3), unitCostCents, lineTotalCents]
        );

        if (selected.inventory_level_id) {
          await tx.execute(`UPDATE ${INVENTORY_LEVELS_TABLE} SET qty = ? WHERE id = ?`, [
            newStock,
            selected.inventory_level_id
          ]);
        } else {
          await tx.execute(
            `INSERT INTO ${INVENTORY_LEVELS_TABLE} (id, product_id, store_id, qty)
             VALUES (?, ?, ?, ?)`,
            [newInventoryLevelId(), productId, storeId, newStock]
          );
        }
      });

      onSaved(
        paymentStatus === 'paid'
          ? `Added ${qty} ${selected.unit ?? ''} ${selected.name ?? ''}. Supplier already paid (${formatMoney(lineTotalCents)}).`
          : `Added ${qty} ${selected.unit ?? ''} ${selected.name ?? ''}. Still need to pay supplier (${formatMoney(lineTotalCents)}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add stock');
    } finally {
      setSaving(false);
    }
  }

  const disabled = busy || saving;

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card receive-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receive-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="receive-modal-title" className="modal-title">
          Add stock from supplier
        </h2>

        <label className="cash-field">
          <span>Which product?</span>
          <select
            value={productId}
            disabled={disabled}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Choose…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ?? 'Unnamed'}
              </option>
            ))}
          </select>
        </label>

        <label className="cash-field">
          <span>How many{selected?.unit ? ` (${selected.unit})` : ''}?</span>
          <input
            className="cash-input receive-plain-input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            placeholder="0"
            value={qtyInput}
            disabled={disabled}
            onChange={(e) => setQtyInput(e.target.value)}
          />
        </label>

        <label className="cash-field">
          <span>Price you paid per piece (₱)</span>
          <input
            className="cash-input receive-plain-input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={costInput}
            disabled={disabled}
            onChange={(e) => setCostInput(e.target.value)}
          />
        </label>

        <div className="cash-row">
          <span>Total cost</span>
          <strong className="cash-amount">
            {lineTotalCents != null ? formatMoney(lineTotalCents) : '—'}
          </strong>
        </div>

        <p className="receive-status-label muted">Did you already pay the supplier?</p>
        <div className="receive-status" role="tablist" aria-label="Did you already pay the supplier?">
          <button
            type="button"
            role="tab"
            className="receive-status-tab"
            aria-selected={paymentStatus === 'paid'}
            disabled={disabled}
            onClick={() => setPaymentStatus('paid')}
          >
            Yes, paid
          </button>
          <button
            type="button"
            role="tab"
            className="receive-status-tab"
            aria-selected={paymentStatus === 'pending'}
            disabled={disabled}
            onClick={() => setPaymentStatus('pending')}
          >
            Not yet
          </button>
        </div>

        {paymentStatus === 'pending' && (
          <label className="cash-field">
            <span>Pay by when?</span>
            <input
              className="cash-input receive-plain-input"
              type="date"
              value={dueAt}
              disabled={disabled}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </label>
        )}

        <label className="cash-field">
          <span>Note (optional)</span>
          <input
            className="cash-input receive-plain-input"
            type="text"
            value={note}
            disabled={disabled}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Supplier name or invoice #"
          />
        </label>

        {error && (
          <p className="cash-warn" role="alert">
            {error}
          </p>
        )}

        <div className="cash-actions">
          <button type="button" className="cash-cancel" disabled={disabled} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="cash-confirm"
            disabled={disabled || lineTotalCents == null}
            onClick={() => void confirm()}
          >
            {saving ? 'Saving…' : 'Add stock'}
          </button>
        </div>
      </div>
    </div>
  );
}
