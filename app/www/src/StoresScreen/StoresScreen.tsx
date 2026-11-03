import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import type { SupabaseConnector } from '../connector';
import { db } from '../powerSync';
import { StatusBanner } from '../StatusBanner/StatusBanner';
import { STORES_TABLE, isStoreEnabled, type StoreRecord } from '../schema';
import '../styles/panel-view.css';
import '../styles/fullscreen-modal.css';
import './StoresScreen.css';

type StatusFilter = 'all' | 'active' | 'inactive';

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

export function StoresScreen({ connector }: { connector: SupabaseConnector }) {
  const userId = connector.currentSession?.user?.id ?? '';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draftName, setDraftName] = useState<Record<string, string>>({});
  const [draftEnabled, setDraftEnabled] = useState<Record<string, boolean>>({});

  const [newName, setNewName] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);
  const [storeModal, setStoreModal] = useState<null | 'add' | StoreRecord>(null);

  const { data: stores = [], isLoading } = useQuery<StoreRecord>(
    `SELECT * FROM ${STORES_TABLE} ORDER BY name ASC`
  );

  const filtered = useMemo(() => {
    return stores.filter((store) => {
      const active = isStoreEnabled(store);
      if (statusFilter === 'active') return active;
      if (statusFilter === 'inactive') return !active;
      return true;
    });
  }, [stores, statusFilter]);

  function nameValue(store: StoreRecord) {
    if (Object.prototype.hasOwnProperty.call(draftName, store.id)) {
      return draftName[store.id];
    }
    return store.name ?? '';
  }

  function enabledValue(store: StoreRecord) {
    if (Object.prototype.hasOwnProperty.call(draftEnabled, store.id)) {
      return draftEnabled[store.id];
    }
    return isStoreEnabled(store);
  }

  function clearDrafts(storeId: string) {
    setDraftName((prev) => {
      const next = { ...prev };
      delete next[storeId];
      return next;
    });
    setDraftEnabled((prev) => {
      const next = { ...prev };
      delete next[storeId];
      return next;
    });
  }

  async function saveStore(store: StoreRecord) {
    const name = nameValue(store).trim();
    const enabled = enabledValue(store);
    if (!name) {
      setMessage('Store name is required');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await db.execute(`UPDATE ${STORES_TABLE} SET name = ?, enabled = ? WHERE id = ?`, [
        name,
        enabled ? 1 : 0,
        store.id
      ]);
      setMessage(`Updated ${name}`);
      clearDrafts(store.id);
      setStoreModal(null);
    } catch (err) {
      setMessage(errorMessage(err, 'Update store failed'));
    } finally {
      setBusy(false);
    }
  }

  async function addStore(e?: React.FormEvent) {
    e?.preventDefault();
    if (!userId) {
      setMessage('Not signed in');
      return;
    }
    const name = newName.trim();
    if (!name) {
      setMessage('Store name is required');
      return;
    }
    if (!navigator.onLine) {
      setMessage('Creating a store needs network so PowerSync can link you as admin and sync it.');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      // Server-side atomic create (store + store_staff). Local-only inserts vanish on
      // refresh: sync only downloads stores joined to store_staff, and staff bootstrap
      // via PowerSync upload often fails RLS before that link exists.
      const { data: storeId, error } = await connector.client.rpc('create_store', {
        p_name: name,
        p_enabled: newEnabled
      });
      if (error) throw error;
      if (!storeId) throw new Error('Create store returned no id');

      setMessage(`Added ${name}. Syncing…`);
      setNewName('');
      setNewEnabled(true);
      setStoreModal(null);
    } catch (err) {
      setMessage(errorMessage(err, 'Add store failed'));
    } finally {
      setBusy(false);
    }
  }

  async function setStoreActive(store: StoreRecord, enabled: boolean) {
    setDraftEnabled((prev) => ({ ...prev, [store.id]: enabled }));
    setBusy(true);
    setMessage(null);
    try {
      const name = nameValue(store).trim() || store.name || 'Store';
      await db.execute(`UPDATE ${STORES_TABLE} SET name = ?, enabled = ? WHERE id = ?`, [
        name,
        enabled ? 1 : 0,
        store.id
      ]);
      setMessage(enabled ? `Activated ${name}` : `Deactivated ${name}`);
      clearDrafts(store.id);
    } catch (err) {
      setMessage(errorMessage(err, 'Update store failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-view">
      <header className="panel-view-header">
        <h1>Stores</h1>
        <p className="muted">
          Create and update locations. Deactivate instead of deleting so sales history stays intact.
          Creating a store needs network (you become admin and PowerSync syncs it).
        </p>
      </header>

      <div className="panel-view-body">
        <StatusBanner
          message={message}
          variant={message?.toLowerCase().includes('fail') ? 'error' : 'success'}
          onDismiss={() => setMessage(null)}
        />

        <div className="stores-toolbar" role="group" aria-label="Filter stores">
          {(
            [
              ['all', 'All'],
              ['active', 'Active'],
              ['inactive', 'Inactive']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`stores-filter-btn${statusFilter === value ? ' active' : ''}`}
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="stores-list desktop-only">
          <div className="stores-row stores-head" aria-hidden="true">
            <span className="stores-name">Name</span>
            <span className="stores-status">Status</span>
            <span className="stores-action" />
            <span className="stores-action" />
          </div>

          {filtered.map((store) => {
            const active = enabledValue(store);
            return (
              <div key={store.id} className="stores-row">
                <input
                  className="stores-name"
                  aria-label={`Name for ${store.name}`}
                  value={nameValue(store)}
                  onChange={(e) =>
                    setDraftName((prev) => ({ ...prev, [store.id]: e.target.value }))
                  }
                />
                <label className="stores-status">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) =>
                      setDraftEnabled((prev) => ({ ...prev, [store.id]: e.target.checked }))
                    }
                  />
                  <span>{active ? 'Active' : 'Inactive'}</span>
                </label>
                <button
                  type="button"
                  className="stores-action"
                  disabled={busy}
                  onClick={() => void saveStore(store)}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="stores-action stores-action-secondary"
                  disabled={busy}
                  onClick={() => void setStoreActive(store, !isStoreEnabled(store))}
                >
                  {isStoreEnabled(store) ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="stores-screen-mobile-list mobile-only">
          {filtered.map((store) => {
            const active = isStoreEnabled(store);
            return (
              <button
                key={store.id}
                type="button"
                className="mobile-list-row"
                onClick={() => setStoreModal(store)}
              >
                <span className="mobile-list-primary">{store.name}</span>
                <span className={`mobile-list-meta${active ? '' : ' stores-inactive-meta'}`}>
                  {active ? 'Active' : 'Inactive'}
                </span>
                <span className="mobile-list-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="mobile-add-btn"
            disabled={busy}
            onClick={() => {
              setNewName('');
              setNewEnabled(true);
              setStoreModal('add');
            }}
          >
            Add store
          </button>
        </div>

        {isLoading && stores.length === 0 && <p className="muted">Loading stores…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="muted">
            {statusFilter === 'all'
              ? 'No stores yet. Add one below.'
              : statusFilter === 'active'
                ? 'No active stores.'
                : 'No inactive stores.'}
          </p>
        )}

        <form className="stores-add desktop-only" onSubmit={(e) => void addStore(e)}>
          <h3>Add store</h3>
          <div className="stores-row stores-add-row">
            <input
              className="stores-name"
              aria-label="New store name"
              placeholder="Store name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            <label className="stores-status">
              <input
                type="checkbox"
                checked={newEnabled}
                onChange={(e) => setNewEnabled(e.target.checked)}
              />
              <span>{newEnabled ? 'Active' : 'Inactive'}</span>
            </label>
            <button type="submit" className="stores-action" disabled={busy}>
              Add
            </button>
          </div>
        </form>
      </div>

      {storeModal &&
        (() => {
          const isAdd = storeModal === 'add';
          const store = isAdd ? null : storeModal;
          const nameVal = store ? nameValue(store) : newName;
          const enabledVal = store ? enabledValue(store) : newEnabled;

          return (
            <div
              className="modal-overlay full-screen"
              role="presentation"
              onClick={() => setStoreModal(null)}
            >
              <div
                className="modal-card full-screen"
                role="dialog"
                aria-modal="true"
                aria-labelledby="store-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="modal-header">
                  <h2 id="store-modal-title" className="modal-title">
                    {isAdd ? 'Add store' : 'Edit store'}
                  </h2>
                  <button type="button" className="modal-close" onClick={() => setStoreModal(null)}>
                    Close
                  </button>
                </header>
                <div className="modal-body">
                  <label className="modal-field">
                    <span>Name</span>
                    <input
                      value={nameVal}
                      onChange={(e) => {
                        if (store) {
                          setDraftName((prev) => ({ ...prev, [store.id]: e.target.value }));
                        } else {
                          setNewName(e.target.value);
                        }
                      }}
                    />
                  </label>
                  <label className="modal-field modal-field-checkbox">
                    <span>Active</span>
                    <input
                      type="checkbox"
                      checked={enabledVal}
                      onChange={(e) => {
                        if (store) {
                          setDraftEnabled((prev) => ({
                            ...prev,
                            [store.id]: e.target.checked
                          }));
                        } else {
                          setNewEnabled(e.target.checked);
                        }
                      }}
                    />
                    <span className="muted">Inactive stores stay in history but hide from inventory</span>
                  </label>
                </div>
                <footer className="modal-footer">
                  {!isAdd && store && (
                    <button
                      type="button"
                      className="modal-footer-danger"
                      disabled={busy}
                      onClick={() => void setStoreActive(store, !isStoreEnabled(store))}
                    >
                      {isStoreEnabled(store) ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="modal-footer-cancel"
                    onClick={() => setStoreModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="modal-footer-primary"
                    disabled={busy}
                    onClick={() => {
                      if (store) void saveStore(store);
                      else void addStore();
                    }}
                  >
                    {isAdd ? 'Add' : 'Save'}
                  </button>
                </footer>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
