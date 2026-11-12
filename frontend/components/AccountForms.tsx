'use client';
import React, { useState } from 'react';
import { Plus, Printer } from 'lucide-react';
import { Env, Modal, Field, Submit, Badge } from './ui';
import { Doc, Party, number, money, today, balance, sum, dateLabel } from '@/lib/types';
import { printReceipt } from '@/lib/invoice';
import { DocTable } from './App';
function BalanceValue({ env, value }: { env: Env; value: string | number }) {
  const n = number(value);
  return (
    <>
      <span>{env.t(n > 0 ? 'theyOweYou' : n < 0 ? 'youOweThem' : 'settled')}</span>
      <strong>
        {money(Math.abs(n), env.lang)} <small>{env.t('MAD')}</small>
      </strong>
    </>
  );
}
export function PartyDetail({ env, data }: { env: Env; data: Party }) {
  const { s, t, lang } = env,
    p = s.parties.find((p) => p.id === data.id) || data,
    docs = s.documents.filter((d) => d.party_id === p.id && ['sale', 'purchase'].includes(d.kind));
  const available = sum(
    s.payments.filter(
      (x) => x.party_id === p.id && x.direction === (p.kind === 'customer' ? 'received' : 'paid'),
    ),
    (x) => number(x.available),
  );
  const receipts = s.receipts.filter((r) => r.party_id === p.id);
  return (
    <Modal
      title={p.name}
      subtitle={[p.phone, p.address].filter(Boolean).join(' · ')}
      close={env.close}
      wide
    >
      <div className="modal-body">
        {!p.active && <Badge tone="neutral">{t('removed')}</Badge>}
        <div className="account-summary">
          <div>
            <span>{t('theyOweYou')}</span>
            <strong>
              {money(Math.max(0, number(p.balance)), lang)} <small>{t('MAD')}</small>
            </strong>
          </div>
          <div>
            <span>{t('youOweThem')}</span>
            <strong>
              {money(Math.max(0, -number(p.balance)), lang)} <small>{t('MAD')}</small>
            </strong>
          </div>
        </div>
        <p className="field-hint">{t('netBalanceHelp')}</p>
        <div className="detail-actions">
          {p.kind === 'customer' && p.active && (
            <button
              className="btn"
              onClick={() =>
                env.open('document', { kind: 'sale', party_id: p.id, standalone: true })
              }
            >
              <Plus size={16} /> Nouveau document sans stock
            </button>
          )}
          <button className="btn primary" onClick={() => env.open('payment', { party_id: p.id })}>
            <Plus size={16} />
            {t('addPayment')}
          </button>
          {available > 0 && (
            <button
              className="btn"
              onClick={() => env.open('payment', { party_id: p.id, apply: true })}
            >
              {t('applyDeposit')} · {money(available, lang)} {t('MAD')}
            </button>
          )}
          <button className="btn" onClick={() => env.open('party', p)}>
            {t('edit')}
          </button>
          {p.active ? (
            <button className="btn danger" onClick={() => env.open('removeParty', p)}>
              {t(p.kind === 'customer' ? 'removeCustomer' : 'removeSupplier')}
            </button>
          ) : (
            <button
              className="btn"
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
        {p.notes && <p className="quiet">{p.notes}</p>}
        <h3 className="section-caption">{t('transactionHistory')}</h3>
        <DocTable docs={docs} env={env} compact />
        {p.kind === 'customer' && (
          <>
            <h3 className="section-caption">Devis de ce client</h3>
            <button
              className="btn small"
              onClick={() => env.open('document', { kind: 'quote', party_id: p.id })}
            >
              Nouveau devis
            </button>
            <DocTable
              docs={s.documents.filter((d) => d.party_id === p.id && d.kind === 'quote')}
              env={env}
              compact
            />
            <h3 className="section-caption">Bons de livraison</h3>
            <DocTable
              docs={s.documents.filter((d) => d.party_id === p.id && d.kind === 'delivery')}
              env={env}
              compact
            />
          </>
        )}
        <h3 className="section-caption">{t('paymentHistory')}</h3>
        <PaymentList env={env} party={p} />
        {receipts.length > 0 && (
          <>
            <h3 className="section-caption">{t('operationReceipts')}</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {['receipt', 'date', 'operation', 'amount'].map((k) => (
                      <th key={k}>{t(k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <button
                          className="table-link"
                          onClick={() => env.open('receiptDetail', { id: r.id })}
                        >
                          {r.number}
                        </button>
                      </td>
                      <td>{dateLabel(r.created_at, lang)}</td>
                      <td>
                        {t(
                          r.action === 'payment'
                            ? r.details.direction === 'received'
                              ? 'moneyReceived'
                              : 'moneyPaid'
                            : r.action === 'allocation'
                              ? 'creditApplied'
                              : 'paymentReversed',
                        )}
                      </td>
                      <td className="amount">
                        {money(r.details.amount, lang)} {t('MAD')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
export function PaymentList({ env, party, document }: { env: Env; party?: Party; document?: Doc }) {
  const { s, t, lang } = env,
    payments = s.payments.filter((p) =>
      party ? p.party_id === party.id : p.allocations.some((a) => a.document_id === document?.id),
    );
  if (!payments.length) return <p className="quiet">{t('noPayments')}</p>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {['date', 'direction', 'amount', 'method', 'status', 'actions'].map((k) => (
              <th key={k}>{t(k)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const receipt = s.receipts.find((r) => r.payment_id === p.id && r.action === 'payment');
            return (
              <tr key={p.id}>
                <td>{dateLabel(p.paid_at, lang)}</td>
                <td>{t(p.direction === 'received' ? 'moneyReceived' : 'moneyPaid')}</td>
                <td className="amount">
                  {money(p.amount, lang)} {t('MAD')}
                </td>
                <td>{t(p.method)}</td>
                <td>
                  <Badge tone={p.reversed ? 'neutral' : 'green'}>
                    {t(p.reversed ? 'reversed' : 'recorded')}
                  </Badge>
                </td>
                <td>
                  <div className="button-row">
                    {receipt && (
                      <button
                        className="text-button"
                        onClick={() => env.open('receiptDetail', { id: receipt.id })}
                      >
                        {t('receipt')}
                      </button>
                    )}
                    {!p.reversed && (
                      <button
                        className="text-button danger"
                        onClick={() =>
                          env.open('reason', {
                            path: '/payments/' + p.id + '/reverse',
                            label: 'reversePayment',
                          })
                        }
                      >
                        {t('reversePayment')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function PaymentForm({ env, data }: { env: Env; data: any }) {
  const { s, t, lang } = env,
    [party, setParty] = useState(data.party_id || '');
  const selected = s.parties.find((p) => p.id === party);
  const defaultDirection = (p?: Party) =>
    p && number(p.balance) !== 0
      ? number(p.balance) > 0
        ? 'received'
        : 'paid'
      : p?.kind === 'supplier'
        ? 'paid'
        : 'received';
  const [direction, setDirection] = useState<'received' | 'paid'>(
    data.document
      ? data.document.kind === 'sale'
        ? 'received'
        : 'paid'
      : defaultDirection(selected),
  );
  const [amount, setAmount] = useState(data.document ? String(balance(data.document)) : ''),
    [paymentId, setPaymentId] = useState(''),
    [alloc, setAlloc] = useState<Record<string, string>>({});
  const deposits = s.payments.filter(
      (p) =>
        p.party_id === party &&
        !p.reversed &&
        number(p.available) > 0 &&
        p.direction === (selected?.kind === 'supplier' ? 'paid' : 'received'),
    ),
    deposit = deposits.find((p) => p.id === paymentId);
  const maxAmount = data.apply ? number(deposit?.available) : number(amount),
    allocated = sum(Object.values(alloc), number);
  const docs = s.documents
    .filter((d) => d.party_id === party && balance(d) > 0)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const before = number(selected?.balance),
    after =
      (Math.round(before * 100) +
        (data.apply ? 0 : Math.round(number(amount) * 100) * (direction === 'received' ? -1 : 1))) /
      100;
  const auto = () => {
    let left = Math.round(maxAmount * 100);
    const next: Record<string, string> = {};
    for (const d of docs) {
      const n = Math.min(left, Math.round(balance(d) * 100));
      if (n > 0) next[d.id] = (n / 100).toFixed(2);
      left -= n;
    }
    setAlloc(next);
  };
  return (
    <Modal title={t(data.apply ? 'applyDeposit' : 'addPayment')} close={env.close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (maxAmount <= 0 || (data.apply && (allocated > maxAmount || allocated <= 0))) {
            env.toast(t('allocationError'), true);
            return;
          }
          const f = new FormData(e.currentTarget),
            allocations = Object.entries(alloc)
              .filter(([, a]) => number(a) > 0)
              .map(([document_id, a]) => ({ document_id, amount: a }));
          try {
            const r = data.apply
              ? await env.act('/payments/' + paymentId + '/allocate', {
                  allocations,
                  language: lang,
                })
              : await env.act('/payments', {
                  party_id: party,
                  amount,
                  paid_at: f.get('paid_at'),
                  method: f.get('method'),
                  direction,
                  notes: f.get('notes') || '',
                  language: lang,
                  auto_allocate: true,
                  preferred_document_id:
                    data.document?.party_id === party ? data.document.id : null,
                });
            env.open('receiptDetail', { id: r.receipt_id });
          } catch {}
        }}
      >
        <div className="modal-body">
          <Field label={t('account')}>
            <select
              required
              value={party}
              onChange={(e) => {
                setParty(e.target.value);
                setDirection(defaultDirection(s.parties.find((p) => p.id === e.target.value)));
                setAlloc({});
                setPaymentId('');
              }}
            >
              <option value="">{t('account')}</option>
              {s.parties
                .filter(
                  (p) =>
                    (!data.partyKind || p.kind === data.partyKind) &&
                    (p.active || p.id === data.party_id),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
          {selected && (
            <div className="account-summary">
              <div>
                <BalanceValue env={env} value={before} />
              </div>
            </div>
          )}
          {data.apply ? (
            <>
              <Field label={t('chooseDeposit')}>
                <select
                  required
                  value={paymentId}
                  onChange={(e) => {
                    setPaymentId(e.target.value);
                    setAlloc({});
                  }}
                >
                  <option value="">{t('chooseDeposit')}</option>
                  {deposits.map((p) => (
                    <option value={p.id} key={p.id}>
                      {dateLabel(p.paid_at, lang)} · {money(p.available, lang)} {t('MAD')}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="allocation-heading">
                <strong>{t('allocate')}</strong>
                <button type="button" className="text-button" disabled={!maxAmount} onClick={auto}>
                  {t('applyOldest')}
                </button>
              </div>
              {docs.map((d) => (
                <div className="allocation-row" key={d.id}>
                  <div>
                    <strong>{d.number}</strong>
                    <span>
                      {t('remaining')}: {money(balance(d), lang)} {t('MAD')}
                    </span>
                  </div>
                  <input
                    aria-label={d.number || d.id}
                    type="number"
                    min="0"
                    step=".01"
                    max={balance(d)}
                    value={alloc[d.id] || ''}
                    placeholder="0.00"
                    onChange={(e) => setAlloc((a) => ({ ...a, [d.id]: e.target.value }))}
                  />
                </div>
              ))}
              {!docs.length && <p className="quiet">{t('allPaid')}</p>}
              <div className="payment-summary">
                <span>{t('unallocated')}</span>
                <strong>
                  {money(maxAmount - allocated, lang)} {t('MAD')}
                </strong>
              </div>
            </>
          ) : (
            <>
              <Field label={t('direction')}>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as 'received' | 'paid')}
                >
                  <option value="received">{t('iReceivedMoney')}</option>
                  <option value="paid">{t('iPaidMoney')}</option>
                </select>
              </Field>
              <div className="form-grid">
                <Field label={t('paymentAmount')}>
                  <input
                    required
                    type="number"
                    min=".01"
                    step=".01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </Field>
                <Field label={t('paymentDate')}>
                  <input required type="date" name="paid_at" defaultValue={today()} />
                </Field>
              </div>
              <Field label={t('method')}>
                <select name="method">
                  {['cash', 'transfer', 'cheque', 'other'].map((k) => (
                    <option key={k} value={k}>
                      {t(k)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('notes') + ' · ' + t('optional')}>
                <textarea name="notes" maxLength={1000} rows={2} />
              </Field>
              <p className="field-hint">{t('automaticPaymentHelp')}</p>
              {selected && (
                <>
                  <h3 className="section-caption">{t('balanceAfter')}</h3>
                  <div className="account-summary">
                    <div>
                      <BalanceValue env={env} value={after} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="form-footer">
          <button type="button" className="btn" onClick={env.close}>
            {t('cancel')}
          </button>
          <Submit busy={env.busy}>{t(data.apply ? 'apply' : 'recordPayment')}</Submit>
        </div>
      </form>
    </Modal>
  );
}
export function ReceiptDetail({
  env,
  data,
}: {
  env: Env;
  data: {
    id: string;
  };
}) {
  const { s, t, lang } = env,
    r = s.receipts.find((r) => r.id === data.id);
  if (!r)
    return (
      <Modal title={t('receipt')} close={env.close}>
        <div className="modal-body">{t('loading')}</div>
      </Modal>
    );
  const d = r.details,
    party = s.parties.find((p) => p.id === r.party_id),
    payment = s.payments.find((p) => p.id === r.payment_id);
  return (
    <Modal title={r.number} subtitle={party?.name || t('walkIn')} close={env.close} wide>
      <div className="modal-body">
        <div className="detail-meta">
          <Badge tone={r.action === 'reversal' || payment?.reversed ? 'neutral' : 'green'}>
            {t(
              r.action === 'reversal'
                ? 'paymentReversed'
                : r.action === 'allocation'
                  ? 'creditApplied'
                  : d.direction === 'received'
                    ? 'moneyReceived'
                    : 'moneyPaid',
            )}
          </Badge>
          <span>
            {dateLabel(d.paid_at, lang)} · {t(d.method)}
          </span>
        </div>
        {payment?.reversed && r.action !== 'reversal' && (
          <p className="warning-callout">{t('receiptReversedHelp')}</p>
        )}
        <div className="detail-totals">
          <div>
            <span>{t('amount')}</span>
            <strong>
              {money(d.amount, lang)} {t('MAD')}
            </strong>
          </div>
        </div>
        {d.balance_before !== null && (
          <>
            <div className="account-summary">
              <div>
                <small>{t('balanceBefore')}</small>
                <BalanceValue env={env} value={d.balance_before} />
              </div>
              <div>
                <small>{t('balanceAfter')}</small>
                <BalanceValue env={env} value={d.balance_after || 0} />
              </div>
            </div>
            <p className="field-hint">{t('receiptSnapshotHelp')}</p>
          </>
        )}
        {d.notes && <p className="quiet">{d.notes}</p>}
        {d.invoices.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {['invoice', 'paymentChange', 'remaining'].map((k) => (
                    <th key={k}>{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.invoices.map((i) => (
                  <tr key={i.document_id}>
                    <td>{i.number}</td>
                    <td>
                      {money(i.change, lang)} {t('MAD')}
                    </td>
                    <td>
                      {money(i.remaining, lang)} {t('MAD')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="detail-actions">
          <button className="btn primary" onClick={() => printReceipt(r.id)}>
            <Printer size={16} />
            {t('printInvoice')}
          </button>
          {party && (
            <button className="btn" onClick={() => env.open('partyDetail', party)}>
              {t('backToAccount')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
