import { useEffect, useId, useRef, useState } from 'react';
import './SideNav.css';

export type AppView = 'cashier' | 'sales' | 'inventory' | 'categories' | 'users';

type NavItem = {
  id: AppView;
  label: string;
  adminOnly?: boolean;
  cashierOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'cashier', label: 'Cashier', cashierOnly: true },
  { id: 'sales', label: 'Sales' },
  { id: 'inventory', label: 'Inventory', adminOnly: true },
  { id: 'categories', label: 'Categories', adminOnly: true },
  { id: 'users', label: 'Users', adminOnly: true }
];

function IconCashier() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h3" />
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
  inventory: IconInventory,
  categories: IconCategories,
  users: IconUsers
};

export function SideNav({
  view,
  isAdmin,
  collapsed,
  connected,
  hasSynced,
  email,
  signingOut,
  onNavigate,
  onToggle,
  onSignOut
}: {
  view: AppView;
  isAdmin: boolean;
  collapsed: boolean;
  connected: boolean;
  hasSynced: boolean;
  email?: string;
  signingOut: boolean;
  onNavigate: (view: AppView) => void;
  onToggle: () => void;
  onSignOut: () => void;
}) {
  const items = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.cashierOnly && isAdmin) return false;
    return true;
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirmOpen) return;
    cancelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setConfirmOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmOpen]);

  function requestSignOut() {
    if (signingOut) return;
    setConfirmOpen(true);
  }

  function confirmSignOut() {
    setConfirmOpen(false);
    onSignOut();
  }

  return (
    <>
    <aside className={`side-nav ${collapsed ? 'collapsed' : ''}`}>
      <div className="side-nav-top">
        <button
          type="button"
          className="side-nav-toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <IconMenu />
        </button>
        {!collapsed && <span className="side-nav-brand">aqeela-pos</span>}
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
              onClick={() => onNavigate(item.id)}
              title={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="side-nav-footer">
        <div className={`side-nav-status ${connected && hasSynced ? 'ok' : 'warn'}`} title={connected ? (hasSynced ? 'Synced' : 'Syncing…') : 'Offline / connecting'}>
          <span className="side-nav-dot" />
          {!collapsed && (
            <span>{connected ? (hasSynced ? 'Synced' : 'Syncing…') : navigator.onLine ? 'Connecting…' : 'Offline'}</span>
          )}
        </div>
        {!collapsed && email && <p className="side-nav-email" title={email}>{email}</p>}
        <button
          type="button"
          className="side-nav-link"
          disabled={signingOut}
          onClick={requestSignOut}
          title="Sign out"
        >
          <IconSignOut />
          {!collapsed && <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>}
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
            Are you sure you want to log out?
          </p>
          <div className="modal-actions">
            <button
              ref={cancelRef}
              type="button"
              className="modal-cancel"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="modal-confirm"
              disabled={signingOut}
              onClick={confirmSignOut}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
