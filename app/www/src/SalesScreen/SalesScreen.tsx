import { useQuery } from '@powersync/react';
import { SALES_TABLE } from '../schema';
import '../styles/panel-view.css';
import './SalesScreen.css';

function formatMoney(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export function SalesScreen() {
  const { data: sales = [], isLoading } = useQuery<{
    id: string;
    total_cents: number;
    payment_method: string;
    created_at: string;
  }>(`SELECT id, total_cents, payment_method, created_at FROM ${SALES_TABLE} ORDER BY created_at DESC LIMIT 50`);

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
          {sales.map((sale) => (
            <li key={sale.id}>
              <span>{formatMoney(sale.total_cents)}</span>
              <span className="muted">{sale.payment_method}</span>
              <span className="muted">{new Date(sale.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
