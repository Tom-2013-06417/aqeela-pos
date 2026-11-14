import { useEffect, useId, useRef, useState } from 'react';
import './SideNav.css';

export type AppView =
  | 'cashier'
  | 'sales'
  | 'ledger'
  | 'inventory'
  | 'categories'
  | 'adjustments'
  | 'stores'
  | 'users';

type NavItem = {
  id: AppView;
  label: string;
  /** Inventory + Categories + Adjustments: admin or inventory_manager */
  inventoryAccess?: boolean;
  /** Stores + Users: admin only */
  adminOnly?: boolean;
  /** Cashier register: cashiers only */
  cashierOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'cashier', label: 'Sell', cashierOnly: true },
  { id: 'sales', label: 'Sales' },
  { id: 'ledger', label: 'Balances' },
  { id: 'inventory', label: 'Stock', inventoryAccess: true },
  { id: 'categories', label: 'Categories', inventoryAccess: true },
  { id: 'adjustments', label: 'Stock changes', inventoryAccess: true },
  { id: 'stores', label: 'Stores', adminOnly: true },
  { id: 'users', label: 'Staff', adminOnly: true }
];

function IconCashier() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function IconSales() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15v-4" />
      <path d="M12 15V8" />
      <path d="M16 15v-6" />
    </svg>
  );
}

function IconInventory() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 8l8-4 8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16l8 4 8-4" />
    </svg>
  );
}

function IconCategories() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h13" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconAdjustments() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h13" />
      <path d="M16 9v6" />
      <path d="M14 11l2 2 2-2" />
    </svg>
  );
}

function IconLedger() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M6 4h12v16H6z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

function IconStores() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 9l1.5-4h13L20 9" />
      <path d="M4 9h16v10H4z" />
      <path d="M9 19v-6h6v6" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-2.5 2.5-4.5 6-4.5s6 2 6 4.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M21 19c0-2-1.8-3.5-4-3.8" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
      <path d="M14 12H8" />
      <path d="M16 8l4 4-4 4" />
    </svg>
  );
}

const ICONS: Record<AppView, () => React.ReactNode> = {
  cashier: IconCashier,
  sales: IconSales,
  ledger: IconLedger,
  inventory: IconInventory,
  categories: IconCategories,
  adjustments: IconAdjustments,
  stores: IconStores,
  users: IconUsers
};

export const VIEW_LABELS: Record<AppView, string> = {
  cashier: 'Sell',
  sales: 'Sales',
  ledger: 'Balances',
  inventory: 'Stock',
  categories: 'Categories',
  adjustments: 'Stock changes',
  stores: 'Stores',
  users: 'Staff'
};

/** URL path per tab (label-based): /entry, /log, /stock, … */
export const VIEW_PATHS: Record<AppView, string> = {
  cashier: '/entry',
  sales: '/log',
  ledger: '/balances',
  inventory: '/stock',
  categories: '/categories',
  adjustments: '/adjustments',
  stores: '/stores',
  users: '/staff'
};

const PATH_TO_VIEW = Object.fromEntries(
  (Object.entries(VIEW_PATHS) as [AppView, string][]).map(([view, path]) => [path, view])
) as Record<string, AppView>;

export function normalizePath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function viewFromPath(pathname: string): AppView | null {
  const path = normalizePath(pathname);
  if (path === '/ledger') return 'ledger';
  return PATH_TO_VIEW[path] ?? null;
}

export function pathForView(view: AppView) {
  return VIEW_PATHS[view];
}

export function defaultView(access: {
  canUseCashier: boolean;
  canManageInventory: boolean;
}): AppView {
  if (access.canUseCashier) return 'cashier';
  if (access.canManageInventory) return 'inventory';
  return 'sales';
}

export function isViewAllowed(
  view: AppView,
  access: { isAdmin: boolean; canManageInventory: boolean; canUseCashier: boolean }
) {
  if (view === 'cashier') return access.canUseCashier;
  if (view === 'inventory' || view === 'categories' || view === 'adjustments') {
    return access.canManageInventory;
  }
  if (view === 'stores' || view === 'users') return access.isAdmin;
  return true;
}

export function writeViewPath(view: AppView, mode: 'push' | 'replace') {
  const path = pathForView(view);
  if (normalizePath(window.location.pathname) === path) return;
  const url = `${path}${window.location.search}${window.location.hash}`;
  if (mode === 'replace') window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

export function SideNav({
  view,
  isAdmin,
  canManageInventory,
  canUseCashier,
  collapsed,
  mobileOpen,
  connected,
  hasSynced,
  email,
  signingOut,
  onNavigate,
  onToggle,
  onCloseMobile,
  onSignOut
}: {
  view: AppView;
  isAdmin: boolean;
  canManageInventory: boolean;
  canUseCashier: boolean;
  collapsed: boolean;
  mobileOpen: boolean;
  connected: boolean;
  hasSynced: boolean;
  email?: string;
  signingOut: boolean;
  onNavigate: (view: AppView) => void;
  onToggle: () => void;
  onCloseMobile: () => void;
  onSignOut: () => void;
}) {
  const items = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.inventoryAccess && !canManageInventory) return false;
    if (item.cashierOnly && !canUseCashier) return false;
    return true;
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const showLabels = !collapsed || mobileOpen;

  useEffect(() => {
    if (!confirmOpen && !mobileOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (confirmOpen) {
        setConfirmOpen(false);
        return;
      }
      if (mobileOpen) onCloseMobile();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmOpen, mobileOpen, onCloseMobile]);

  useEffect(() => {
    if (!confirmOpen) return;
    cancelRef.current?.focus();
  }, [confirmOpen]);

  function requestSignOut() {
    if (signingOut) return;
    setConfirmOpen(true);
  }

  function confirmSignOut() {
    setConfirmOpen(false);
    onSignOut();
  }

  function handleNavigate(next: AppView) {
    onNavigate(next);
    onCloseMobile();
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="side-nav-backdrop"
          role="presentation"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`side-nav ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      >
        <div className="side-nav-top">
          <button
            type="button"
            className="side-nav-toggle side-nav-toggle-desktop"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <IconMenu />
          </button>
          <button
            type="button"
            className="side-nav-toggle side-nav-toggle-mobile"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            title="Close"
          >
            <IconMenu />
          </button>
          {showLabels && <span className="side-nav-brand">aqeela</span>}
        </div>

        <nav className="side-nav-links" aria-label="Main">
          {items.map((item) => {
            const Icon = ICONS[item.id];
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`side-nav-link ${active ? 'active' : ''}`}
                onClick={() => handleNavigate(item.id)}
                title={item.label}
                aria-current={active ? 'page' : undefined}
              >
                <Icon />
                {showLabels && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="side-nav-footer">
          <div
            className={`side-nav-status ${connected && hasSynced ? 'ok' : 'warn'}`}
            title={
              connected
                ? hasSynced
                  ? 'Up to date'
                  : 'Updating…'
                : 'No connection'
            }
          >
            <span className="side-nav-dot" />
            {showLabels && (
              <span>
                {connected
                  ? hasSynced
                    ? 'Up to date'
                    : 'Updating…'
                  : navigator.onLine
                    ? 'Connecting…'
                    : 'No internet'}
              </span>
            )}
          </div>
          {showLabels && email && (
            <p className="side-nav-email" title={email}>
              {email}
            </p>
          )}
          <button
            type="button"
            className="side-nav-link"
            disabled={signingOut}
            onClick={requestSignOut}
            title="Sign out"
          >
            <IconSignOut />
            {showLabels && <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>}
          </button>
        </div>
      </aside>

      {confirmOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <p id={titleId} className="modal-message">
              Sign out of this device?
            </p>
            <div className="modal-actions">
              <button
                ref={cancelRef}
                type="button"
                className="modal-cancel"
                onClick={() => setConfirmOpen(false)}
              >
                Stay signed in
              </button>
              <button
                type="button"
                className="modal-confirm"
                disabled={signingOut}
                onClick={confirmSignOut}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
