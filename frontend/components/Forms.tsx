import ProductPicker from './ProductPicker';
import { DocumentForm, DocumentDetail } from './Documents';

import React, { useState } from 'react';
import {
  Plus,
  ChevronDown,
  Trash2,
  Printer,
  ArrowRight,
  Wallet,
  Package,
  Check,
  AlertTriangle,
  ArrowUpRight,
  Barcode,
} from 'lucide-react';
import { Env, Modal, Field, Submit, IconButton, Badge, Empty } from './ui';
import {
  Doc,
  Line,
  Product,
  Party,
  Lang,
  number,
  money,
  priceLabel,
  quantityLabel,
  today,
  totals,
  balance,
  sum,
  dateLabel,
  purchaseReference,
} from '@/lib/types';
import { printInvoice } from '@/lib/invoice';
import ProductEditor from './ProductEditor';
import SalePrices from './SalePrices';
import { InlineParty } from './InlineParty';
import { PartyDetail, PaymentForm, PaymentList, ReceiptDetail } from './AccountForms';
import { DocTable, Status, lowItems, ProductMark } from './App';
function Footer({
  env,
  label = 'save',
  children,
  disabled = false,
}: {
  env: Env;
  label?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="form-footer">
      <button type="button" className="btn" onClick={env.close}>
        {env.t('cancel')}
      </button>
      {children}
      <Submit busy={env.busy} disabled={disabled}>
        {env.t(label)}
      </Submit>
    </div>
  );
}
export default function Forms({ env, kind, data }: { env: Env; kind: string; data: any }) {
  switch (kind) {
    case 'product':
      return <ProductForm env={env} data={data} />;
    case 'category':
    case 'warehouse':
      return <NameForm env={env} kind={kind} data={data} />;
    case 'removeWarehouse':
      return <RemoveWarehouse env={env} data={data} />;
    case 'party':
      return <PartyForm env={env} data={data} />;
    case 'adjust':
    case 'transfer':
      return <StockForm env={env} kind={kind} data={data} />;
    case 'document':
      return <DocumentForm env={env} data={data} />;
    case 'documentDetail':
      return <DocumentDetail env={env} data={data} />;
    case 'salePrices':
      return <SalePrices env={env} data={data} />;
    case 'removeProduct':
      return <RemoveProductForm env={env} data={data} />;
    case 'partyDetail':
      return <PartyDetail env={env} data={data} />;
    case 'removeParty':
      return <RemovePartyForm env={env} data={data} />;
    case 'payment':
      return <PaymentForm env={env} data={data || {}} />;
    case 'receiptDetail':
      return <ReceiptDetail env={env} data={data} />;
    case 'reason':
      return <ReasonForm env={env} data={data} />;
    case 'restore':
      return <RestoreForm env={env} data={data} />;
    case 'alerts':
      return (
        <Modal title={env.t('stockWatch')} subtitle={env.t('restockSoon')} close={env.close}>
          <div className="modal-body">
            {lowItems(env.s).map((x, i) => (
              <div className="watch-item" key={x.p.id + x.w.id}>
                <ProductMark name={x.p.name} index={i} />
                <div className="watch-item-name">
                  <button onClick={() => env.open('product', x.p)}>{x.p.name}</button>
                  <span>{x.w.name}</span>
                </div>
                <Badge tone="amber">
                  {x.qty} {env.t(x.p.unit)}
                </Badge>
              </div>
            ))}
            {!lowItems(env.s).length && <Empty title={env.t('stockHealthy')} />}
          </div>
        </Modal>
      );
    default:
      return null;
  }
}
function NameForm({ env, kind, data }: { env: Env; kind: string; data?: any }) {
  return (
    <Modal
      title={
        data ? 'Renommer l’entrepôt' : env.t(kind === 'category' ? 'addCategory' : 'addWarehouse')
      }
      close={env.close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await env.act(
              (kind === 'category' ? '/categories' : '/warehouses') + (data ? '/' + data.id : ''),
              { name: new FormData(e.currentTarget).get('name') },
              data ? 'PATCH' : 'POST',
            );
            env.close();
          } catch {}
        }}
      >
        <div className="modal-body">
          <Field label="Nom">
            <input name="name" required maxLength={120} defaultValue={data?.name} />
          </Field>
        </div>
        <Footer env={env} />
      </form>
    </Modal>
  );
}
function RemoveWarehouse({ env, data }: { env: Env; data: any }) {
  return (
    <Modal title="Retirer l’entrepôt" subtitle={data.name} close={env.close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await env.act('/warehouses/' + data.id, {}, 'DELETE');
            env.close();
          } catch {}
        }}
      >
        <div className="modal-body">
          <p>
            Le stock doit être vide et les opérations en attente terminées. L’historique est
            conservé. Vous pourrez réactiver cet entrepôt.
          </p>
        </div>
        <Footer env={env} label="remove" />
      </form>
    </Modal>
  );
}
function ProductForm({ env, data }: { env: Env; data?: Product }) {
  return (
    <Modal title={env.t(data ? 'edit' : 'addProduct')} close={env.close}>
      <ProductEditor env={env} product={data} onSaved={() => env.close()} onCancel={env.close} />
    </Modal>
  );
}
function RemoveProductForm({ env, data }: { env: Env; data: Product }) {
  const { t } = env;
  return (
    <Modal title={t('removeProduct')} subtitle={data.name} close={env.close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await env.act('/products/' + data.id, {}, 'DELETE');
            env.close();
          } catch {}
        }}
      >
        <div className="modal-body">
          <p>{t('removeProductHelp')}</p>
        </div>
        <Footer env={env} label="remove" />
      </form>
    </Modal>
  );
}
function RemovePartyForm({ env, data }: { env: Env; data: Party }) {
  const { t } = env;
  return (
    <Modal
      title={t(data.kind === 'customer' ? 'removeCustomer' : 'removeSupplier')}
      subtitle={data.name}
      close={env.close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await env.act('/parties/' + data.id, {}, 'DELETE');
            env.close();
          } catch {}
        }}
      >
        <div className="modal-body">
          <p>{t('removePartyHelp')}</p>
        </div>
        <Footer env={env} label="remove" />
      </form>
    </Modal>
  );
}
function PartyForm({ env, data }: { env: Env; data: any }) {
  const { t } = env,
    kind = data?.kind || 'customer';
  return (
    <Modal
      title={t(data?.id ? 'edit' : kind === 'customer' ? 'addCustomer' : 'addSupplier')}
      subtitle={t('peopleHelp')}
      close={env.close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await env.act(
              '/parties' + (data?.id ? '/' + data.id : ''),
              {
                kind,
                name: f.get('name'),
                phone: f.get('phone') || '',
                address: f.get('address') || '',
                notes: f.get('notes') || '',
              },
              data?.id ? 'PATCH' : 'POST',
            );
            env.close();
          } catch {}
        }}
      >
        <div className="modal-body">
          <Field label={t('fullName') + ' *'}>
            <input name="name" defaultValue={data?.name} required maxLength={200} />
          </Field>
          <Field label={t('phone')}>
            <input name="phone" dir="ltr" defaultValue={data?.phone} maxLength={100} />
          </Field>
          <Field label={t('address')}>
            <input name="address" defaultValue={data?.address} maxLength={500} />
          </Field>
          <Field label={t('notes')}>
            <textarea name="notes" defaultValue={data?.notes} rows={3} />
          </Field>
        </div>
        <Footer env={env} />
      </form>
    </Modal>
  );
}
function StockForm({ env, kind, data }: { env: Env; kind: string; data?: Product }) {
  const { s, t } = env;
  const [productId, setProductId] = useState(data?.id || ''),
    [productName, setProductName] = useState(data?.name || '');
  return (
    <Modal title={t(kind === 'transfer' ? 'transferStock' : 'adjustStock')} close={env.close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            if (!productId) {
              env.toast('Choisissez un produit du catalogue.', true);
              return;
            }
            const body = { ...Object.fromEntries(f.entries()), product_id: productId };
            await env.act('/stock/' + kind, body);
            env.close();
          } catch {}
        }}
      >
        <div className="modal-body">
          <Field label={t('product')}>
            <ProductPicker
              products={s.products}
              value={productId || null}
              name={productName}
              onChange={(id, name) => {
                setProductId(id || '');
                setProductName(name);
              }}
            />
          </Field>
          <Field label={t(kind === 'transfer' ? 'from' : 'warehouse')}>
            <select name={kind === 'transfer' ? 'from_warehouse_id' : 'warehouse_id'} required>
              {s.warehouses
                .filter((w) => w.active)
                .map((w) => (
                  <option value={w.id} key={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </Field>
          {kind === 'transfer' && (
            <Field label={t('to')}>
              <select name="to_warehouse_id" defaultValue={s.warehouses[1]?.id} required>
                {s.warehouses
                  .filter((w) => w.active)
                  .map((w) => (
                    <option value={w.id} key={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label={t('quantity')} hint={kind === 'adjust' ? t('quantityHelp') : undefined}>
            <input
              name="quantity"
              type="number"
              step=".001"
              min={kind === 'transfer' ? 0.001 : undefined}
              required
            />
          </Field>
          {kind === 'adjust' && (
            <Field label={t('reason')}>
              <input name="reason" required placeholder={t('reasonPlaceholder')} />
            </Field>
          )}
        </div>
        <Footer env={env} />
      </form>
    </Modal>
  );
}
function ReasonForm({ env, data }: { env: Env; data: any }) {
  const { t } = env;
  return (
    <Modal title={t(data.label)} subtitle={data.help ? t(data.help) : undefined} close={env.close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await env.act(data.path, {
              reason: new FormData(e.currentTarget).get('reason'),
              language: env.lang,
            });
            if (r.receipt_id) env.open('receiptDetail', { id: r.receipt_id });
            else env.close();
          } catch {}
        }}
      >
        <div className="modal-body">
          <Field label={t('reason')}>
            <textarea name="reason" required minLength={1} maxLength={500} rows={3} />
          </Field>
        </div>
        <Footer env={env} label={data.label} />
      </form>
    </Modal>
  );
}
function RestoreForm({ env, data }: { env: Env; data: any }) {
  const { t } = env;
  return (
    <Modal title={t('restore')} subtitle={dateLabel(data.created_at, env.lang)} close={env.close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await env.act('/backups/restore', {
              backup: data.name,
              confirmed: f.get('confirmed') === 'on',
            });
            env.toast(t('restoreQueued'));
            env.close();
          } catch {}
        }}
      >
        <div className="modal-body">
          <div className="warning-callout">
            <AlertTriangle size={22} />
            <p>{t('restoreHelp')}</p>
          </div>
          <label className="check-row">
            <input type="checkbox" name="confirmed" required />
            {t('restoreConfirm')}
          </label>
        </div>
        <Footer env={env} label="restore" />
      </form>
    </Modal>
  );
}
