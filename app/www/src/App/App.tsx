import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { PowerSyncContext, useQuery, useStatus } from '@powersync/react';
import { AdminScreen } from '../AdminScreen/AdminScreen';
import { CashierScreen } from '../CashierScreen/CashierScreen';
import { SupabaseConnector } from '../connector';
import { PwaBanner } from '../PwaBanner/PwaBanner';
import { db } from '../powerSync';
import { SalesScreen } from '../SalesScreen/SalesScreen';
import { SideNav, type AppView } from '../SideNav/SideNav';
import { STORE_STAFF_TABLE } from '../schema';
import './App.css';

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
      <h1>aqeela-pos</h1>
      <p className="muted">Sign in to continue</p>
      {!navigator.onLine && (
        <p className="error">
          Offline — sign-in needs network. If you signed in earlier on this device, refresh after reconnecting once, then
          the app will work offline.
        </p>
      )}
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
        <button type="submit" disabled={loading || !navigator.onLine}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function DiagnosticsPanel({
  connector,
  userId
}: {
  connector: SupabaseConnector;
  userId: string;
}) {
  const status = useStatus();
  const [remote, setRemote] = useState<{ staffCount: number; staffError?: string } | null>(null);

  const { data: staffRows = [] } = useQuery<{ id: string }>(
    userId
      ? `SELECT id FROM ${STORE_STAFF_TABLE} WHERE user_id = ?`
      : `SELECT id FROM ${STORE_STAFF_TABLE} WHERE 1 = 0`,
    userId ? [userId] : []
  );

  const { data: products = [] } = useQuery<{ id: string }>(`SELECT id FROM products`);

  useEffect(() => {
    async function loadRemoteDiagnostics() {
      const { data: sessionData } = await connector.client.auth.getSession();
      if (!sessionData.session) return;

      const staffResult = await connector.client.from('store_staff').select('*', { count: 'exact', head: true });

      setRemote({
        staffCount: staffResult.count ?? 0,
        staffError: staffResult.error?.message
      });
    }

    void loadRemoteDiagnostics();
  }, [connector, userId, status.hasSynced]);

  const downloadError = status.dataFlowStatus?.downloadError?.message;

  return (
    <section className="card diagnostics diagnostics-overlay">
      <h2>Diagnostics</h2>
      {downloadError && <p className="error">Sync error: {downloadError}</p>}
      <ul className="diag-list">
        <li>
          Logged-in user: <code>{userId || 'unknown'}</code>
        </li>
        <li>
          PowerSync: {status.connected ? 'connected' : 'not connected'} ·{' '}
          {status.hasSynced ? 'synced' : 'not synced yet'}
        </li>
        <li>
          Remote store_staff: {remote?.staffCount ?? '…'}
          {remote?.staffError ? ` — ${remote.staffError}` : ''}
        </li>
        <li>Local products: {products.length}</li>
        <li>Local store_staff: {staffRows.length}</li>
      </ul>
    </section>
  );
}

function AuthedApp({
  connector,
  onSignOut
}: {
  connector: SupabaseConnector;
  onSignOut: () => Promise<void>;
}) {
  const status = useStatus();
  const showDiagnostics = useDiagnosticsEnabled();
  const userId = connector.currentSession?.user?.id ?? '';
  const { data: staffRows = [], isLoading: staffLoading } = useQuery<{ role: string }>(
    userId
      ? `SELECT role FROM ${STORE_STAFF_TABLE} WHERE user_id = ?`
      : `SELECT role FROM ${STORE_STAFF_TABLE} WHERE 1 = 0`,
    userId ? [userId] : []
  );

  const isAdmin = staffRows.some((row) => row.role === 'admin');
  const [view, setView] = useState<AppView>('sales');
  const [navCollapsed, setNavCollapsed] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!isAdmin && (view === 'inventory' || view === 'categories' || view === 'users')) {
      setView('cashier');
      return;
    }
    if (isAdmin && view === 'cashier') {
      setView('sales');
    }
  }, [isAdmin, view]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  }

  if (staffLoading) {
    return <div className="page centered">Loading…</div>;
  }

  return (
    <div className="pos-shell">
      <SideNav
        view={view}
        isAdmin={isAdmin}
        collapsed={navCollapsed}
        connected={status.connected}
        hasSynced={Boolean(status.hasSynced)}
        email={connector.currentSession?.user?.email}
        signingOut={signingOut}
        onNavigate={setView}
        onToggle={() => setNavCollapsed((c) => !c)}
        onSignOut={() => void handleSignOut()}
      />

      <main className="pos-main">
        {view === 'cashier' && <CashierScreen connector={connector} />}
        {view === 'sales' && <SalesScreen />}
        {view === 'inventory' && isAdmin && <AdminScreen connector={connector} section="inventory" />}
        {view === 'categories' && isAdmin && <AdminScreen connector={connector} section="categories" />}
        {view === 'users' && isAdmin && <AdminScreen connector={connector} section="users" />}
        {showDiagnostics && <DiagnosticsPanel connector={connector} userId={userId} />}
      </main>
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
        const current = connector.currentSession;
        setSession(current);
        if (current) {
          // Connect even when offline — PowerSync serves local SQLite; sync resumes later.
          void db.connect(connector);
        }
      } catch (err) {
        console.error('App startup failed', err);
        if (!active) return;
        setStartupError(startupErrorMessage(err));
      }
    })();

    const {
      data: { subscription }
    } = connector.client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' && !navigator.onLine) {
        return;
      }
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
      <div className="page centered">
        <div className="card login-card">
          <h1>aqeela-pos</h1>
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
    return <div className="page centered">Loading…</div>;
  }

  return (
    <PowerSyncContext.Provider value={db}>
      <PwaBanner />
      {session ? (
        <AuthedApp connector={connector} onSignOut={handleSignOut} />
      ) : (
        <div className="page centered">
          <LoginScreen connector={connector} />
        </div>
      )}
    </PowerSyncContext.Provider>
  );
}
