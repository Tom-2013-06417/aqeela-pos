import { useState } from 'react';
import { db } from '../powerSync';
import {
  INVENTORY_LEVELS_TABLE,
  STOCK_ADJUSTMENTS_TABLE,
  newInventoryLevelId,
  newStockAdjustmentId
} from '../schema';
import '../CashPaymentModal/CashPaymentModal.css';
import './CorrectCountModal.css';

export function CorrectCountModal({
  productId,
  productName,
  storeId,
  storeName,
  unit,
  inventoryLevelId,
  currentQty,
  userId,
  busy,
  onCancel,
  onSaved
}: {
  productId: string;
  productName: string;
  storeId: string;
  storeName: string;
  unit: string;
  inventoryLevelId: string | null;
  currentQty: number;
  userId: string;
  busy: boolean;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [countInput, setCountInput] = useState(
    Number.isFinite(currentQty) ? String(currentQty) : ''
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextQty = (() => {
    const trimmed = countInput.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  })();

  async function confirm() {
    if (nextQty == null) {
      setError('Enter the real count on the shelf');
      return;
    }
    if (nextQty === currentQty && inventoryLevelId) {
      setError('Count is the same as what’s already saved');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const delta = nextQty - (Number.isFinite(currentQty) ? currentQty : 0);
      const qtyStr = nextQty.toFixed(3);
      const noteText =
        note.trim() ||
        (inventoryLevelId == null ? 'Opening count' : 'Shelf count fix');

      await db.writeTransaction(async (tx) => {
        if (inventoryLevelId) {
          await tx.execute(`UPDATE ${INVENTORY_LEVELS_TABLE} SET qty = ? WHERE id = ?`, [
            qtyStr,
            inventoryLevelId
          ]);
        } else {
          await tx.execute(
            `INSERT INTO ${INVENTORY_LEVELS_TABLE} (id, product_id, store_id, qty)
             VALUES (?, ?, ?, ?)`,
            [newInventoryLevelId(), productId, storeId, qtyStr]
          );
        }

        if (delta !== 0) {
          await tx.execute(
            `INSERT INTO ${STOCK_ADJUSTMENTS_TABLE}
               (id, product_id, store_id, qty_delta, reason, note, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newStockAdjustmentId(),
              productId,
              storeId,
              delta.toFixed(3),
              'correction',
              noteText,
              userId || null,
              now
            ]
          );
        }
      });

      onSaved(
        `Count updated for ${productName} at ${storeName}: ${qtyStr.replace(/\.?0+$/, '')} ${unit}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save count');
    } finally {
      setSaving(false);
    }
  }

  const disabled = busy || saving;

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card correct-count-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="correct-count-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="correct-count-title" className="modal-title">
          Fix shelf count
        </h2>
        <p className="muted correct-count-hint">
          Use this when the number on the shelf is wrong. For new stock from a supplier, use{' '}
          <strong>Add stock</strong> instead.
        </p>
        <p className="correct-count-product">
          <strong>{productName}</strong>
          <span className="muted"> · {storeName}</span>
        </p>

        <div className="cash-row">
          <span>What the app has now</span>
          <strong className="cash-amount">
            {Number.isFinite(currentQty) ? currentQty : '—'} {unit}
          </strong>
        </div>

        <label className="cash-field">
          <span>Real count now ({unit})</span>
          <input
            className="cash-input receive-plain-input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            autoFocus
            value={countInput}
            disabled={disabled}
            onChange={(e) => setCountInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void confirm();
            }}
          />
        </label>

        <label className="cash-field">
          <span>Why? (optional)</span>
          <input
            className="cash-input receive-plain-input"
            type="text"
            value={note}
            disabled={disabled}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Recount, found extra, etc."
          />
        </label>

        {error && (
          <p className="cash-warn" role="alert">
            {error}
          </p>
        )}

        <div className="cash-actions">
          <button type="button" className="cash-cancel" disabled={disabled} onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className="cash-confirm"
            disabled={disabled || nextQty == null}
            onClick={() => void confirm()}
          >
            {saving ? 'Saving…' : 'Save count'}
          </button>
        </div>
      </div>
    </div>
  );
}
