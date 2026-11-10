export type Lang = 'fr';
export type Page =
  | 'dashboard'
  | 'stock'
  | 'sales'
  | 'purchases'
  | 'customers'
  | 'suppliers'
  | 'settings'
  | 'quotes'
  | 'deliveries';
export type Product = {
  id: string;
  name: string;
  category_id: string;
  supplier_id: string | null;
  purchase_cost: string | null;
  description: string;
  unit: string;
  price: string | null;
  wholesale_price: string | null;
  threshold: string;
  active: boolean;
  created_at?: string;
};
export type Party = {
  id: string;
  kind: 'customer' | 'supplier';
  name: string;
  phone: string;
  address: string;
  notes: string;
  active: boolean;
  balance: string;
};
export type Line = {
  id?: string;
  product_id: string | null;
  warehouse_id?: string | null;
  name?: string;
  unit?: string;
  quantity: string;
  price: string | null;
};
export type Doc = {
  id: string;
  kind: DocKind;
  source_id?: string | null;
  notes: string;
  revision: number;
  party_id: string | null;
  warehouse_id: string;
  number: string | null;
  status: 'draft' | 'confirmed' | 'reversed';
  fulfilled: boolean;
  fulfilled_at?: string | null;
  items: Line[];
  subtotal: string;
  discount: string;
  total: string;
  paid: string;
  due_date: string | null;
  language: Lang;
  created_at: string;
  issued_at?: string;
  snapshot?: Record<string, any>;
};
export type Payment = {
  id: string;
  party_id: string | null;
  amount: string;
  available: string;
  paid_at: string;
  method: string;
  direction: 'received' | 'paid';
  notes: string;
  reversed: boolean;
  allocations: {
    document_id: string;
    amount: string;
  }[];
};
export type Receipt = {
  id: string;
  number: string;
  party_id: string | null;
  payment_id: string;
  action: 'payment' | 'allocation' | 'reversal';
  created_at: string;
  details: {
    amount: string;
    direction: 'received' | 'paid';
    paid_at: string;
    method: string;
    notes: string;
    balance_before: string | null;
    balance_after: string | null;
    invoices: {
      document_id: string;
      number: string;
      change: string;
      remaining: string;
    }[];
  };
};
export type Activity = {
  id: string;
  action: string;
  label: string;
  created_at: string;
  actor?: string;
};
export type AppState = {
  schema_version?: number;
  categories: {
    id: string;
    name: string;
  }[];
  warehouses: {
    id: string;
    name: string;
    active: boolean;
  }[];
  products: Product[];
  stock: {
    product_id: string;
    warehouse_id: string;
    quantity: string;
  }[];
  parties: Party[];
  documents: Doc[];
  payments: Payment[];
  receipts: Receipt[];
  movements: {
    id: string;
    product_id: string;
    warehouse_id: string;
    quantity: string;
    reason: string;
    created_at: string;
  }[];
  activity: Activity[];
  settings: {
    company_name: string;
    phone: string;
    address: string;
    logo: string;
  };
};
export const money = (value: string | number, lang: Lang = 'fr') =>
  new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(value),
  );
// Chromium's Intl formatter accepts decimal strings without float conversion.
export const priceLabel = (value: string | number, lang: Lang = 'fr') =>
  new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(
    value as number,
  );
export const quantityLabel = (value: string | number, lang: Lang = 'fr') =>
  new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 3 }).format(Number(value));
export const today = () => new Date().toISOString().slice(0, 10);
export const number = (v: any) => Number(v || 0);
export const balance = (d: Doc) =>
  d.status === 'confirmed' && ['sale', 'purchase'].includes(d.kind)
    ? Math.max(0, number(d.total) - number(d.paid))
    : 0;
export const sum = <T>(rows: T[], fn: (r: T) => number) => rows.reduce((n, r) => n + fn(r), 0);
export const dateLabel = (value: string, lang: Lang = 'fr') =>
  new Intl.DateTimeFormat('fr-MA', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(value.length === 10 ? value + 'T12:00:00' : value),
  );
export function scaled(value: string | null, places: number): bigint {
  const match = String(value || '0').match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return 0n;
  const digits = (match[2] || '0') + (match[3] || ''),
    shift = places + Number(match[4] || 0) - (match[3] || '').length;
  if (Math.abs(shift) > 40) return 0n;
  const absolute = BigInt(digits),
    factor = 10n ** BigInt(Math.abs(shift));
  const result = shift >= 0 ? absolute * factor : (absolute + factor / 2n) / factor;
  return match[1] === '-' ? -result : result;
}
export function totals(items: Line[], discount: string) {
  // Multiply full 6-place prices by 3-place quantities, then round EACH line
  // half-up to cents, exactly like the Python service. Never round the price.
  const subtotal = items.reduce(
    (s, l) => s + (scaled(l.quantity, 3) * scaled(l.price, 6) + 5000000n) / 10000000n,
    0n,
  );
  const off = scaled(discount, 2);
  return {
    subtotal: Number(subtotal) / 100,
    discount: Number(off) / 100,
    total: Number(subtotal - off) / 100,
  };
}
/** Reference cost only: the latest confirmed purchase, falling back to the starting cost. */
export function purchaseReference(s: AppState, p: Product) {
  const purchases = s.documents
    .filter((d) => d.kind === 'purchase' && d.status === 'confirmed')
    .sort(
      (a, b) =>
        (b.issued_at || b.created_at).localeCompare(a.issued_at || a.created_at) ||
        b.created_at.localeCompare(a.created_at) ||
        b.id.localeCompare(a.id),
    );
  for (const d of purchases) {
    const line = d.items.find((l) => l.product_id === p.id && l.price !== null && l.price !== '');
    if (line) return { cost: line.price, fromPurchase: true };
  }
  return { cost: p.purchase_cost ?? null, fromPurchase: false };
}

export type DocKind = 'sale' | 'purchase' | 'quote' | 'delivery';
export const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
