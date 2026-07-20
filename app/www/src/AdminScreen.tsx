import { useCallback, useEffect, useState } from 'react';
import { useQuery, useStatus } from '@powersync/react';
import type { SupabaseConnector } from './connector';
import { db } from './powerSync';
import {
  PRODUCTS_TABLE,
  STORE_STAFF_TABLE,
  type ProductRecord
} from './schema';

type StaffRow = {
  user_id: string;
  store_id: string;
  role: string;
  created_at: string;
};

type StaffRole = 'cashier' | 'admin';

function formatMoney(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function AdminScreen({
  connector,
  section = 'all'
}: {
  connector: SupabaseConnector;
  /** When embedded in the POS shell, show one admin section at a time. */
  section?: 'all' | 'inventory' | 'users';
}) {
  const status = useStatus();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draftStock, setDraftStock] = useState<Record<string, string>>({});
  const [draftName, setDraftName] = useState<Record<string, string>>({});
  const [draftPrice, setDraftPrice] = useState<Record<string, string>>({});

  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('kg');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('0');

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [linkUserId, setLinkUserId] = useState('');
  const [linkRole, setLinkRole] = useState<StaffRole>('cashier');

  const userId = connector.currentSession?.user?.id ?? '';

  const { data: myStaff = [] } = useQuery<{ store_id: string; role: string }>(
    userId
      ? `SELECT store_id, role FROM ${STORE_STAFF_TABLE} WHERE user_id = ? LIMIT 1`
      : `SELECT store_id, role FROM ${STORE_STAFF_TABLE} WHERE 1 = 0`,
    userId ? [userId] : []
  );

  const storeId = myStaff[0]?.store_id ?? '';

  const { data: products = [], isLoading: productsLoading } = useQuery<ProductRecord>(
    `SELECT * FROM ${PRODUCTS_TABLE} ORDER BY name ASC`
  );

  const loadStaff = useCallback(async () => {
    if (!storeId) return;
    if (!navigator.onLine) {
      setStaffError('Staff list needs network. Reconnect to manage users.');
      return;
    }

    setStaffLoading(true);
    setStaffError(null);
    try {
      const { data, error } = await connector.client
        .from('store_staff')
        .select('user_id, store_id, role, created_at')
        .eq('store_id', storeId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setStaff((data as StaffRow[]) ?? []);
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : 'Failed to load staff');
    } finally {
      setStaffLoading(false);
    }
  }, [connector, storeId]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  async function saveProduct(product: ProductRecord) {
    const name = (draftName[product.id] ?? product.name ?? '').trim();
    const priceStr = draftPrice[product.id] ?? String(((product.price_cents ?? 0) / 100).toFixed(2));
    const stockStr = draftStock[product.id] ?? String(product.stock_qty ?? '0');

    const pricePesos = Number(priceStr);
    const stock = Number(stockStr);
    if (!name) {
      setMessage('Product name is required');
      return;
    }
    if (!Number.isFinite(pricePesos) || pricePesos < 0) {
      setMessage('Enter a valid price');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setMessage('Enter a valid stock quantity');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const priceCents = Math.round(pricePesos * 100);
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE ${PRODUCTS_TABLE}
         SET name = ?, price_cents = ?, stock_qty = ?, updated_at = ?
         WHERE id = ?`,
        [name, priceCents, stock.toFixed(3), now, product.id]
      );
      setMessage(`Updated ${name}`);
      setDraftName((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      setDraftPrice((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      setDraftStock((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) {
      setMessage('No store assignment found');
      return;
    }

    const name = newName.trim();
    const unit = newUnit.trim() || 'kg';
    const pricePesos = Number(newPrice);
    const stock = Number(newStock);

    if (!name) {
      setMessage('Product name is required');
      return;
    }
    if (!Number.isFinite(pricePesos) || pricePesos < 0) {
      setMessage('Enter a valid price');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setMessage('Enter a valid stock quantity');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const priceCents = Math.round(pricePesos * 100);
      await db.execute(
        `INSERT INTO ${PRODUCTS_TABLE}
           (id, store_id, name, unit, price_cents, stock_qty, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, storeId, name, unit, priceCents, stock.toFixed(3), now, now]
      );
      setMessage(`Added ${name}`);
      setNewName('');
      setNewUnit('kg');
      setNewPrice('');
      setNewStock('0');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Add product failed');
    } finally {
      setBusy(false);
    }
  }

  async function linkStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) {
      setMessage('No store assignment found');
      return;
    }
    if (!navigator.onLine) {
      setMessage('Linking staff needs network');
      return;
    }

    const uid = linkUserId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uid)) {
      setMessage('Paste a valid Auth user UUID');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const { error } = await connector.client.from('store_staff').upsert(
        { user_id: uid, store_id: storeId, role: linkRole },
        { onConflict: 'user_id,store_id' }
      );
      if (error) throw error;
      setMessage('Staff linked');
      setLinkUserId('');
      setLinkRole('cashier');
      await loadStaff();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Link staff failed');
    } finally {
      setBusy(false);
    }
  }

  async function updateStaffRole(row: StaffRow, role: StaffRole) {
    if (!navigator.onLine) {
      setMessage('Updating staff needs network');
      return;
    }
    if (row.user_id === userId && role !== 'admin') {
      setMessage('You cannot remove your own admin role');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const { error } = await connector.client
        .from('store_staff')
        .update({ role })
        .eq('user_id', row.user_id)
        .eq('store_id', row.store_id);
      if (error) throw error;
      setMessage('Role updated');
      await loadStaff();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update role failed');
    } finally {
      setBusy(false);
    }
  }

  async function removeStaff(row: StaffRow) {
    if (!navigator.onLine) {
      setMessage('Removing staff needs network');
      return;
    }
    if (row.user_id === userId) {
      setMessage('You cannot remove your own store assignment');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const { error } = await connector.client
        .from('store_staff')
        .delete()
        .eq('user_id', row.user_id)
        .eq('store_id', row.store_id);
      if (error) throw error;
      setMessage('Staff removed');
      await loadStaff();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Remove staff failed');
    } finally {
      setBusy(false);
    }
  }

  const showInventory = section === 'all' || section === 'inventory';
  const showUsers = section === 'all' || section === 'users';

  return (
    <div className="panel-view">
      <header className="panel-view-header">
        <h1>{section === 'users' ? 'Users' : section === 'inventory' ? 'Inventory' : 'Admin'}</h1>
        <p className="muted">
          {section === 'users'
            ? 'Manage store staff roles and links'
            : 'Edit stock, name, or price. Changes sync when online.'}
        </p>
      </header>

      {message && (
        <p
          className={
            message.startsWith('Updated') ||
            message.startsWith('Added') ||
            message.startsWith('Staff') ||
            message.startsWith('Role')
              ? 'success'
              : 'error'
          }
        >
          {message}
        </p>
      )}

      {showInventory && (
      <section className="card">
        {section === 'all' && <h2>Inventory</h2>}
        {section === 'all' && <p className="muted">Edit stock, name, or price. Changes sync when online.</p>}

        <div className="product-grid">
          {products.map((product) => {
            const nameVal = draftName[product.id] ?? product.name ?? '';
            const priceVal =
              draftPrice[product.id] ?? String(((product.price_cents ?? 0) / 100).toFixed(2));
            const stockVal = draftStock[product.id] ?? String(product.stock_qty ?? '0');

            return (
              <article key={product.id} className="product-card">
                <label>
                  Name
                  <input
                    value={nameVal}
                    onChange={(e) => setDraftName((prev) => ({ ...prev, [product.id]: e.target.value }))}
                  />
                </label>
                <p className="muted">
                  {formatMoney(product.price_cents ?? 0)} / {product.unit} (current)
                </p>
                <div className="row">
                  <label>
                    Price (₱)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceVal}
                      onChange={(e) => setDraftPrice((prev) => ({ ...prev, [product.id]: e.target.value }))}
                    />
                  </label>
                  <label>
                    Stock ({product.unit})
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={stockVal}
                      onChange={(e) => setDraftStock((prev) => ({ ...prev, [product.id]: e.target.value }))}
                    />
                  </label>
                  <button type="button" disabled={busy} onClick={() => void saveProduct(product)}>
                    Save
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {products.length === 0 && (
          <p className="muted">
            {productsLoading || !status.hasSynced ? 'Loading products…' : 'No products yet. Add one below.'}
          </p>
        )}

        <form className="admin-form" onSubmit={(e) => void addProduct(e)}>
          <h3>Add product</h3>
          <div className="row">
            <label>
              Name
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </label>
            <label>
              Unit
              <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} required />
            </label>
            <label>
              Price (₱)
              <input
                type="number"
                min="0"
                step="0.01"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                required
              />
            </label>
            <label>
              Stock
              <input
                type="number"
                min="0"
                step="0.001"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={busy || !storeId}>
              Add
            </button>
          </div>
        </form>
      </section>
      )}

      {showUsers && (
      <section className="card">
        {section === 'all' && <h2>Users</h2>}
        <p className="muted">
          Create the Auth user in Supabase first (Auth → Users), copy their UUID, then link them here.
          Staff list requires network.
        </p>

        {staffError && <p className="error">{staffError}</p>}

        <div className="staff-table-wrap">
          <table className="staff-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((row) => (
                <tr key={`${row.user_id}:${row.store_id}`}>
                  <td>
                    <code title={row.user_id}>{shortId(row.user_id)}</code>
                    {row.user_id === userId ? <span className="muted"> (you)</span> : null}
                  </td>
                  <td>
                    <select
                      value={row.role === 'admin' ? 'admin' : 'cashier'}
                      disabled={busy}
                      onChange={(e) => void updateStaffRole(row, e.target.value as StaffRole)}
                    >
                      <option value="cashier">cashier</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || row.user_id === userId}
                      onClick={() => void removeStaff(row)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {staffLoading && <p className="muted">Loading staff…</p>}
          {!staffLoading && staff.length === 0 && !staffError && (
            <p className="muted">No staff linked to this store yet.</p>
          )}
        </div>

        <form className="admin-form" onSubmit={(e) => void linkStaff(e)}>
          <h3>Link Auth user</h3>
          <div className="row">
            <label className="grow">
              User UUID
              <input
                value={linkUserId}
                onChange={(e) => setLinkUserId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                required
              />
            </label>
            <label>
              Role
              <select value={linkRole} onChange={(e) => setLinkRole(e.target.value as StaffRole)}>
                <option value="cashier">cashier</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button type="submit" disabled={busy || !storeId || !navigator.onLine}>
              Link
            </button>
          </div>
        </form>
      </section>
      )}
    </div>
  );
}
