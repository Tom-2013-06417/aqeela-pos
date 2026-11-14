import { paymentMethodLabel, type PaymentMethod } from '../schema';
import '../CashPaymentModal/CashPaymentModal.css';
import './PaymentConfirmModal.css';

function formatMoney(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export function PaymentConfirmModal({
  method,
  totalCents,
  busy,
  onCancel,
  onConfirm
}: {
  method: PaymentMethod;
  totalCents: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = `Pay with ${paymentMethodLabel(method)}`;

  function confirm() {
    if (busy) return;
    onConfirm();
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="payment-confirm-title" className="modal-title">
          {title}
        </h2>

        <div className="cash-row">
          <span>Total to pay</span>
          <strong className="cash-amount">{formatMoney(totalCents)}</strong>
        </div>

        <p className="payment-confirm-message">Save this sale as paid?</p>

        <div className="cash-actions">
          <button type="button" className="cash-cancel" onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className="cash-confirm"
            disabled={busy}
            autoFocus
            onClick={confirm}
          >
            Save sale
          </button>
        </div>
      </div>
    </div>
  );
}
