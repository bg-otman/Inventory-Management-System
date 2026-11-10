'use client';
import React, { useRef, useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { Env, Field } from './ui';
import { Product, number, sum, totals, money, quantityLabel } from '@/lib/types';
import { InlineParty } from './InlineParty';
export type SavedProduct = {
  id: string;
  name: string;
  price: string;
  wholesale_price: string;
  purchase_cost: string;
};
export default function ProductEditor({
  env,
  product,
  insidePurchase = false,
  supplierId = '',
  warehouseId = '',
  inline = false,
  onSaved,
  onCancel,
}: {
  env: Env;
  product?: Product;
  insidePurchase?: boolean;
  supplierId?: string;
  warehouseId?: string;
  inline?: boolean;
  onSaved: (p: SavedProduct) => void;
  onCancel: () => void;
}) {
  const { s, t, lang } = env,
    root = useRef<HTMLDivElement>(null);
  const [f, setF] = useState({
    name: product?.name || '',
    category_id: product?.category_id || '',
    supplier_id: product?.supplier_id || supplierId,
    purchase_cost: product?.purchase_cost ?? '',
    price: product?.price ?? '',
    wholesale_price: product?.wholesale_price ?? '',
    unit: product?.unit || 'unit',
    description: product?.description || '',
    threshold: product?.threshold || '0',
    active: product?.active ?? true,
  });
  const [existing, setExisting] = useState(false),
    [quantity, setQuantity] = useState('1'),
    [warehouse, setWarehouse] = useState(
      warehouseId || s.warehouses.find((w) => w.active)?.id || '',
    );
  const [more, setMore] = useState(!!product),
    [newCategory, setNewCategory] = useState(false),
    [category, setCategory] = useState(''),
    [newSupplier, setNewSupplier] = useState(false);
  const [payment, setPayment] = useState('0'),
    [discount, setDiscount] = useState('0'),
    [due, setDue] = useState(''),
    [received, setReceived] = useState(true),
    [invoiceReady, setInvoiceReady] = useState(true);
  const purchase = !product && !insidePurchase && !existing,
    whole = ['unit', 'piece', 'carton'].includes(f.unit);
  const amounts = totals([{ product_id: 'new', quantity, price: f.purchase_cost }], discount);
  const set = (key: string, value: string) => setF((v) => ({ ...v, [key]: value }));
  async function save() {
    if (newSupplier || newCategory) {
      env.toast(t('finishInlineEntry'), true);
      return;
    }
    const fields = root.current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('input,select,textarea');
    if (fields && ![...fields].every((field) => field.reportValidity())) return;
    const body = {
      ...f,
      supplier_id: f.supplier_id || null,
      price: f.price === '' ? null : f.price,
      wholesale_price: f.wholesale_price === '' ? null : f.wholesale_price,
      purchase_cost: f.purchase_cost === '' ? null : f.purchase_cost,
      threshold: f.threshold || '0',
      ...(!product
        ? {
            stock_mode: insidePurchase ? 'catalog' : existing ? 'existing' : 'purchase',
            opening_quantity: insidePurchase ? '0' : quantity,
            warehouse_id: warehouse || null,
            discount: purchase ? discount || '0' : '0',
            payment: purchase && invoiceReady ? payment || '0' : '0',
            due_date: purchase ? due || null : null,
            language: lang,
            fulfill: received,
            invoice_ready: invoiceReady,
          }
        : {}),
    };
    try {
      const saved = await env.act(
        '/products' + (product ? '/' + product.id : ''),
        body,
        product ? 'PATCH' : 'POST',
      );
      onSaved({
        id: saved.id,
        name: f.name,
        price: f.price,
        wholesale_price: f.wholesale_price,
        purchase_cost: f.purchase_cost,
      });
    } catch {}
  }
  return (
    <div
      ref={root}
      className={inline ? 'inline-supplier product-editor' : 'product-editor'}
      onKeyDown={(e) => {
        if (
          e.key === 'Enter' &&
          !(e.target instanceof HTMLTextAreaElement) &&
          !(e.target instanceof HTMLButtonElement)
        ) {
          e.preventDefault();
          if (!inline) void save();
        }
      }}
    >
      <div className={inline ? '' : 'modal-body'}>
        {inline && <h3>{t('createProduct')}</h3>}
        {insidePurchase && <p className="field-hint">{t('catalogHelp')}</p>}
        <Field label={t('productName') + ' *'}>
          <input
            required
            maxLength={200}
            value={f.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label={t('category') + ' *'}>
          <select
            required
            value={f.category_id}
            onChange={(e) => {
              if (e.target.value === '__new') setNewCategory(true);
              else set('category_id', e.target.value);
            }}
          >
            <option value="">{t('selectCategory')}</option>
            {s.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new">＋ {t('createCategory')}</option>
          </select>
        </Field>
        {newCategory && (
          <div className="inline-category">
            <input
              aria-label={t('categoryName')}
              placeholder={t('categoryName')}
              maxLength={120}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <button
              type="button"
              className="btn small primary"
              disabled={env.busy || !category.trim()}
              onClick={async () => {
                try {
                  const r = await env.act('/categories', { name: category });
                  set('category_id', r.id);
                  setNewCategory(false);
                  setCategory('');
                } catch {}
              }}
            >
              {t('create')}
            </button>
            <button type="button" className="text-button" onClick={() => setNewCategory(false)}>
              {t('cancel')}
            </button>
          </div>
        )}
        {!product && !insidePurchase && (
          <>
            <label className="check-row">
              <input
                type="checkbox"
                checked={existing}
                onChange={(e) => setExisting(e.target.checked)}
              />
              {t('alreadyExisting')}
            </label>
            <p className="field-hint">
              {t(existing ? 'existingStockHelp' : 'newProductPurchaseHelp')}
            </p>
          </>
        )}
        <div className="form-grid">
          <Field label={t('unit')}>
            <select value={f.unit} onChange={(e) => set('unit', e.target.value)}>
              {['unit', 'piece', 'kg', 'meter', 'carton', 'liter'].map((k) => (
                <option key={k} value={k}>
                  {t(k)}
                </option>
              ))}
            </select>
          </Field>
          {!product && !insidePurchase && (
            <Field label={t(existing ? 'openingQuantity' : 'quantity') + ' *'}>
              <input
                required
                type="number"
                min={purchase ? (whole ? '1' : '.001') : '0'}
                step={whole ? '1' : '.001'}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
          )}
          {product && (
            <Field label={t('onHand')} hint={t('editQuantityHelp')}>
              <input
                readOnly
                value={
                  quantityLabel(
                    sum(
                      s.stock.filter((x) => x.product_id === product.id),
                      (x) => number(x.quantity),
                    ),
                    lang,
                  ) +
                  ' ' +
                  t(f.unit)
                }
              />
            </Field>
          )}
        </div>
        {!product && !insidePurchase && (
          <Field label={t('warehouse')}>
            <select required value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
              {s.warehouses
                .filter((w) => w.active)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label={t('supplier') + (purchase ? ' *' : ' · ' + t('optional'))}>
          <select
            required={purchase}
            disabled={insidePurchase}
            value={newSupplier ? '__new' : f.supplier_id}
            onChange={(e) => {
              if (e.target.value === '__new') setNewSupplier(true);
              else {
                set('supplier_id', e.target.value);
                setNewSupplier(false);
              }
            }}
          >
            <option value="">{t('selectSupplier')}</option>
            {s.parties
              .filter((p) => p.kind === 'supplier' && (p.active || p.id === product?.supplier_id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {!p.active ? ' · ' + t('removed') : ''}
                </option>
              ))}
            <option value="__new">＋ {t('createSupplier')}</option>
          </select>
        </Field>
        {!insidePurchase && !newSupplier && (
          <button
            type="button"
            className="text-button inline-create"
            onClick={() => setNewSupplier(true)}
          >
            <Plus size={14} />
            {t('createSupplier')}
          </button>
        )}
        {newSupplier && (
          <InlineParty
            env={env}
            kind="supplier"
            onCancel={() => setNewSupplier(false)}
            onCreated={(id) => {
              set('supplier_id', id);
              setNewSupplier(false);
            }}
          />
        )}
        <div className="form-grid">
          <Field
            label={t('purchaseCost') + ' · ' + t('MAD') + (purchase && invoiceReady ? ' *' : '')}
          >
            <input
              required={purchase && invoiceReady}
              type="number"
              min="0"
              step=".000001"
              value={f.purchase_cost}
              onChange={(e) => set('purchase_cost', e.target.value)}
              placeholder={t('notSet')}
            />
          </Field>
          <Field label={t('retailPrice') + ' · ' + t('MAD')}>
            <input
              type="number"
              min="0"
              step=".000001"
              value={f.price}
              onChange={(e) => set('price', e.target.value)}
              placeholder={t('optional')}
            />
          </Field>
          <Field label={t('wholesalePrice') + ' · ' + t('MAD')} hint={t('sameUnitPriceHelp')}>
            <input
              type="number"
              min="0"
              step=".000001"
              value={f.wholesale_price}
              onChange={(e) => set('wholesale_price', e.target.value)}
              placeholder={t('optional')}
            />
          </Field>
        </div>
        <p className="field-hint">{t('pricePrecisionHelp')}</p>
        {purchase && (
          <>
            <div className="form-grid">
              <Field label={t('discount')}>
                <input
                  type="number"
                  min="0"
                  step=".01"
                  max={amounts.subtotal}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </Field>
              <Field label={t('dueDate')}>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </Field>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={received}
                onChange={(e) => setReceived(e.target.checked)}
              />
              {t('receivedNow')}
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={invoiceReady}
                onChange={(e) => setInvoiceReady(e.target.checked)}
              />
              {t('supplierInvoiceReady')}
            </label>
            {invoiceReady && (
              <div className="totals-box">
                <div>
                  <span>{t('total')}</span>
                  <strong>
                    {money(amounts.total, lang)} {t('MAD')}
                  </strong>
                </div>
                <Field label={t('paymentNow')}>
                  <input
                    type="number"
                    min="0"
                    max={Math.max(0, amounts.total)}
                    step=".01"
                    value={payment}
                    onChange={(e) => setPayment(e.target.value)}
                  />
                </Field>
                <div>
                  <span>{t('remaining')}</span>
                  <strong>
                    {money(Math.max(0, amounts.total - number(payment)), lang)} {t('MAD')}
                  </strong>
                </div>
              </div>
            )}
          </>
        )}
        <button
          type="button"
          className="disclosure"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
        >
          {t('moreDetails')}
          <ChevronDown size={17} className={more ? 'rotate' : ''} />
        </button>
        {more && (
          <div className="optional-fields">
            <Field label={t('description')}>
              <textarea
                maxLength={4000}
                rows={2}
                value={f.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
            <div className="form-grid">
              <Field label={t('threshold')}>
                <input
                  type="number"
                  min="0"
                  step=".001"
                  value={f.threshold}
                  onChange={(e) => set('threshold', e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}
      </div>
      <div className={inline ? 'button-row' : 'form-footer'}>
        <button type="button" className="btn" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={env.busy || newSupplier || newCategory}
          onClick={() => void save()}
        >
          {t(product ? 'saveChanges' : 'saveProduct')}
        </button>
      </div>
    </div>
  );
}
