import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useStatus } from '@powersync/react';
import type { SupabaseConnector } from '../connector';
import { db } from '../powerSync';
import {
  PRODUCT_COLORS,
  productColorHex,
  type ProductColor
} from '../productColors';
import {
  CATEGORIES_TABLE,
  PRODUCTS_TABLE,
  STORE_STAFF_TABLE,
  isRiceCategory,
  type CategoryRecord,
  type ProductRecord
} from '../schema';
import '../styles/panel-view.css';
import './AdminScreen.css';

type StaffRow = {
  user_id: string;
  store_id: string;
  role: string;
  created_at: string;
};

type StaffRole = 'cashier' | 'admin';

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function categoryByIdMap(categories: CategoryRecord[]) {
  const map = new Map<string, CategoryRecord>();
  for (const c of categories) map.set(c.id, c);
  return map;
}

export function AdminScreen({
  connector,
  section = 'all'
}: {
  connector: SupabaseConnector;
  /** When embedded in the POS shell, show one admin section at a time. */
  section?: 'all' | 'inventory' | 'categories' | 'users';
}) {
  const status = useStatus();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draftStock, setDraftStock] = useState<Record<string, string>>({});
  const [draftName, setDraftName] = useState<Record<string, string>>({});
  const [draftPrice, setDraftPrice] = useState<Record<string, string>>({});
  const [draftColor, setDraftColor] = useState<Record<string, ProductColor>>({});
  const [draftCategory, setDraftCategory] = useState<Record<string, string>>({});
  const [draftKgPerSack, setDraftKgPerSack] = useState<Record<string, string>>({});

  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('kg');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('0');
  const [newColor, setNewColor] = useState<ProductColor>('red');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newKgPerSack, setNewKgPerSack] = useState('25');

  const [draftCategoryName, setDraftCategoryName] = useState<Record<string, string>>({});
  const [newCategoryName, setNewCategoryName] = useState('');

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

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<CategoryRecord>(
    `SELECT * FROM ${CATEGORIES_TABLE} ORDER BY name ASC`
  );

  const categoriesById = useMemo(() => categoryByIdMap(categories), [categories]);

  const newCategoryIsRice = useMemo(() => {
    if (!newCategoryId) return false;
    return isRiceCategory(categoriesById.get(newCategoryId));
  }, [newCategoryId, categoriesById]);

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

  function selectedCategoryId(product: ProductRecord) {
    if (Object.prototype.hasOwnProperty.call(draftCategory, product.id)) {
      return draftCategory[product.id];
    }
    return product.category_id ?? '';
  }

  function selectedKgPerSack(product: ProductRecord) {
    if (Object.prototype.hasOwnProperty.call(draftKgPerSack, product.id)) {
      return draftKgPerSack[product.id];
    }
    return product.kg_per_sack != null ? String(product.kg_per_sack) : '';
  }

  async function saveProduct(product: ProductRecord) {
    const name = (draftName[product.id] ?? product.name ?? '').trim();
    const priceStr = draftPrice[product.id] ?? String(((product.price_cents ?? 0) / 100).toFixed(2));
    const stockStr = draftStock[product.id] ?? String(product.stock_qty ?? '0');
    const color = draftColor[product.id] ?? (product.color as ProductColor | null) ?? 'red';
    const categoryId = selectedCategoryId(product);
    const category = categoryId ? categoriesById.get(categoryId) : undefined;
    const rice = isRiceCategory(category);
    const kgPerSackStr = selectedKgPerSack(product);

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

    let kgPerSack: string | null = null;
    if (rice) {
      if (kgPerSackStr.trim() === '') {
        kgPerSack = null;
      } else {
        const n = Number(kgPerSackStr);
        if (!Number.isFinite(n) || n <= 0) {
          setMessage('Enter a valid kg per sack');
          return;
        }
        kgPerSack = n.toFixed(3);
      }
    }

    setBusy(true);
    setMessage(null);
    try {
      const priceCents = Math.round(pricePesos * 100);
      const now = new Date().toISOString();
      const unit = rice ? 'kg' : (product.unit ?? 'kg');
      await db.execute(
        `UPDATE ${PRODUCTS_TABLE}
         SET name = ?, price_cents = ?, stock_qty = ?, color = ?, category_id = ?, kg_per_sack = ?, unit = ?, updated_at = ?
         WHERE id = ?`,
        [
          name,
          priceCents,
          stock.toFixed(3),
          color,
          categoryId || null,
          kgPerSack,
          unit,
          now,
          product.id
        ]
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
      setDraftColor((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      setDraftCategory((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      setDraftKgPerSack((prev) => {
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
    const category = newCategoryId ? categoriesById.get(newCategoryId) : undefined;
    const rice = isRiceCategory(category);
    const unit = rice ? 'kg' : newUnit.trim() || 'kg';
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

    let kgPerSack: string | null = null;
    if (rice) {
      if (newKgPerSack.trim() === '') {
        kgPerSack = null;
      } else {
        const n = Number(newKgPerSack);
        if (!Number.isFinite(n) || n <= 0) {
          setMessage('Enter a valid kg per sack');
          return;
        }
        kgPerSack = n.toFixed(3);
      }
    }

    setBusy(true);
    setMessage(null);
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const priceCents = Math.round(pricePesos * 100);
      await db.execute(
        `INSERT INTO ${PRODUCTS_TABLE}
           (id, store_id, name, unit, price_cents, stock_qty, color, category_id, kg_per_sack, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          storeId,
          name,
          unit,
          priceCents,
          stock.toFixed(3),
          newColor,
          newCategoryId || null,
          kgPerSack,
          now,
          now
        ]
      );
      setMessage(`Added ${name}`);
      setNewName('');
      setNewUnit('kg');
      setNewPrice('');
      setNewStock('0');
      setNewColor('red');
      setNewCategoryId('');
      setNewKgPerSack('25');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Add product failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(category: CategoryRecord) {
    const name = (draftCategoryName[category.id] ?? category.name ?? '').trim();
    if (!name) {
      setMessage('Category name is required');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE ${CATEGORIES_TABLE} SET name = ?, updated_at = ? WHERE id = ?`,
        [name, now, category.id]
      );
      setMessage(`Updated ${name}`);
      setDraftCategoryName((prev) => {
        const next = { ...prev };
        delete next[category.id];
        return next;
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update category failed');
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) {
      setMessage('No store assignment found');
      return;
    }

    const name = newCategoryName.trim();
    if (!name) {
      setMessage('Category name is required');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO ${CATEGORIES_TABLE} (id, store_id, name, slug, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, storeId, name, null, now, now]
      );
      setMessage(`Added ${name}`);
      setNewCategoryName('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Add category failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(category: CategoryRecord) {
    if (isRiceCategory(category)) {
      setMessage('Rice category cannot be deleted');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const now = new Date().toISOString();
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `UPDATE ${PRODUCTS_TABLE} SET category_id = NULL, kg_per_sack = NULL, updated_at = ? WHERE category_id = ?`,
          [now, category.id]
        );
        await tx.execute(`DELETE FROM ${CATEGORIES_TABLE} WHERE id = ?`, [category.id]);
      });
      setMessage(`Deleted ${category.name}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Delete category failed');
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
  const showCategories = section === 'all' || section === 'categories';
  const showUsers = section === 'all' || section === 'users';

  const headerTitle =
    section === 'users'
      ? 'Users'
      : section === 'inventory'
        ? 'Inventory'
        : section === 'categories'
          ? 'Categories'
          : 'Admin';

  const headerHint =
    section === 'users'
      ? 'Manage store staff roles and links'
      : section === 'categories'
        ? 'Organize products with store categories. Rice is a built-in preset for kg sales.'
        : 'Edit stock, name, or price. Changes sync when online.';

  const successMessage =
    message?.startsWith('Updated') ||
    message?.startsWith('Added') ||
    message?.startsWith('Deleted') ||
    message?.startsWith('Staff') ||
    message?.startsWith('Role');

  return (
    <div className="panel-view">
      <header className="panel-view-header">
        <h1>{headerTitle}</h1>
        <p className="muted">{headerHint}</p>
      </header>

      {message && <p className={successMessage ? 'success' : 'error'}>{message}</p>}

      {showCategories && (
        <section className="inventory-section">
          {section === 'all' && <h2>Categories</h2>}
          {section === 'all' && (
            <p className="muted">Rename categories or add new ones. Rice cannot be deleted.</p>
          )}

          <div className="inventory-list">
            <div className="inventory-row inventory-head category-row" aria-hidden="true">
              <span className="inventory-name">Name</span>
              <span className="inventory-unit">Type</span>
              <span className="inventory-action" />
              <span className="inventory-action" />
            </div>

            {categories.map((category) => {
              const nameVal = draftCategoryName[category.id] ?? category.name ?? '';
              const rice = isRiceCategory(category);
              return (
                <div key={category.id} className="inventory-row category-row">
                  <input
                    className="inventory-name"
                    aria-label={`Name for ${category.name}`}
                    value={nameVal}
                    onChange={(e) =>
                      setDraftCategoryName((prev) => ({ ...prev, [category.id]: e.target.value }))
                    }
                  />
                  <span className="inventory-unit" title={rice ? 'Preset' : 'Custom'}>
                    {rice ? 'Rice' : 'Custom'}
                  </span>
                  <button
                    type="button"
                    className="inventory-action"
                    disabled={busy}
                    onClick={() => void saveCategory(category)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="inventory-action inventory-action-secondary"
                    disabled={busy || rice}
                    title={rice ? 'Rice cannot be deleted' : 'Delete category'}
                    onClick={() => void deleteCategory(category)}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>

          {categories.length === 0 && (
            <p className="muted">
              {categoriesLoading || !status.hasSynced
                ? 'Loading categories…'
                : 'No categories yet. Add one below.'}
            </p>
          )}

          <form className="admin-form" onSubmit={(e) => void addCategory(e)}>
            <h3>Add category</h3>
            <div className="inventory-row inventory-add category-row">
              <input
                className="inventory-name"
                aria-label="New category name"
                placeholder="Name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                required
              />
              <button type="submit" className="inventory-action" disabled={busy || !storeId}>
                Add
              </button>
            </div>
          </form>
        </section>
      )}

      {showInventory && (
        <section className="inventory-section">
          {section === 'all' && <h2>Inventory</h2>}
          {section === 'all' && (
            <p className="muted">Edit stock, name, or price. Changes sync when online.</p>
          )}

          <div className="inventory-list">
            <div className="inventory-row inventory-head" aria-hidden="true">
              <span className="inventory-color" />
              <span className="inventory-name">Name</span>
              <span className="inventory-category">Category</span>
              <span className="inventory-price">Price (₱)</span>
              <span className="inventory-stock">Stock</span>
              <span className="inventory-unit">Unit</span>
              <span className="inventory-sack">Kg/sack</span>
              <span className="inventory-action" />
            </div>

            {products.map((product) => {
              const nameVal = draftName[product.id] ?? product.name ?? '';
              const priceVal =
                draftPrice[product.id] ?? String(((product.price_cents ?? 0) / 100).toFixed(2));
              const stockVal = draftStock[product.id] ?? String(product.stock_qty ?? '0');
              const colorVal =
                draftColor[product.id] ?? (product.color as ProductColor | null) ?? 'red';
              const categoryId = selectedCategoryId(product);
              const category = categoryId ? categoriesById.get(categoryId) : undefined;
              const rice = isRiceCategory(category);
              const kgPerSackVal = selectedKgPerSack(product);

              return (
                <div key={product.id} className="inventory-row">
                  <label
                    className="inventory-color"
                    style={{ backgroundColor: productColorHex(colorVal) }}
                    title={colorVal}
                  >
                    <span className="sr-only">Color for {product.name}</span>
                    <select
                      aria-label={`Color for ${product.name}`}
                      value={colorVal}
                      onChange={(e) =>
                        setDraftColor((prev) => ({
                          ...prev,
                          [product.id]: e.target.value as ProductColor
                        }))
                      }
                    >
                      {PRODUCT_COLORS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    className="inventory-name"
                    aria-label={`Name for ${product.name}`}
                    value={nameVal}
                    onChange={(e) => setDraftName((prev) => ({ ...prev, [product.id]: e.target.value }))}
                  />
                  <select
                    className="inventory-category"
                    aria-label={`Category for ${product.name}`}
                    value={categoryId}
                    onChange={(e) =>
                      setDraftCategory((prev) => ({ ...prev, [product.id]: e.target.value }))
                    }
                  >
                    <option value="">None</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="inventory-price"
                    aria-label={`Price for ${product.name}${rice ? ' (per kg)' : ''}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceVal}
                    onChange={(e) => setDraftPrice((prev) => ({ ...prev, [product.id]: e.target.value }))}
                  />
                  <input
                    className="inventory-stock"
                    aria-label={`Stock for ${product.name}${rice ? ' (kg)' : ''}`}
                    type="number"
                    min="0"
                    step="0.001"
                    value={stockVal}
                    onChange={(e) => setDraftStock((prev) => ({ ...prev, [product.id]: e.target.value }))}
                  />
                  <span className="inventory-unit" title={rice ? 'kg' : (product.unit ?? '')}>
                    {rice ? 'kg' : product.unit}
                  </span>
                  {rice ? (
                    <input
                      className="inventory-sack"
                      aria-label={`Kg per sack for ${product.name}`}
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="—"
                      value={kgPerSackVal}
                      onChange={(e) =>
                        setDraftKgPerSack((prev) => ({ ...prev, [product.id]: e.target.value }))
                      }
                    />
                  ) : (
                    <span className="inventory-sack muted">—</span>
                  )}
                  <button
                    type="button"
                    className="inventory-action"
                    disabled={busy}
                    onClick={() => void saveProduct(product)}
                  >
                    Save
                  </button>
                </div>
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
            <div className="inventory-row inventory-add">
              <label
                className="inventory-color"
                style={{ backgroundColor: productColorHex(newColor) }}
                title={newColor}
              >
                <span className="sr-only">New product color</span>
                <select
                  aria-label="New product color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value as ProductColor)}
                >
                  {PRODUCT_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <input
                className="inventory-name"
                aria-label="New product name"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
              <select
                className="inventory-category"
                aria-label="New product category"
                value={newCategoryId}
                onChange={(e) => setNewCategoryId(e.target.value)}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                className="inventory-price"
                aria-label={newCategoryIsRice ? 'New product price per kg' : 'New product price'}
                type="number"
                min="0"
                step="0.01"
                placeholder={newCategoryIsRice ? '₱/kg' : 'Price'}
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                required
              />
              <input
                className="inventory-stock"
                aria-label={newCategoryIsRice ? 'New product stock kg' : 'New product stock'}
                type="number"
                min="0"
                step="0.001"
                placeholder={newCategoryIsRice ? 'Stock kg' : 'Stock'}
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                required
              />
              {newCategoryIsRice ? (
                <span className="inventory-unit">kg</span>
              ) : (
                <input
                  className="inventory-unit inventory-unit-input"
                  aria-label="New product unit"
                  placeholder="Unit"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  required
                />
              )}
              {newCategoryIsRice ? (
                <input
                  className="inventory-sack"
                  aria-label="New product kg per sack"
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="Kg/sack"
                  value={newKgPerSack}
                  onChange={(e) => setNewKgPerSack(e.target.value)}
                />
              ) : (
                <span className="inventory-sack muted">—</span>
              )}
              <button type="submit" className="inventory-action" disabled={busy || !storeId}>
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
            <div className="inventory-row inventory-add">
              <input
                className="inventory-name"
                aria-label="User UUID"
                value={linkUserId}
                onChange={(e) => setLinkUserId(e.target.value)}
                placeholder="User UUID"
                required
              />
              <select
                className="inventory-unit inventory-unit-input"
                aria-label="Role"
                value={linkRole}
                onChange={(e) => setLinkRole(e.target.value as StaffRole)}
              >
                <option value="cashier">cashier</option>
                <option value="admin">admin</option>
              </select>
              <button type="submit" className="inventory-action" disabled={busy || !storeId || !navigator.onLine}>
                Link
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
