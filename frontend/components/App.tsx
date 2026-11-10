'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  ShoppingCart,
  Users,
  Truck,
  Settings,
  Plus,
  Search,
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Globe,
  SlidersHorizontal,
  Bell,
  Coins,
  Wallet,
  TriangleAlert,
  Check,
  RefreshCw,
  LogOut,
  Ellipsis,
  Barcode,
  Boxes,
  MapPin,
  Clock,
  MoveRight,
  ShieldCheck,
  Download,
  Database,
  LoaderCircle,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import {
  AppState,
  Page,
  Lang,
  DocKind,
  normalizeSearch,
  Doc,
  Product,
  Party,
  number,
  money,
  priceLabel,
  quantityLabel,
  today,
  balance,
  sum,
  dateLabel,
} from '@/lib/types';
import { translate, activityKey, activityLabel, movementLabel } from '@/lib/i18n';
import { loadState, command, getBackups, getPreferences, saveLanguage } from '@/lib/api';
import { Env, IconButton, Badge, Empty, Field, Submit } from './ui';
import Forms from './Forms';
const navs: {
  id: Page;
  icon: typeof Package;
}[] = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'stock', icon: Package },
  { id: 'sales', icon: ShoppingBag },
  { id: 'purchases', icon: ShoppingCart },
  { id: 'quotes', icon: ShoppingBag },
  { id: 'deliveries', icon: Truck },
  { id: 'customers', icon: Users },
  { id: 'suppliers', icon: Truck },
];
const icons: Record<string, typeof Package> = {
  dashboard: LayoutDashboard,
  stock: Package,
  sales: ShoppingBag,
  purchases: ShoppingCart,
  customers: Users,
  suppliers: Truck,
  settings: Settings,
};
const pageKey: Record<string, string> = {
  dashboard: 'overviewTitle',
  stock: 'stock',
  quotes: 'quotes',
  deliveries: 'deliveries',
  sales: 'sales',
  purchases: 'purchases',
  customers: 'customers',
  suppliers: 'suppliers',
  settings: 'settings',
};
const subKey: Record<string, string> = {
  dashboard: 'overviewSubtitle',
  stock: 'stockSubtitle',
  quotes: 'quotesSubtitle',
  deliveries: 'deliveriesSubtitle',
  sales: 'salesSubtitle',
  purchases: 'purchasesSubtitle',
  customers: 'customerSubtitle',
  suppliers: 'supplierSubtitle',
  settings: 'settingsSubtitle',
};
const initialLetters = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
export default function App() {
  const [s, setS] = useState<AppState | null>(null),
    [lang, setLang] = useState<Lang>('fr'),
    [page, setPage] = useState<Page>('dashboard');
  const [modal, setModal] = useState<{
      kind: string;
      data?: any;
    } | null>(null),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false);
  const [notification, setNotification] = useState<{
      text: string;
      error: boolean;
    } | null>(null),
    [failure, setFailure] = useState('');
  const [preferencesReady, setPreferencesReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const t = translate(lang);
  const notify = useCallback((text: string, error = false) => {
    setNotification({ text, error });
  }, []);
  const refresh = useCallback(async () => {
    try {
      setS(await loadState());
      setFailure('');
    } catch (e) {
      setFailure((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (window.inventoryDesktop) setLang(window.inventoryDesktop.language);
    getPreferences()
      .then((p) => {
        setLang(p.language);
        setPreferencesReady(true);
      })
      .catch(() => {});
    const hash = location.hash.slice(1);
    if (
      [
        'dashboard',
        'stock',
        'sales',
        'purchases',
        'customers',
        'suppliers',
        'quotes',
        'deliveries',
        'settings',
      ].includes(hash)
    )
      setPage(hash as Page);
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (s || failure) window.inventoryDesktop?.ready();
    if (failure) window.inventoryDesktop?.reportError('State load: ' + failure);
  }, [!!s, failure]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = 'ltr';
    document.title = 'Inventory — Stock et comptes';
    if (preferencesReady) void saveLanguage(lang).catch(() => {});
  }, [lang, preferencesReady]);
  useEffect(() => {
    if (!notification) return;
    const timeout = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(timeout);
  }, [notification]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const close = useCallback(() => setModal(null), []);
  const navigate = (p: Page) => {
    setPage(p);
    setQuery('');
    setMobile(false);
    window.history.replaceState(null, '', '#' + p);
  };
  const act = async (path: string, body: any = {}, method = 'POST') => {
    setBusy(true);
    try {
      const r = await command(path, body, method);
      await refresh();
      notify(t('saved'));
      return r;
    } catch (e) {
      const message = (e as Error).message;
      notify(message === 'OFFLINE' ? t('offline') : message, true);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  if (!s)
    return (
      <div className="boot">
        <Brand lang={lang} />
        {!failure && <LoaderCircle className="spin" size={24} />}
        <p role={failure ? 'alert' : undefined}>{t(failure ? 'localDataError' : 'loading')}</p>
        {failure && (
          <div className="button-row">
            <button className="btn primary" onClick={refresh}>
              {t('refresh')}
            </button>
            <button className="btn" onClick={() => void window.inventoryDesktop?.openLog()}>
              {'Ouvrir le journal'}
            </button>
          </div>
        )}
      </div>
    );
  const env: Env = {
    s,
    lang,
    t,
    open: (kind, data) => setModal({ kind, data }),
    close,
    refresh,
    act,
    toast: notify,
    busy,
  };
  const unpaidCount = s.documents.filter((d) => balance(d) > 0 && d.kind === 'sale').length;
  const goNew = () => {
    if (page === 'stock') env.open('product');
    else if (page === 'sales' || page === 'dashboard') env.open('document', { kind: 'sale' });
    else if (page === 'quotes' || page === 'deliveries')
      env.open('document', { kind: page === 'quotes' ? 'quote' : 'delivery' });
    else if (page === 'purchases') env.open('document', { kind: 'purchase' });
    else if (page === 'customers' || page === 'suppliers')
      env.open('party', { kind: page === 'customers' ? 'customer' : 'supplier' });
  };
  return (
    <div className="app-shell">
      {mobile && <div className="sidebar-scrim" onClick={() => setMobile(false)} />}
      <aside className={'sidebar ' + (mobile ? 'open' : '')}>
        <div className="brand-wrap">
          <Brand lang={lang} />
          <IconButton
            label={t('closeMenu')}
            onClick={() => setMobile(false)}
            className="mobile-close icon-button"
          >
            <X size={18} />
          </IconButton>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">I</span>
          <div>
            <strong>{s.settings.company_name}</strong>
            <span>{t('inventoryAccounts')}</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">{t('workspace')}</div>
        <nav aria-label={t('workspace')}>
          {navs.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => navigate(n.id)}
                className={'nav-item ' + (page === n.id ? 'selected' : '')}
                aria-current={page === n.id ? 'page' : undefined}
              >
                <Icon size={19} />
                <span>{t(n.id)}</span>
                {n.id === 'sales' && unpaidCount > 0 && (
                  <span className="nav-count">{unpaidCount}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="nav-label manage-label">{t('manage')}</div>
        <button
          className={'nav-item ' + (page === 'settings' ? 'selected' : '')}
          onClick={() => navigate('settings')}
        >
          <Settings size={19} />
          <span>{t('settings')}</span>
        </button>
        <div className="sidebar-bottom">
          <div className="support-note">
            <div className="small-brand">
              <ShieldCheck size={17} />
            </div>
            <strong>{t('inventoryAccounts')}</strong>
            <span>{'Plus de clarté. Chaque jour.'}</span>
          </div>
          <div className="user-row">
            <div className="avatar">
              <Database size={18} />
            </div>
            <div>
              <strong>{t('desktopApp')}</strong>
              <span>{t('localData')}</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-start">
            <IconButton
              label={t('openMenu')}
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </IconButton>
            <span className="breadcrumb">
              {t('workspace')}
              <ChevronRight size={13} />
              <strong>{t(page)}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                setPage('stock');
              }}
            >
              <Search size={17} />
              <input
                ref={searchRef}
                aria-label={t('searchProducts')}
                placeholder={'Rechercher un produit…'}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value) setPage('stock');
                }}
              />
              <kbd>Ctrl K</kbd>
            </form>
            <IconButton label={t('notifications')} onClick={() => env.open('alerts')}>
              <Bell size={19} />
              <i className="notification-dot" />
            </IconButton>
            <div className="avatar small" title={t('localData')}>
              <Database size={16} />
            </div>
          </div>
        </header>
        <main className="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === 'dashboard' ? t('workspace') : t('inventoryAccounts')}
              </div>
              <h1>{t(pageKey[page])}</h1>
              <p>{t(subKey[page])}</p>
            </div>
            <div className="heading-actions">
              {page === 'dashboard' && (
                <button className="btn" onClick={() => env.open('product')}>
                  <Plus size={16} />
                  {t('addProduct')}
                </button>
              )}
              {page !== 'settings' && (
                <button className="btn primary" onClick={goNew}>
                  <Plus size={18} />
                  {t(
                    page === 'stock'
                      ? 'addProduct'
                      : page === 'quotes'
                        ? 'newQuote'
                        : page === 'deliveries'
                          ? 'newDelivery'
                          : page === 'purchases'
                            ? 'newPurchase'
                            : page === 'customers'
                              ? 'addCustomer'
                              : page === 'suppliers'
                                ? 'addSupplier'
                                : 'newSale',
                  )}
                </button>
              )}
            </div>
          </div>
          {page === 'dashboard' && <Dashboard env={env} navigate={navigate} />}
          {page === 'stock' && <StockPage env={env} query={query} setQuery={setQuery} />}
          {page === 'quotes' && <DocumentsPage key="quote" env={env} kind="quote" />}
          {page === 'deliveries' && <DocumentsPage key="delivery" env={env} kind="delivery" />}
          {(page === 'sales' || page === 'purchases') && (
            <DocumentsPage key={page} env={env} kind={page === 'sales' ? 'sale' : 'purchase'} />
          )}
          {(page === 'customers' || page === 'suppliers') && (
            <PeoplePage
              key={page}
              env={env}
              kind={page === 'customers' ? 'customer' : 'supplier'}
            />
          )}
          {page === 'settings' && <SettingsPage env={env} setLang={setLang} />}
          <footer className="main-footer">
            <span>
              © {new Date().getFullYear()} {'Inventory'}
            </span>
            <span>{t('localData')}</span>
          </footer>
        </main>
      </div>
      {modal && (
        <Forms
          key={modal.kind + String(modal.data?.id || '')}
          env={env}
          kind={modal.kind}
          data={modal.data}
        />
      )}
      {notification && (
        <div role="status" className={'toast ' + (notification.error ? 'error' : '')}>
          {notification.error ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}
          <span>{notification.text}</span>
          <button aria-label={t('close')} onClick={() => setNotification(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Brand({ lang = 'fr' }: { lang?: Lang }) {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <span />
        <span />
        <span />
      </span>
      <span>
        {'inventory'}
        <span className="brand-period">.</span>
      </span>
    </div>
  );
}
export function Status({ d, t }: { d: Doc; t: Env['t'] }) {
  const k =
    d.status === 'draft'
      ? 'draft'
      : d.status === 'reversed'
        ? 'reversed'
        : ['quote', 'delivery'].includes(d.kind)
          ? 'confirmed'
          : balance(d) === 0
            ? 'paid'
            : number(d.paid) > 0
              ? 'partial'
              : 'unpaid';
  return (
    <Badge
      tone={k === 'paid' ? 'green' : k === 'partial' ? 'amber' : k === 'unpaid' ? 'red' : 'neutral'}
    >
      {t(k)}
      {d.due_date && d.due_date < today() && balance(d) > 0 && ' · ' + t('overdue')}
    </Badge>
  );
}
const lowItems = (s: AppState) =>
  s.products
    .filter((p) => p.active)
    .flatMap((p) =>
      s.warehouses
        .filter((w) => w.active)
        .map((w) => ({
          p,
          w,
          qty: number(
            s.stock.find((x) => x.product_id === p.id && x.warehouse_id === w.id)?.quantity,
          ),
        })),
    )
    .filter(
      (x) =>
        x.qty <= number(x.p.threshold) &&
        (x.qty > 0 ||
          s.stock.some((v) => v.product_id === x.p.id && v.warehouse_id === x.w.id) ||
          (!s.stock.some((v) => v.product_id === x.p.id) && x.w.id === s.warehouses[0]?.id)),
    );
function ProductMark({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <span className={'product-mark color-' + (index % 5)}>{name.slice(0, 2).toUpperCase()}</span>
  );
}
function Dashboard({ env, navigate }: { env: Env; navigate: (p: Page) => void }) {
  const { s, t, lang } = env,
    docs = s.documents.filter((d) => d.status === 'confirmed'),
    sales = docs.filter((d) => d.kind === 'sale'),
    purchases = docs.filter((d) => d.kind === 'purchase'),
    todays = sales.filter((d) => (d.issued_at || d.created_at).slice(0, 10) === today()),
    low = lowItems(s);
  const metrics = [
    {
      label: 'salesToday',
      value: sum(todays, (d) => number(d.total)),
      count: todays.length,
      help: 'todayInvoices',
      icon: ShoppingBag,
      currency: true,
    },
    {
      label: 'customersOwe',
      value: sum(
        s.parties.filter((p) => p.kind === 'customer'),
        (p) => Math.max(0, number(p.balance)),
      ),
      count: sales.filter((d) => balance(d) > 0).length,
      help: 'outstandingInvoices',
      icon: Wallet,
      currency: true,
    },
    {
      label: 'oweSuppliers',
      value: sum(
        s.parties.filter((p) => p.kind === 'supplier'),
        (p) => Math.max(0, -number(p.balance)),
      ),
      count: purchases.filter((d) => balance(d) > 0).length,
      help: 'supplierInvoices',
      icon: Coins,
      currency: true,
    },
    {
      label: 'lowStock',
      value: new Set(low.map((x) => x.p.id)).size,
      count: new Set(low.map((x) => x.p.id)).size,
      help: 'needAttention',
      icon: Package,
      currency: false,
    },
  ];
  return (
    <>
      <div className="overview-date">
        <span className="live-dot" />
        {dateLabel(today(), lang)}
        <span className="date-separator" />
        {s.settings.company_name}
      </div>
      <div className="metric-grid">
        {metrics.map((m, i) => {
          const Icon = m.icon;
          return (
            <div className={'metric ' + (i === 0 ? 'featured' : '')} key={m.label}>
              <div className="metric-top">
                <span>{t(m.label)}</span>
                <div className="metric-icon">
                  <Icon size={19} />
                </div>
              </div>
              <div className="metric-number">
                {m.currency ? money(m.value, lang) : m.value}
                {m.currency && <small>{t('MAD')}</small>}
              </div>
              <div className="metric-help">
                {i !== 3 && <strong>{m.count}</strong>} {t(m.help)}
                {i === 3 && m.count > 0 && <span className="attention-dot" />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="dashboard-grid">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>{t('recentSales')}</h2>
              <p>{t('latestTransactions')}</p>
            </div>
            <button className="text-button" onClick={() => navigate('sales')}>
              {t('viewAll')}
              <ArrowRight size={15} />
            </button>
          </div>
          <DocTable
            docs={s.documents.filter((d) => d.kind === 'sale').slice(0, 6)}
            env={env}
            compact
          />
          {s.documents.filter((d) => d.kind === 'sale').length === 0 && (
            <Empty
              title={t('noSales')}
              subtitle={t('noSalesSub')}
              action={t('newSale')}
              onAction={() => env.open('document', { kind: 'sale' })}
            />
          )}
        </section>
        <section className="panel watch-panel">
          <div className="panel-heading">
            <div>
              <h2>
                <span className="amber-icon">
                  <TriangleAlert size={17} />
                </span>
                {t('stockWatch')}
              </h2>
              <p>{t('restockSoon')}</p>
            </div>
            <span className="count-pill">{low.length}</span>
          </div>
          {low.length ? (
            low.slice(0, 4).map((x, i) => (
              <div className="watch-item" key={x.p.id + x.w.id}>
                <ProductMark name={x.p.name} index={i} />
                <div className="watch-item-name">
                  <button onClick={() => env.open('product', x.p)}>{x.p.name}</button>
                  <span>{x.w.name}</span>
                </div>
                <div className="watch-quantity">
                  <strong>
                    {quantityLabel(x.qty, lang)} <small>{t(x.p.unit)}</small>
                  </strong>
                  <span>{t('unitsLeft')}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="healthy">
              <CheckCircle2 size={30} />
              <strong>{t('stockHealthy')}</strong>
              <p>{t('noLowStock')}</p>
            </div>
          )}
          <button className="watch-footer" onClick={() => navigate('stock')}>
            {t('viewAll')}
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>{t('activity')}</h2>
              <p>{t('activitySub')}</p>
            </div>
            <Clock size={18} className="muted" />
          </div>
          <div className="activity-list">
            {s.activity.slice(0, 4).map((a, i) => (
              <div className="activity-item" key={a.id}>
                <span className={'activity-icon ' + (i % 2 === 0 ? 'mint' : 'blue')}>
                  {a.action.startsWith('payment') ? (
                    <Wallet size={16} />
                  ) : a.action.startsWith('product') ? (
                    <Package size={16} />
                  ) : (
                    <ShoppingBag size={16} />
                  )}
                </span>
                <div>
                  <strong>{t(activityKey[a.action] || 'documentSaved')}</strong>
                  <span>{activityLabel(a.action, a.label, lang)}</span>
                </div>
                <time>{dateLabel(a.created_at, lang)}</time>
              </div>
            ))}
            {!s.activity.length && <p className="quiet">{t('emptyActivity')}</p>}
          </div>
        </section>
        <section className="quick-panel">
          <div>
            <span className="quick-label">INVENTORY / {'VOTRE QUOTIDIEN'}</span>
            <h2>{t('quickActions')}</h2>
            <p>{t('quickSub')}</p>
          </div>
          <button onClick={() => env.open('document', { kind: 'purchase' })}>
            <span>
              <ShoppingCart size={19} />
              {t('recordPurchase')}
            </span>
            <ArrowUpRight size={18} />
          </button>
          <button onClick={() => env.open('payment', { partyKind: 'customer' })}>
            <span>
              <Wallet size={19} />
              {t('receivePayment')}
            </span>
            <ArrowUpRight size={18} />
          </button>
          <div className="quick-decoration">
            <Boxes size={100} strokeWidth={0.6} />
          </div>
        </section>
      </div>
    </>
  );
}
function DocTable({ docs, env, compact = false }: { docs: Doc[]; env: Env; compact?: boolean }) {
  const { s, t, lang } = env;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Document</th>
            <th>{t(docs[0]?.kind === 'purchase' ? 'supplier' : 'customer')}</th>
            <th>{t('date')}</th>
            <th className="numeric">{t('amount')}</th>
            <th>{t('status')}</th>
            {!compact && <th>{t('delivery')}</th>}
            <th aria-label={t('actions')} />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td>
                <button className="table-link" onClick={() => env.open('documentDetail', d)}>
                  {d.number || t('draft')}
                </button>
              </td>
              <td>
                <span className="cell-name">
                  {s.parties.find((p) => p.id === d.party_id)?.name || t('walkIn')}
                </span>
              </td>
              <td className="muted nowrap">{dateLabel(d.created_at, lang)}</td>
              <td className="numeric amount">
                {money(d.total, lang)}
                <small> {t('MAD')}</small>
              </td>
              <td>
                <Status d={d} t={t} />
              </td>
              {!compact && (
                <td>
                  <span className={'delivery-status ' + (d.fulfilled ? 'done' : '')}>
                    {d.fulfilled && <Check size={12} />}{' '}
                    {['quote', 'delivery'].includes(d.kind)
                      ? '—'
                      : t(
                          d.kind === 'sale'
                            ? d.fulfilled
                              ? 'delivered'
                              : 'pendingDelivery'
                            : d.fulfilled
                              ? 'received'
                              : 'pendingReceipt',
                        )}
                  </span>
                </td>
              )}
              <td>
                <IconButton label={t('view')} onClick={() => env.open('documentDetail', d)}>
                  <ChevronRight size={16} />
                </IconButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function StockPage({
  env,
  query,
  setQuery,
}: {
  env: Env;
  query: string;
  setQuery: (v: string) => void;
}) {
  const { s, t, lang } = env;
  const [tab, setTab] = useState('products'),
    [cat, setCat] = useState(''),
    [warehouse, setWarehouse] = useState(''),
    [stockFilter, setStockFilter] = useState(''),
    [showRemoved, setShowRemoved] = useState(false),
    [page, setPage] = useState(1);
  const qty = (p: Product) =>
    sum(
      s.stock.filter((x) => x.product_id === p.id && (!warehouse || x.warehouse_id === warehouse)),
      (x) => number(x.quantity),
    );
  const items = s.products.filter(
    (p) =>
      p.active !== showRemoved &&
      (!cat || p.category_id === cat) &&
      (!query ||
        [p.name, p.description, s.categories.find((c) => c.id === p.category_id)?.name].some((x) =>
          normalizeSearch(x || '').includes(normalizeSearch(query)),
        )) &&
      (!stockFilter ||
        (stockFilter === 'low' ? qty(p) <= number(p.threshold) : qty(p) > number(p.threshold))),
  );
  useEffect(() => setPage(1), [query, cat, warehouse, stockFilter, showRemoved, s.products.length]);
  useEffect(
    () => setPage((p) => Math.min(p, Math.max(1, Math.ceil(items.length / 10)))),
    [items.length],
  );
  const shown = items.slice((page - 1) * 10, page * 10);
  return (
    <>
      <div className="tabs">
        {['products', 'categories', 'warehouses', 'movements'].map((k) => (
          <button key={k} onClick={() => setTab(k)} className={tab === k ? 'active' : ''}>
            {t(k)}
            {k === 'products' && <span>{s.products.filter((p) => p.active).length}</span>}
          </button>
        ))}
      </div>
      {tab === 'products' && (
        <section className="panel">
          <div className="table-toolbar">
            <div className="search-control">
              <Search size={17} />
              <input
                type="search"
                aria-label="Rechercher dans le stock"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchProducts')}
              />
            </div>
            <div className="filters">
              <select
                aria-label={t('productVisibility')}
                value={showRemoved ? 'removed' : 'active'}
                onChange={(e) => setShowRemoved(e.target.value === 'removed')}
              >
                <option value="active">{t('active')}</option>
                <option value="removed">{t('removed')}</option>
              </select>
              <select
                aria-label={t('category')}
                value={cat}
                onChange={(e) => setCat(e.target.value)}
              >
                <option value="">{t('allCategories')}</option>
                {s.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={t('warehouse')}
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
              >
                <option value="">{t('allWarehouses')}</option>
                {s.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={t('status')}
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
              >
                <option value="">{t('allStock')}</option>
                <option value="low">{t('low')}</option>
                <option value="good">{t('inStock')}</option>
              </select>
            </div>
          </div>
          <div className="table-scroll">
            <table className="product-table">
              <thead>
                <tr>
                  <th>{t('product')}</th>
                  <th>{t('category')}</th>
                  <th className="numeric">{t('retailPrice')}</th>
                  <th className="numeric">{t('wholesalePrice')}</th>
                  <th>{t('stockLocations')}</th>
                  <th className="numeric">{t('onHand')}</th>
                  <th>{t('status')}</th>
                  <th aria-label={t('actions')} />
                </tr>
              </thead>
              <tbody>
                {shown.map((p, i) => (
                  <tr key={p.id}>
                    <td>
                      <div className="product-cell">
                        <ProductMark name={p.name} index={i} />
                        <div>
                          <button onClick={() => env.open('product', p)}>{p.name}</button>
                          <span>{p.description || t(p.unit)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="category-label">
                        {s.categories.find((c) => c.id === p.category_id)?.name}
                      </span>
                    </td>
                    <td className="numeric amount">
                      {p.price === null ? (
                        <span className="muted">{t('notSet')}</span>
                      ) : (
                        <>
                          {priceLabel(p.price, lang)} <small>{t('MAD')}</small>
                        </>
                      )}
                    </td>
                    <td className="numeric amount">
                      {p.wholesale_price === null ? (
                        <span className="muted">{t('notSet')}</span>
                      ) : (
                        <>
                          {priceLabel(p.wholesale_price, lang)} <small>{t('MAD')}</small>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="stock-locations">
                        {s.stock
                          .filter(
                            (x) =>
                              x.product_id === p.id &&
                              number(x.quantity) > 0 &&
                              (!warehouse || x.warehouse_id === warehouse),
                          )
                          .map((x) => (
                            <span key={x.warehouse_id}>
                              <MapPin size={12} />
                              <span>{s.warehouses.find((w) => w.id === x.warehouse_id)?.name}</span>
                              <strong>
                                {quantityLabel(x.quantity, lang)} <small>{t(p.unit)}</small>
                              </strong>
                            </span>
                          ))}
                        {!s.stock.some(
                          (x) =>
                            x.product_id === p.id &&
                            number(x.quantity) > 0 &&
                            (!warehouse || x.warehouse_id === warehouse),
                        ) && <span className="muted">{t('noStockHere')}</span>}
                      </div>
                    </td>
                    <td className="numeric">
                      <strong>{quantityLabel(qty(p), lang)}</strong>{' '}
                      <small className="muted">{t(p.unit)}</small>
                    </td>
                    <td>
                      <Badge
                        tone={
                          qty(p) === 0 ? 'red' : qty(p) <= number(p.threshold) ? 'amber' : 'green'
                        }
                      >
                        {t(
                          qty(p) === 0
                            ? 'outOfStock'
                            : qty(p) <= number(p.threshold)
                              ? 'low'
                              : 'inStock',
                        )}
                      </Badge>
                    </td>
                    <td>
                      <div className="row-actions">
                        {
                          <IconButton
                            label={t('adjustStock')}
                            onClick={() => env.open('adjust', p)}
                          >
                            <SlidersHorizontal size={16} />
                          </IconButton>
                        }
                        <IconButton label={t('edit')} onClick={() => env.open('product', p)}>
                          <Ellipsis size={19} />
                        </IconButton>
                        {p.active ? (
                          <IconButton
                            label={t('removeProduct')}
                            onClick={() => env.open('removeProduct', p)}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        ) : (
                          <button
                            className="btn small"
                            disabled={env.busy}
                            onClick={async () => {
                              try {
                                await env.act('/products/' + p.id + '/restore');
                              } catch {}
                            }}
                          >
                            {t('restoreProduct')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!items.length && (
            <Empty
              title={t(s.products.length ? 'noResults' : 'noProducts')}
              subtitle={!s.products.length ? t('noProductsSub') : undefined}
              action={t(s.products.length ? 'clearFilters' : 'addProduct')}
              onAction={() => {
                if (s.products.length) {
                  setQuery('');
                  setCat('');
                  setWarehouse('');
                  setStockFilter('');
                  setShowRemoved(false);
                } else env.open('product');
              }}
            />
          )}
          {!!items.length && (
            <div className="pagination">
              <span>
                {t('showing')} {(page - 1) * 10 + 1}–{Math.min(page * 10, items.length)} {t('of')}{' '}
                {items.length} {t('items')}
              </span>
              <div>
                <IconButton
                  label={t('previous')}
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                </IconButton>
                <span>{page}</span>
                <IconButton
                  label={t('next')}
                  disabled={page * 10 >= items.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={16} />
                </IconButton>
              </div>
            </div>
          )}
        </section>
      )}
      {tab === 'categories' && (
        <section className="panel">
          <div className="panel-heading">
            <h2>
              {t('categories')} <span className="muted">{s.categories.length}</span>
            </h2>
            <button className="btn" onClick={() => env.open('category')}>
              <Plus size={16} />
              {t('addCategory')}
            </button>
          </div>
          {s.categories.length ? (
            <div className="category-grid">
              {s.categories.map((c, i) => (
                <div key={c.id} className="category-card">
                  <ProductMark name={c.name} index={i} />
                  <div>
                    <strong>{c.name}</strong>
                    <span>
                      {s.products.filter((p) => p.category_id === c.id).length} {t('products')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title={t('noCategories')} />
          )}
        </section>
      )}
      {tab === 'warehouses' && (
        <section className="panel">
          <div className="panel-heading">
            <h2>{t('warehouses')}</h2>
            {
              <div className="button-row">
                <button className="btn" onClick={() => env.open('transfer')}>
                  <MoveRight size={16} />
                  {t('transferStock')}
                </button>
                <button className="btn" onClick={() => env.open('warehouse')}>
                  <Plus size={16} />
                  {t('addWarehouse')}
                </button>
              </div>
            }
          </div>
          <div className="warehouse-grid">
            {s.warehouses.map((w) => (
              <div className="warehouse-card" key={w.id}>
                <div className="warehouse-icon">
                  <Boxes size={24} />
                </div>
                <h3>{w.name}</h3>
                {!w.active && <Badge tone="neutral">Retiré</Badge>}
                <div className="button-row">
                  <button className="btn small" onClick={() => env.open('warehouse', w)}>
                    Renommer
                  </button>
                  {w.active ? (
                    <button
                      className="btn small danger"
                      onClick={() => env.open('removeWarehouse', w)}
                    >
                      Retirer
                    </button>
                  ) : (
                    <button
                      className="btn small"
                      onClick={() =>
                        void env.act('/warehouses/' + w.id + '/restore').catch(() => {})
                      }
                    >
                      Réactiver
                    </button>
                  )}
                </div>
                <p>
                  <MapPin size={14} />
                  {
                    s.stock.filter((x) => x.warehouse_id === w.id && number(x.quantity) > 0).length
                  }{' '}
                  {t('products')}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
      {tab === 'movements' && (
        <section className="panel">
          <div className="panel-heading">
            <h2>{t('movements')}</h2>
            {
              <button className="btn" onClick={() => env.open('adjust')}>
                <Plus size={16} />
                {t('adjustStock')}
              </button>
            }
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {['product', 'warehouse', 'quantity', 'reason', 'date'].map((k) => (
                    <th key={k}>{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.movements.map((m) => (
                  <tr key={m.id}>
                    <td>{s.products.find((p) => p.id === m.product_id)?.name}</td>
                    <td>{s.warehouses.find((w) => w.id === m.warehouse_id)?.name}</td>
                    <td className={number(m.quantity) > 0 ? 'positive' : 'negative'}>
                      {number(m.quantity) > 0 ? '+' : ''}
                      {quantityLabel(m.quantity, lang)}
                    </td>
                    <td>{movementLabel(m.reason, lang)}</td>
                    <td className="muted">{dateLabel(m.created_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!s.movements.length && <Empty title={t('noMovements')} />}
        </section>
      )}
    </>
  );
}
function DocumentsPage({ env, kind }: { env: Env; kind: DocKind }) {
  const { s, t, lang } = env;
  const aux = ['quote', 'delivery'].includes(kind);
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1);
  const docs = s.documents.filter((d) => d.kind === kind),
    selected = docs.filter(
      (d) =>
        (!query ||
          (d.number || '').toLowerCase().includes(query.toLowerCase()) ||
          (s.parties.find((p) => p.id === d.party_id)?.name || '')
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (!status ||
          (status === 'overdue'
            ? !!d.due_date && d.due_date < today() && balance(d) > 0
            : status === 'unpaid'
              ? balance(d) > 0
              : status === 'paid'
                ? d.status === 'confirmed' && balance(d) === 0
                : d.status === status)),
    );
  return (
    <>
      <div className="mini-stats">
        <div>
          <span>
            {t(
              kind === 'quote'
                ? 'quotes'
                : kind === 'delivery'
                  ? 'deliveries'
                  : kind === 'sale'
                    ? 'sales'
                    : 'purchases',
            )}
          </span>
          <strong>{docs.filter((d) => d.status === 'confirmed').length}</strong>
        </div>
        <div>
          <span>{t('total')}</span>
          <strong>
            {money(
              sum(
                docs.filter((d) => d.status === 'confirmed'),
                (d) => number(d.total),
              ),
              lang,
            )}{' '}
            <small>{t('MAD')}</small>
          </strong>
        </div>
        {!aux && (
          <div>
            <span>{t('remaining')}</span>
            <strong className="amber-text">
              {money(sum(docs, balance), lang)} <small>{t('MAD')}</small>
            </strong>
          </div>
        )}
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-control">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={t('searchInvoices')}
              aria-label={t('searchInvoices')}
            />
          </div>
          <select
            aria-label={t('status')}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('allStatuses')}</option>
            {(aux
              ? ['confirmed', 'draft', 'reversed']
              : ['paid', 'unpaid', 'overdue', 'draft', 'reversed']
            ).map((k) => (
              <option value={k} key={k}>
                {t(k)}
              </option>
            ))}
          </select>
        </div>
        <DocTable docs={selected.slice((page - 1) * 10, page * 10)} env={env} />
        {!selected.length && (
          <Empty
            title={t(
              docs.length
                ? 'noResults'
                : aux
                  ? 'noDocuments'
                  : kind === 'sale'
                    ? 'noSales'
                    : 'noPurchases',
            )}
            subtitle={aux ? undefined : t(kind === 'sale' ? 'noSalesSub' : 'noPurchasesSub')}
            action={t(
              kind === 'quote'
                ? 'newQuote'
                : kind === 'delivery'
                  ? 'newDelivery'
                  : kind === 'sale'
                    ? 'newSale'
                    : 'newPurchase',
            )}
            onAction={() => env.open('document', { kind })}
          />
        )}
        <div className="pagination">
          <span>
            {selected.length} {t('items')}
          </span>
          <div>
            <IconButton
              label={t('previous')}
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </IconButton>
            <span>{page}</span>
            <IconButton
              label={t('next')}
              disabled={page * 10 >= selected.length}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </IconButton>
          </div>
        </div>
      </section>
    </>
  );
}
function PeoplePage({ env, kind }: { env: Env; kind: 'customer' | 'supplier' }) {
  const { s, t, lang } = env,
    [q, setQ] = useState(''),
    [showRemoved, setShowRemoved] = useState(false);
  const parties = s.parties.filter(
    (p) =>
      p.kind === kind &&
      p.active !== showRemoved &&
      (!q || [p.name, p.phone].some((x) => x.toLowerCase().includes(q.toLowerCase()))),
  );
  return (
    <section className="panel">
      <div className="table-toolbar">
        <div className="search-control">
          <Search size={17} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchPeople')}
            aria-label={t('searchPeople')}
          />
        </div>
        <select
          aria-label={t('status')}
          value={showRemoved ? 'removed' : 'active'}
          onChange={(e) => setShowRemoved(e.target.value === 'removed')}
        >
          <option value="active">{t('active')}</option>
          <option value="removed">{t('removed')}</option>
        </select>
        <span className="muted small-text">
          {parties.length} {t(kind === 'customer' ? 'customers' : 'suppliers')}
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {['name', 'phone', 'theyOweYou', 'youOweThem', 'actions'].map((k) => (
                <th key={k}>{t(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parties.map((p, i) => (
              <tr key={p.id}>
                <td>
                  <div className="product-cell">
                    <span className={'avatar person color-' + (i % 5)}>
                      {initialLetters(p.name)}
                    </span>
                    <div>
                      <button onClick={() => env.open('partyDetail', p)}>{p.name}</button>
                      <span>{p.address || '—'}</span>
                    </div>
                  </div>
                </td>
                <td dir="ltr" className="muted">
                  {p.phone || '—'}
                </td>
                <td className="amount">
                  {money(Math.max(0, number(p.balance)), lang)} <small>{t('MAD')}</small>
                </td>
                <td className="positive">
                  {money(Math.max(0, -number(p.balance)), lang)} <small>{t('MAD')}</small>
                </td>
                <td>
                  <div className="button-row">
                    <button
                      className="btn small"
                      onClick={() => env.open('payment', { party_id: p.id })}
                    >
                      <Plus size={14} />
                      {t('addPayment')}
                    </button>
                    {p.active ? (
                      <button
                        className="text-button danger"
                        onClick={() => env.open('removeParty', p)}
                      >
                        {t('remove')}
                      </button>
                    ) : (
                      <button
                        className="btn small"
                        disabled={env.busy}
                        onClick={async () => {
                          try {
                            await env.act('/parties/' + p.id + '/restore');
                          } catch {}
                        }}
                      >
                        {t('restoreAccount')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!parties.length &&
        (showRemoved ? (
          <Empty title={t('noResults')} />
        ) : (
          <Empty
            title={t(q ? 'noResults' : kind === 'customer' ? 'noCustomers' : 'noSuppliers')}
            subtitle={t('peopleHelp')}
            action={t(kind === 'customer' ? 'addCustomer' : 'addSupplier')}
            onAction={() => env.open('party', { kind })}
          />
        ))}
    </section>
  );
}
function SettingsPage({ env, setLang }: { env: Env; setLang: (l: Lang) => void }) {
  const { s, t, lang } = env;
  const [tab, setTab] = useState('company'),
    [form, setForm] = useState({ ...s.settings }),
    [backup, setBackup] = useState<any>(null);
  useEffect(() => setForm({ ...s.settings }), [s.settings]);
  const reloadBackups = () =>
    getBackups()
      .then(setBackup)
      .catch((e) => env.toast(e.message, true));
  useEffect(() => {
    if (tab === 'backups') void reloadBackups();
  }, [tab]);
  useEffect(() => {
    if (tab !== 'backups') return;
    const timer = setInterval(
      () =>
        getBackups()
          .then(setBackup)
          .catch(() => {}),
      10000,
    );
    return () => clearInterval(timer);
  }, [tab]);
  const field = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      <div className="tabs">
        {['company', 'backups'].map((k) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {t(k)}
          </button>
        ))}
      </div>
      {tab === 'company' && (
        <form
          className="panel settings-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await env.act('/settings', form, 'PATCH');
            } catch {}
          }}
        >
          <div className="panel-heading">
            <div>
              <h2>{t('company')}</h2>
              <p>{t('settingsSubtitle')}</p>
            </div>
            <BuildingLogo logo={form.logo} label={t('companyLogo')} />
          </div>
          <div className="settings-body">
            <fieldset className="form-grid settings-fields">
              <Field label={t('companyName')}>
                <input
                  required
                  value={form.company_name}
                  onChange={(e) => field('company_name', e.target.value)}
                />
              </Field>

              <Field label={t('phone')}>
                <input
                  dir="ltr"
                  value={form.phone}
                  onChange={(e) => field('phone', e.target.value)}
                />
              </Field>
              <Field label={t('address')}>
                <input value={form.address} onChange={(e) => field('address', e.target.value)} />
              </Field>
              <Field label={t('companyLogo')} hint={t('companyLogoHelp')}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 300000) {
                      env.toast(t('companyLogoHelp'), true);
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => field('logo', String(reader.result));
                    reader.readAsDataURL(f);
                  }}
                />
              </Field>
            </fieldset>
          </div>
          {
            <div className="form-footer">
              <Submit busy={env.busy}>{t('saveSettings')}</Submit>
            </div>
          }
        </form>
      )}
      {tab === 'backups' && (
        <section className="panel backup-panel">
          <div className="panel-heading">
            <div>
              <h2>{t('weeklyBackups')}</h2>
              <p>{t('backupSchedule')}</p>
            </div>
            <div className="backup-icon">
              <Database size={24} />
            </div>
          </div>
          {
            <div className="settings-body">
              {backup && !backup.enabled && (
                <div className="form-error" role="alert">
                  {t('backupUnavailable')}
                </div>
              )}
              <p>{t('backupRetention')}</p>
              <div className="heading-actions">
                <button
                  className="btn primary"
                  onClick={async () => {
                    try {
                      await env.act('/backups');
                      await reloadBackups();
                    } catch {}
                  }}
                  disabled={env.busy || !backup?.enabled}
                >
                  <Download size={16} />
                  {t('backupNow')}
                </button>
                <button className="btn" onClick={() => void reloadBackups()}>
                  <RefreshCw size={16} />
                  {t('refresh')}
                </button>
                <button
                  className="btn"
                  disabled={env.busy}
                  onClick={async () => {
                    try {
                      const b = await window.inventoryDesktop?.importBackup();
                      if (b) {
                        await reloadBackups();
                        env.open('restore', b);
                      }
                    } catch (e) {
                      env.toast((e as Error).message, true);
                    }
                  }}
                >
                  {t('importBackup')}
                </button>
                <button
                  className="btn"
                  onClick={() => void window.inventoryDesktop?.openDataFolder()}
                >
                  {t('openDataFolder')}
                </button>
              </div>
              <p className="field-hint">{t('backupCopyHelp')}</p>
            </div>
          }
          {backup?.jobs?.length > 0 && (
            <div className="settings-body">
              <h3>{t('backupActivity')}</h3>
              <ul className="backup-jobs">
                {backup.jobs.map((j: any) => (
                  <li key={j.id}>
                    <div>
                      <strong>{t(j.kind === 'restore' ? 'restore' : 'backups')}</strong>
                      <span className="muted">{dateLabel(j.created_at, lang)}</span>
                      <Badge
                        tone={
                          j.status === 'failed' ? 'red' : j.status === 'success' ? 'green' : 'amber'
                        }
                      >
                        {t('job_' + j.status)}
                      </Badge>
                    </div>
                    {j.status === 'failed' && (
                      <p className="form-error" role="alert">
                        {t('backupFailed')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('status')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {(backup?.backups || []).map((b: any) => (
                  <tr key={b.name}>
                    <td>{new Date(b.created_at).toLocaleString('fr-MA')}</td>
                    <td>
                      <Badge tone="green">
                        {t(
                          b.recovery ? 'recoveryCopy' : b.imported ? 'importedCopy' : 'job_success',
                        )}
                      </Badge>
                    </td>
                    <td>
                      <div className="button-row">
                        <button
                          className="btn small"
                          onClick={async () => {
                            try {
                              await window.inventoryDesktop?.exportBackup(b.name);
                            } catch (e) {
                              env.toast((e as Error).message, true);
                            }
                          }}
                        >
                          {t('exportBackup')}
                        </button>
                        <button
                          className="btn small"
                          disabled={!backup?.enabled || env.busy}
                          onClick={() => env.open('restore', b)}
                        >
                          {t('restore')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!(backup?.backups || []).length && (
            <Empty title={t('backupEmpty')} subtitle={t('backupPending')} />
          )}
          <div className="settings-body small-text muted">{t('backupRetention')}</div>
        </section>
      )}
    </>
  );
}
function BuildingLogo({ logo, label }: { logo: string; label: string }) {
  return logo ? (
    <img className="company-logo" src={logo} alt={label} />
  ) : (
    <div className="company-logo-placeholder">
      <Boxes size={27} />
    </div>
  );
}
export { DocTable, lowItems, ProductMark };
