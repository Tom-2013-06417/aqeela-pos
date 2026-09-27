import { useState } from 'react';
import { paymentMethodLabel, type PaymentMethod, type Tender } from '../schema';
import '../CashPaymentModal/CashPaymentModal.css';
import './SplitPaymentModal.css';

function formatMoney(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function parseCents(raw: string) {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function SplitPaymentModal({
  methods,
  totalCents,
  busy,
  onCancel,
  onConfirm
}: {
  methods: PaymentMethod[];
  totalCents: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (tenders: Tender[]) => void;
}) {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [method, setMethod] = useState<PaymentMethod>(
    methods.find((m) => m !== 'cash') ?? methods[0] ?? 'cash'
  );
  const [amountInput, setAmountInput] = useState(centsToInput(totalCents));

  const paidCents = tenders.reduce((sum, tender) => sum + tender.amountCents, 0);
  const remainingCents = Math.max(0, totalCents - paidCents);
  const changeCents = tenders.reduce(
    (sum, tender) => sum + Math.max(0, (tender.tenderedCents ?? tender.amountCents) - tender.amountCents),
    0
  );

  const isCash = method === 'cash';
  const enteredCents = parseCents(amountInput);
  const amountError = (() => {
    if (enteredCents === null) return null;
    if (enteredCents <= 0) return 'Amount must be more than zero.';
    if (!isCash && enteredCents > remainingCents) {
      return `${paymentMethodLabel(method)} can't be more than the remaining ${formatMoney(remainingCents)}.`;
    }
    return null;
  })();
  const canAdd = remainingCents > 0 && enteredCents !== null && amountError === null && !busy;
  const canConfirm = tenders.length > 0 && remainingCents === 0 && !busy;

  function addTender() {
    if (!canAdd || enteredCents === null) return;
    const tender: Tender = isCash
      ? { method, amountCents: Math.min(enteredCents, remainingCents), tenderedCents: enteredCents }
      : { method, amountCents: enteredCents };
    setTenders((prev) => [...prev, tender]);
    setAmountInput(centsToInput(Math.max(0, remainingCents - tender.amountCents)));
  }

  function removeTender(index: number) {
    const removed = tenders[index];
    setTenders((prev) => prev.filter((_, i) => i !== index));
    setAmountInput(centsToInput(remainingCents + removed.amountCents));
  }

  function confirm() {
    if (!canConfirm) return;
    onConfirm(tenders);
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="split-modal-title" className="modal-title">
          Split payment
        </h2>

        <div className="cash-row">
          <span>Total due</span>
          <strong className="cash-amount">{formatMoney(totalCents)}</strong>
        </div>

        {tenders.length > 0 && (
          <ul className="split-tenders">
            {tenders.map((tender, index) => (
              <li key={index}>
                <span className="split-tender-method">
                  {paymentMethodLabel(tender.method)}
                  {tender.tenderedCents !== undefined && tender.tenderedCents !== tender.amountCents && (
                    <span className="muted"> received {formatMoney(tender.tenderedCents)}</span>
                  )}
                </span>
                <span className="split-tender-amount">{formatMoney(tender.amountCents)}</span>
                <button
                  type="button"
                  className="split-tender-remove"
                  aria-label={`Remove ${paymentMethodLabel(tender.method)} payment`}
                  disabled={busy}
                  onClick={() => removeTender(index)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="cash-row">
          <span>Remaining</span>
          <strong className="cash-amount">{formatMoney(remainingCents)}</strong>
        </div>

        {remainingCents > 0 && (
          <div className="split-add">
            <div className="split-methods" role="group" aria-label="Payment method">
              {methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="split-method"
                  aria-pressed={m === method}
                  onClick={() => setMethod(m)}
                >
                  {paymentMethodLabel(m)}
                </button>
              ))}
            </div>

            <label className="cash-field">
              <span>{isCash ? 'Cash received' : `${paymentMethodLabel(method)} amount`}</span>
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
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addTender();
                  }}
                />
              </div>
            </label>

            {amountError && (
              <p className="cash-warn" role="alert">
                {amountError}
              </p>
            )}

            <button type="button" className="split-add-btn" disabled={!canAdd} onClick={addTender}>
              Add {paymentMethodLabel(method)}
            </button>
          </div>
        )}

        {changeCents > 0 && (
          <div className="cash-row cash-change">
            <span>Change</span>
            <strong className="cash-amount">{formatMoney(changeCents)}</strong>
          </div>
        )}

        <div className="cash-actions">
          <button type="button" className="cash-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="cash-confirm" disabled={!canConfirm} onClick={confirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
