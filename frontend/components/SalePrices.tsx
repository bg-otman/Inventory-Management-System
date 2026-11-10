'use client';
import { useState } from 'react';
import { Env, Modal, Field, Submit } from './ui';
import { Doc, Line, money, number, quantityLabel, totals } from '@/lib/types';
export default function SalePrices({ env, data }: { env: Env; data: Doc }) {
  const { s, t, lang } = env,
    d = s.documents.find((x) => x.id === data.id) || data;
  const [items, setItems] = useState<Line[]>(d.items.map((l) => ({ ...l }))),
    [discount, setDiscount] = useState(d.discount);
  const amounts = totals(items, discount),
    totalCents = Math.round(amounts.total * 100),
    paidCents = Math.round(number(d.paid) * 100);
  const invalid = totalCents < paidCents || (!d.party_id && totalCents !== paidCents);
  return (
    <Modal
      title={t('editSalePrices')}
      subtitle={d.number || undefined}
      close={() => env.open('documentDetail', d)}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (invalid) return;
          try {
            await env.act(
              '/documents/' + d.id + '/prices',
              {
                items: items.map((l) => ({ id: l.id, price: l.price })),
                discount: discount || '0',
              },
              'PATCH',
            );
            env.open('documentDetail', d);
          } catch {}
        }}
      >
        <div className="modal-body">
          <p className="field-hint">{t('priceEditHelp')}</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {['product', 'quantity', 'unitPrice', 'total'].map((k) => (
                    <th key={k}>{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((l, i) => (
                  <tr key={l.id}>
                    <td>
                      {l.name}
                      <small className="warehouse-note">
                        {
                          s.warehouses.find((w) => w.id === (l.warehouse_id || d.warehouse_id))
                            ?.name
                        }
                      </small>
                    </td>
                    <td>
                      {quantityLabel(l.quantity, lang)} {t(l.unit || 'unit')}
                    </td>
                    <td>
                      <input
                        aria-label={t('unitPrice') + ' · ' + l.name}
                        required
                        type="number"
                        min="0"
                        step=".000001"
                        value={l.price ?? ''}
                        onChange={(e) =>
                          setItems((rows) =>
                            rows.map((row, j) =>
                              i === j ? { ...row, price: e.target.value } : row,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>{money(totals([l], '0').total, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="price-edit-summary">
            <Field label={t('discount') + ' · ' + t('MAD')}>
              <input
                required
                type="number"
                min="0"
                max={amounts.subtotal}
                step=".01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </Field>
            <div className="totals-box">
              <div>
                <span>{t('total')}</span>
                <strong>
                  {money(amounts.total, lang)} {t('MAD')}
                </strong>
              </div>
              <div>
                <span>{t('paid')}</span>
                <strong>
                  {money(d.paid, lang)} {t('MAD')}
                </strong>
              </div>
              <div>
                <span>{t('remaining')}</span>
                <strong>
                  {money(Math.max(0, amounts.total - number(d.paid)), lang)} {t('MAD')}
                </strong>
              </div>
            </div>
          </div>
          <p
            className={invalid ? 'field-hint negative' : 'field-hint'}
            role={invalid ? 'alert' : undefined}
          >
            {t(d.party_id ? 'pricePaymentFloor' : 'walkInPriceHelp')}
          </p>
        </div>
        <div className="form-footer">
          <button className="btn" type="button" onClick={() => env.open('documentDetail', d)}>
            {t('cancel')}
          </button>
          <Submit busy={env.busy} disabled={invalid}>
            {t('saveChanges')}
          </Submit>
        </div>
      </form>
    </Modal>
  );
}
