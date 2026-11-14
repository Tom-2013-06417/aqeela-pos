import { useState } from 'react';
import './CashPaymentModal.css';

function formatMoney(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export function CashPaymentModal({
  totalCents,
  busy,
  onCancel,
  onConfirm
}: {
  totalCents: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (tenderedCents: number) => void;
}) {
  const [cashInput, setCashInput] = useState('');

  const tenderedCents = (() => {
    const trimmed = cashInput.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  })();

  const cashSufficient = tenderedCents !== null && tenderedCents >= totalCents;
  const changeCents = tenderedCents !== null ? Math.max(0, tenderedCents - totalCents) : 0;

  function confirm() {
    if (!cashSufficient || busy) return;
    onConfirm(tenderedCents);
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cash-modal-title" className="modal-title">
          Cash payment
        </h2>

        <div className="cash-row">
          <span>Total to pay</span>
          <strong className="cash-amount">{formatMoney(totalCents)}</strong>
        </div>

        <label className="cash-field">
          <span>Cash received</span>
          <div className="cash-input-wrap">
            <span className="cash-input-currency" aria-hidden="true">
              ₱
            </span>
            <input
              className="cash-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              autoFocus
              value={cashInput}
              onChange={(e) => setCashInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  confirm();
                }
              }}
            />
          </div>
        </label>

        <div className="cash-row cash-change">
          <span>Change</span>
          <strong className="cash-amount">
            {cashSufficient ? formatMoney(changeCents) : '—'}
          </strong>
        </div>

        {tenderedCents !== null && !cashSufficient && (
          <p className="cash-warn" role="alert">
            Need at least {formatMoney(totalCents)} in cash.
          </p>
        )}

        <div className="cash-actions">
          <button type="button" className="cash-cancel" onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className="cash-confirm"
            disabled={!cashSufficient || busy}
            onClick={confirm}
          >
            Save sale
          </button>
        </div>
      </div>
    </div>
  );
}
