import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { PowerSyncContext, useQuery, useStatus } from '@powersync/react';
import { SupabaseConnector } from './connector';
import { db } from './powerSync';
import {
  PRODUCTS_TABLE,
  SALES_TABLE,
  SALE_LINES_TABLE,
  STORE_STAFF_TABLE,
  type ProductRecord
} from './schema';

type RemoteDiagnostics = {
  staffCount: number;
  staffError?: string;
};

function formatMoney(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function useDiagnosticsEnabled() {
  return useMemo(
    () => new URLSearchParams(window.location.search).get('diagnostics') === 'true',
    []
  );
}

function LoginScreen({ connector }: { connector: SupabaseConnector }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await connector.login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card login-card">
      <h1>POS Spike</h1>
      <p className="muted">Supabase Auth + self-hosted PowerSync</p>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function PosScreen({
  connector,
  onSignOut
}: {
  connector: SupabaseConnector;
  onSignOut: () => Promise<void>;
}) {
  const status = useStatus();
  const showDiagnostics = useDiagnosticsEnabled();
  const [search, setSearch] = useState('');
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [remote, setRemote] = useState<RemoteDiagnostics | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  }

  const userId = connector.currentSession?.user?.id ?? '';
  const downloadError = status.dataFlowStatus?.downloadError?.message;

  useEffect(() => {
    if (!showDiagnostics) return;

    async function loadRemoteDiagnostics() {
      const { data: sessionData } = await connector.client.auth.getSession();
      if (!sessionData.session) return;

      const staffResult = await connector.client
        .from('store_staff')
        .select('*', { count: 'exact', head: true });

      setRemote({
        staffCount: staffResult.count ?? 0,
        staffError: staffResult.error?.message
      });
    }

    void loadRemoteDiagnostics();
  }, [connector, showDiagnostics, userId, status.hasSynced]);

  const { data: staffRows = [] } = useQuery<{ id: string; store_id: string; role: string }>(
    userId
      ? `SELECT id, store_id, role FROM ${STORE_STAFF_TABLE} WHERE user_id = ?`
      : `SELECT id, store_id, role FROM ${STORE_STAFF_TABLE} WHERE 1 = 0`,
    userId ? [userId] : []
  );

  const { data: products = [], isLoading: productsLoading } = useQuery<ProductRecord>(
    `SELECT * FROM ${PRODUCTS_TABLE} ORDER BY name ASC`
  );

  const { data: sales = [] } = useQuery<{ id: string; total_cents: number; payment_method: string; created_at: string }>(
    `SELECT id, total_cents, payment_method, created_at FROM ${SALES_TABLE} ORDER BY created_at DESC LIMIT 10`
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name ?? '').toLowerCase().includes(q));
  }, [products, search]);

  async function sell(product: ProductRecord, paymentMethod: 'cash' | 'gcash') {
    const qtyStr = qtyByProduct[product.id] ?? '1';
    const qty = Number(qtyStr);
    if (!Number.isFinite(qty) || qty <= 0) {
      setMessage('Enter a valid quantity');
      return;
    }

    const stock = Number(product.stock_qty);
    if (qty > stock) {
      setMessage(`Not enough stock (have ${stock} ${product.unit})`);
      return;
    }

    const session = connector.currentSession;
    if (!session?.user?.id) {
      setMessage('Not signed in');
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const staffRows = await db.getAll<{ store_id: string }>(
        `SELECT store_id FROM ${STORE_STAFF_TABLE} WHERE user_id = ? LIMIT 1`,
        [session.user.id]
      );
      const storeId = staffRows[0]?.store_id;
      if (!storeId) {
        throw new Error('No store assignment found for this user. Run store_staff insert in Supabase.');
      }

      const saleId = crypto.randomUUID();
      const lineId = crypto.randomUUID();
      const unitPrice = product.price_cents ?? 0;
      const lineTotal = Math.round(qty * unitPrice);
      const now = new Date().toISOString();
      const newStock = (stock - qty).toFixed(3);

      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO ${SALES_TABLE} (id, store_id, cashier_id, total_cents, payment_method, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, storeId, session.user.id, lineTotal, paymentMethod, now]
        );
        await tx.execute(
          `INSERT INTO ${SALE_LINES_TABLE} (id, sale_id, product_id, qty, unit_price_cents, line_total_cents)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [lineId, saleId, product.id, qty.toFixed(3), unitPrice, lineTotal]
        );
        await tx.execute(
          `UPDATE ${PRODUCTS_TABLE} SET stock_qty = ?, updated_at = ? WHERE id = ?`,
          [newStock, now, product.id]
        );
      });

      setMessage(`Sold ${qty} ${product.unit} of ${product.name} (${paymentMethod}) — ${formatMoney(lineTotal)}`);
      setQtyByProduct((prev) => ({ ...prev, [product.id]: '1' }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sale failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="layout">
      <header className="header">
        <div>
          <h1>POS Spike</h1>
          <p className="muted">{connector.currentSession?.user?.email}</p>
        </div>
        <div className="status-row">
          <span className={`pill ${status.connected ? 'ok' : 'warn'}`}>
            {status.connected ? 'Connected' : navigator.onLine ? 'Connecting…' : 'Offline'}
          </span>
          <span className={`pill ${status.hasSynced ? 'ok' : 'warn'}`}>
            {status.hasSynced ? 'Synced' : 'Syncing…'}
          </span>
          <span className="pill">{navigator.onLine ? 'Online' : 'Offline mode'}</span>
          <button type="button" className="secondary" disabled={signingOut} onClick={() => void handleSignOut()}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      {message && <p className={message.startsWith('Sold') ? 'success' : 'error'}>{message}</p>}
      {downloadError && <p className="error">Sync error: {downloadError}</p>}

      {showDiagnostics && (
        <section className="card diagnostics">
          <h2>Diagnostics</h2>
          <ul className="diag-list">
            <li>Logged-in user: <code>{userId || 'unknown'}</code></li>
            <li>PowerSync: {status.connected ? 'connected' : 'not connected'} · {status.hasSynced ? 'synced' : 'not synced yet'}</li>
            <li>Remote store_staff: {remote?.staffCount ?? '…'}{remote?.staffError ? ` — ${remote.staffError}` : ''}</li>
            <li>Local products: {products.length}</li>
            <li>Local store_staff: {staffRows.length}</li>
          </ul>
        </section>
      )}

      <section className="card">
        <label className="search">
          Search products
          <input
            type="search"
            placeholder="rice, hotdog…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <div className="product-grid">
          {filtered.map((product) => (
            <article key={product.id} className="product-card">
              <h2>{product.name}</h2>
              <p className="muted">
                {formatMoney(product.price_cents ?? 0)} / {product.unit}
              </p>
              <p>Stock: {Number(product.stock_qty).toLocaleString()} {product.unit}</p>
              <div className="row">
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={qtyByProduct[product.id] ?? '1'}
                  onChange={(e) =>
                    setQtyByProduct((prev) => ({ ...prev, [product.id]: e.target.value }))
                  }
                />
                <button type="button" disabled={busy} onClick={() => sell(product, 'cash')}>
                  Cash
                </button>
                <button type="button" className="secondary" disabled={busy} onClick={() => sell(product, 'gcash')}>
                  GCash
                </button>
              </div>
            </article>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="diagnostics">
            {productsLoading || !status.hasSynced ? (
              <p className="muted">Loading products from sync…</p>
            ) : products.length === 0 ? (
              <>
                <p className="error">No products synced yet.</p>
                <p className="muted">
                  Check store_staff assignment (<code>supabase/scripts/link_test_user.sql</code>) and PowerSync sync config.
                  Clear IndexedDB and sign in again if needed.
                </p>
              </>
            ) : (
              <p className="muted">No products match your search.</p>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Recent sales (local)</h2>
        <ul className="sales-list">
          {sales.map((sale) => (
            <li key={sale.id}>
              <span>{formatMoney(sale.total_cents)}</span>
              <span className="muted">{sale.payment_method}</span>
              <span className="muted">{new Date(sale.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function startupErrorMessage(err: unknown) {
  if (!window.isSecureContext) {
    return (
      'PowerSync needs a secure browser context (HTTPS). ' +
      'On this device, open https://<your-computer-ip>:5173 instead of http://…, ' +
      'then accept the browser security warning for the local dev certificate.'
    );
  }

  const message = err instanceof Error ? err.message : 'Startup failed';
  if (/secure context|navigator locks/i.test(message)) {
    return (
      'PowerSync could not start because this page is not served over HTTPS. ' +
      'Use https://<your-computer-ip>:5173 from other devices on your network.'
    );
  }

  return message;
}

export function App() {
  const [connector] = useState(() => new SupabaseConnector());
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        await db.init();
        await connector.init();
        if (!active) return;
        setReady(true);
        setSession(connector.currentSession);
      } catch (err) {
        console.error('App startup failed', err);
        if (!active) return;
        setStartupError(startupErrorMessage(err));
      }
    })();

    const {
      data: { subscription }
    } = connector.client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession) {
        void (async () => {
          await db.init();
          await db.connect(connector);
        })();
      } else {
        void db.disconnect();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [connector]);

  async function handleSignOut() {
    setSession(null);
    await connector.logout();
  }

  if (startupError) {
    return (
      <div className="page">
        <div className="card login-card">
          <h1>POS Spike</h1>
          <p className="error">{startupError}</p>
          <p className="muted">
            Current URL: <code>{window.location.href}</code>
            {window.isSecureContext ? ' (secure)' : ' (not secure)'}
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return <div className="page">Loading…</div>;
  }

  return (
    <PowerSyncContext.Provider value={db}>
      <div className="page">
        {session ? (
          <PosScreen connector={connector} onSignOut={handleSignOut} />
        ) : (
          <LoginScreen connector={connector} />
        )}
      </div>
    </PowerSyncContext.Provider>
  );
}
