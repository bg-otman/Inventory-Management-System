'use client';
import React, { useState } from 'react';
import { Plus, Trash2, Printer, Wallet, Package } from 'lucide-react';
import { Env, Modal, Field, Submit, IconButton, Badge } from './ui';
import {
  DocKind,
  Line,
  number,
  money,
  priceLabel,
  quantityLabel,
  today,
  totals,
  balance,
  dateLabel,
  purchaseReference,
} from '@/lib/types';
import { printInvoice } from '@/lib/invoice';
import { Status } from './App';
import { PaymentList } from './AccountForms';
import ProductEditor from './ProductEditor';
import ProductPicker from './ProductPicker';
import PartyPicker from './PartyPicker';
import { InlineParty } from './InlineParty';
const titles: Record<DocKind, string> = {
  sale: 'Facture de vente',
  purchase: 'Facture d’achat',
  quote: 'Devis',
  delivery: 'Bon de livraison',
};
const empty = (wh: string): Line => ({
  product_id: null,
  name: '',
  unit: 'unit',
  warehouse_id: wh,
  quantity: '1',
  price: '',
});
export function DocumentForm({ env, data }: { env: Env; data: any }) {
  const { s, t } = env,
    kind: DocKind = data?.kind || 'sale',
    purchase = kind === 'purchase',
    aux = kind === 'quote' || kind === 'delivery';
  const existing = data?.id ? s.documents.find((d) => d.id === data.id) : undefined,
    issued = existing?.status === 'confirmed';
  const [party, setParty] = useState(existing?.party_id || data?.party_id || ''),
    [wh, setWh] = useState(existing?.warehouse_id || s.warehouses.find((w) => w.active)?.id || '');
  const [items, setItems] = useState<Line[]>(
    existing?.items.map((l) => ({
      ...l,
      name: l.name || '',
      warehouse_id: l.warehouse_id || existing.warehouse_id,
    })) || [empty(wh)],
  );
  const [discount, setDiscount] = useState(existing?.discount || '0'),
    [payment, setPayment] = useState('0'),
    [fulfilled, setFulfilled] = useState(existing?.fulfilled ?? true),
    [invoiceReady, setInvoiceReady] = useState(issued || data?.invoicing || !existing);
  const [due, setDue] = useState(existing?.due_date || ''),
    [date, setDate] = useState(
      (existing?.issued_at || existing?.created_at || today()).slice(0, 10),
    ),
    [notes, setNotes] = useState(existing?.notes || '');
  const [newParty, setNewParty] = useState(false),
    [newProduct, setNewProduct] = useState(false);
  const amounts = totals(items, discount),
    paidNow = issued
      ? '0'
      : !aux && !purchase && !party
        ? Math.max(0, amounts.total).toFixed(2)
        : payment;
  const patch = (i: number, v: Partial<Line>) =>
    setItems((rows) => rows.map((l, j) => (i === j ? { ...l, ...v } : l)));
  const pick = (i: number, id: string | null, name: string) => {
    const p = s.products.find((p) => p.id === id);
    patch(i, {
      product_id: id,
      name,
      unit: p?.unit || items[i].unit || 'unit',
      ...(p
        ? {
            price:
              existing?.source_id && !items[i].product_id && items[i].price
                ? items[i].price
                : purchase
                  ? (purchaseReference(s, p).cost ?? '')
                  : (p.price ?? ''),
          }
        : {}),
    });
  };
  const warehouses = s.warehouses.filter(
    (w) => w.active || w.id === wh || items.some((l) => l.warehouse_id === w.id),
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newParty || newProduct) return;
    if (purchase && !party) {
      env.toast('Choisissez un fournisseur dans les résultats de recherche.', true);
      return;
    }
    const draft = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'draft',
      confirm = issued || (!draft && (!purchase || invoiceReady));
    if (!items.length || items.some((l) => !l.product_id && !l.name?.trim())) {
      env.toast('Saisissez la désignation de chaque produit.', true);
      return;
    }
    if (confirm && !aux && items.some((l) => !l.product_id)) {
      env.toast(
        'Associez chaque ligne à un produit du catalogue avant de confirmer la facture.',
        true,
      );
      return;
    }
    if (confirm && items.some((l) => l.price === null || l.price === '')) {
      env.toast(t('missingPrice'), true);
      return;
    }
    const body = {
      kind,
      revision: existing?.revision ?? null,
      party_id: party || null,
      warehouse_id: wh,
      items: items.map((l) => ({
        product_id: l.product_id || null,
        name: l.name || '',
        unit: l.unit || 'unit',
        warehouse_id: purchase ? wh : l.warehouse_id || wh,
        quantity: l.quantity,
        price: l.price === '' ? null : l.price,
      })),
      discount: discount || '0',
      due_date: due || null,
      issued_date: date || null,
      notes,
      language: 'fr',
      confirm,
      fulfill: aux ? false : existing?.fulfilled || (!draft && fulfilled),
      payment: confirm ? paidNow : '0',
    };
    try {
      const r = await env.act(
        '/documents' + (existing ? '/' + existing.id : ''),
        body,
        existing ? 'PATCH' : 'POST',
      );
      env.open('documentDetail', { id: r.id });
    } catch {}
  }
  return (
    <Modal
      title={(existing ? 'Modifier — ' : 'Nouveau document — ') + titles[kind]}
      close={env.close}
      wide
    >
      <form onSubmit={submit}>
        <div className="modal-body document-form">
          {issued && !aux && (
            <p className="warning-callout">
              La correction conserve le numéro et l’historique. Le stock et le solde seront
              recalculés. Les paiements restent inchangés.
            </p>
          )}
          {aux && (
            <p className="field-hint">
              {kind === 'quote'
                ? 'Produits du catalogue ou désignations libres, même sans stock. Aucun paiement ni mouvement de stock.'
                : 'Ce bon ne modifie pas le stock. Enregistrez la sortie de marchandises dans la vente correspondante.'}
            </p>
          )}
          {existing?.source_id && (
            <p className="field-hint">
              Copie liée à{' '}
              {s.documents.find((d) => d.id === existing.source_id)?.number || 'un document'}.
              Vérifiez les lignes avant de confirmer.
            </p>
          )}
          <div className="form-grid">
            <Field label={purchase ? 'Fournisseur' : 'Client'}>
              <PartyPicker
                parties={s.parties}
                kind={purchase ? 'supplier' : 'customer'}
                value={party}
                required={purchase}
                disabled={newProduct}
                onChange={setParty}
                onCreate={() => setNewParty(true)}
              />
            </Field>
            <Field label="Entrepôt par défaut">
              <select required value={wh} onChange={(e) => setWh(e.target.value)}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {!w.active ? ' · Retiré' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {newParty && (
            <InlineParty
              env={env}
              kind={purchase ? 'supplier' : 'customer'}
              onCancel={() => setNewParty(false)}
              onCreated={(id) => {
                setParty(id);
                setNewParty(false);
              }}
            />
          )}
          <div className="section-caption">Produits</div>
          <div className="line-head">
            <span>Désignation</span>
            <span>Quantité</span>
            <span>Prix unitaire</span>
            <span>Total</span>
            <span />
          </div>
          {items.map((l, i) => {
            const p = s.products.find((p) => p.id === l.product_id),
              ref = p ? purchaseReference(s, p) : null;
            return (
              <div className="line-group" key={i}>
                <div className="line-editor">
                  <ProductPicker
                    products={s.products}
                    value={l.product_id}
                    name={l.name || ''}
                    free={aux}
                    onChange={(id, name) => pick(i, id, name)}
                  />
                  <input
                    aria-label="Quantité"
                    required
                    type="number"
                    min={
                      ['unit', 'piece', 'carton'].includes(p?.unit || l.unit || 'unit')
                        ? '1'
                        : '.001'
                    }
                    step={
                      ['unit', 'piece', 'carton'].includes(p?.unit || l.unit || 'unit')
                        ? '1'
                        : '.001'
                    }
                    value={l.quantity}
                    onChange={(e) => patch(i, { quantity: e.target.value })}
                  />
                  <input
                    aria-label="Prix unitaire"
                    type="number"
                    min="0"
                    step=".000001"
                    value={l.price ?? ''}
                    onChange={(e) => patch(i, { price: e.target.value })}
                  />
                  <strong>{money(totals([l], '0').total)}</strong>
                  <IconButton
                    label="Retirer la ligne"
                    onClick={() => setItems((rows) => rows.filter((_, j) => i !== j))}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
                <div className="line-options">
                  {!purchase && (
                    <Field label="Entrepôt">
                      <select
                        value={l.warehouse_id || wh}
                        onChange={(e) => patch(i, { warehouse_id: e.target.value })}
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {!p && aux && (
                    <Field label="Unité">
                      <select
                        value={l.unit || 'unit'}
                        onChange={(e) => patch(i, { unit: e.target.value })}
                      >
                        {['unit', 'piece', 'kg', 'meter', 'carton', 'liter'].map((u) => (
                          <option key={u} value={u}>
                            {t(u)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {p && !purchase && (
                    <>
                      <Field label="Type de prix">
                        <select
                          value={
                            l.price !== null &&
                            p.price !== null &&
                            number(l.price) === number(p.price)
                              ? 'retail'
                              : l.price !== null &&
                                  p.wholesale_price !== null &&
                                  number(l.price) === number(p.wholesale_price)
                                ? 'wholesale'
                                : 'custom'
                          }
                          onChange={(e) => {
                            const v = e.target.value === 'retail' ? p.price : p.wholesale_price;
                            if (v !== null) patch(i, { price: v });
                          }}
                        >
                          <option value="retail" disabled={p.price === null}>
                            Détail
                          </option>
                          <option value="wholesale" disabled={p.wholesale_price === null}>
                            Gros
                          </option>
                          <option value="custom" disabled>
                            Personnalisé
                          </option>
                        </select>
                      </Field>
                      <span className="field-hint">
                        Disponible ici :{' '}
                        {quantityLabel(
                          s.stock.find(
                            (x) =>
                              x.product_id === p.id && x.warehouse_id === (l.warehouse_id || wh),
                          )?.quantity || '0',
                        )}{' '}
                        {t(p.unit)}
                      </span>
                    </>
                  )}
                </div>
                {p && (
                  <div className="line-price-guide">
                    <div>
                      <span>Coût d’achat</span>
                      <strong>
                        {ref?.cost == null ? 'Non renseigné' : priceLabel(ref.cost) + ' MAD'}
                      </strong>
                    </div>
                    <div>
                      <span>Prix de détail</span>
                      <strong>
                        {p.price == null ? 'Non défini' : priceLabel(p.price) + ' MAD'}
                      </strong>
                    </div>
                    <div>
                      <span>Prix de gros</span>
                      <strong>
                        {p.wholesale_price == null
                          ? 'Non défini'
                          : priceLabel(p.wholesale_price) + ' MAD'}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="button-row">
            <button
              type="button"
              className="text-button add-line"
              onClick={() => setItems((rows) => [...rows, empty(wh)])}
            >
              <Plus size={16} />
              Ajouter une ligne
            </button>
            <button
              type="button"
              className="text-button add-line"
              disabled={newProduct || newParty || (purchase && !party)}
              onClick={() => setNewProduct(true)}
            >
              Créer un produit
            </button>
          </div>
          {newProduct && (
            <ProductEditor
              env={env}
              inline
              insidePurchase={purchase || aux}
              supplierId={purchase ? party : ''}
              warehouseId={wh}
              onCancel={() => setNewProduct(false)}
              onSaved={(p) => {
                setItems((rows) => [
                  ...rows.filter((l) => l.product_id || l.name?.trim()),
                  {
                    product_id: p.id,
                    name: p.name,
                    warehouse_id: wh,
                    quantity: '1',
                    price: purchase ? p.purchase_cost : p.price,
                  },
                ]);
                setNewProduct(false);
              }}
            />
          )}
          <div className="document-bottom">
            <div className="document-options">
              <Field label="Date du document">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label={kind === 'quote' ? 'Valable jusqu’au' : 'Échéance'}>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </Field>
              <Field label="Remise (MAD)">
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </Field>
              <Field label="Notes">
                <textarea
                  maxLength={4000}
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              {!aux && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={fulfilled}
                    disabled={!!existing?.fulfilled}
                    onChange={(e) => setFulfilled(e.target.checked)}
                  />
                  {purchase ? 'Marchandises reçues' : 'Marchandises livrées'}
                </label>
              )}
              {purchase && !issued && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={invoiceReady}
                    onChange={(e) => setInvoiceReady(e.target.checked)}
                  />
                  Facture fournisseur disponible
                </label>
              )}
            </div>
            <div className="totals-box">
              <div>
                <span>Sous-total</span>
                <strong>{money(amounts.subtotal)}</strong>
              </div>
              <div>
                <span>Remise</span>
                <strong>−{money(amounts.discount)}</strong>
              </div>
              <div className="grand-total">
                <span>Total</span>
                <strong>
                  {money(amounts.total)} <small>MAD</small>
                </strong>
              </div>
              {!aux && !issued && (!purchase || invoiceReady) && (
                <Field label="Paiement immédiat">
                  <input
                    type="number"
                    min="0"
                    max={Math.max(0, amounts.total)}
                    step=".01"
                    readOnly={!purchase && !party}
                    value={paidNow}
                    onChange={(e) => setPayment(e.target.value)}
                  />
                </Field>
              )}
              {!aux && (
                <>
                  <div>
                    <span>{issued ? 'Déjà payé' : 'Reste à payer'}</span>
                    <strong>
                      {money(
                        issued ? existing!.paid : Math.max(0, amounts.total - number(paidNow)),
                      )}
                    </strong>
                  </div>
                  {!party && !purchase && (
                    <p className="field-hint">
                      Une facture de passage doit être entièrement payée. Choisissez un client pour
                      un crédit.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="form-footer">
          <button type="button" className="btn" onClick={env.close}>
            Annuler
          </button>
          {!issued && (
            <button
              type="submit"
              value="draft"
              className="btn"
              disabled={env.busy || newParty || newProduct}
            >
              Enregistrer le brouillon
            </button>
          )}
          <Submit busy={env.busy} disabled={newParty || newProduct}>
            {issued
              ? 'Enregistrer les modifications'
              : aux
                ? 'Enregistrer et émettre'
                : purchase
                  ? 'Enregistrer l’achat'
                  : 'Confirmer la vente'}
          </Submit>
        </div>
      </form>
    </Modal>
  );
}
export function DocumentDetail({ env, data }: { env: Env; data: { id: string } }) {
  const { s, t } = env,
    d = s.documents.find((d) => d.id === data.id);
  if (!d)
    return (
      <Modal title="Document" close={env.close}>
        <p>Chargement…</p>
      </Modal>
    );
  const purchase = d.kind === 'purchase',
    aux = d.kind === 'quote' || d.kind === 'delivery',
    party = s.parties.find((p) => p.id === d.party_id),
    linked = s.documents.filter((x) => x.id === d.source_id || x.source_id === d.id),
    revisions = [...(d.snapshot?.price_revisions || []), ...(d.snapshot?.revisions || [])];
  async function convert(kind: DocKind) {
    try {
      const r = await env.act('/documents/' + d!.id + '/convert', { kind });
      env.open(kind === 'sale' && !r.existing ? 'document' : 'documentDetail', { id: r.id, kind });
    } catch {}
  }
  return (
    <Modal
      title={d.number || 'Brouillon'}
      subtitle={titles[d.kind] + ' · ' + (party?.name || 'Client de passage')}
      close={env.close}
      wide
    >
      <div className="modal-body">
        <div className="detail-meta">
          <Status d={d} t={t} />
          <span>{dateLabel(d.issued_at || d.created_at)}</span>
          {!aux && (
            <Badge tone={d.fulfilled ? 'green' : 'neutral'}>
              {purchase
                ? d.fulfilled
                  ? 'Reçu'
                  : 'En attente de réception'
                : d.fulfilled
                  ? 'Livré'
                  : 'En attente de livraison'}
            </Badge>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {['Produit', 'Quantité', 'Prix unitaire', 'Total'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.items.map((l, i) => (
                <tr key={i}>
                  <td>
                    {l.name}
                    <small className="warehouse-note">
                      {s.warehouses.find((w) => w.id === (l.warehouse_id || d.warehouse_id))?.name}
                    </small>
                  </td>
                  <td>
                    {quantityLabel(l.quantity)} {t(l.unit || 'unit')}
                  </td>
                  <td>{l.price === null ? 'Non défini' : priceLabel(l.price)}</td>
                  <td>{l.price === null ? '—' : money(totals([l], '0').total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.due_date && (
          <p className="field-hint">
            {d.kind === 'quote' ? 'Valable jusqu’au' : 'Échéance'} : {dateLabel(d.due_date)}
          </p>
        )}
        {d.notes && <p className="document-notes">{d.notes}</p>}
        <div className="detail-totals">
          <div>
            <span>Total</span>
            <strong>{money(d.total)} MAD</strong>
          </div>
          {!aux && (
            <>
              <div>
                <span>Payé</span>
                <strong>{money(d.paid)} MAD</strong>
              </div>
              <div>
                <span>Reste à payer</span>
                <strong>{money(balance(d))} MAD</strong>
              </div>
            </>
          )}
        </div>
        {d.status !== 'reversed' && (
          <>
            <div className="detail-actions">
              <button
                className="btn primary"
                onClick={() => env.open('document', { ...d, invoicing: true })}
              >
                Modifier le document
              </button>
              {d.status === 'confirmed' && (
                <button className="btn" onClick={() => printInvoice(s, d)}>
                  <Printer size={16} />
                  Imprimer / Enregistrer en PDF
                </button>
              )}
              {!aux && !d.fulfilled && (purchase || d.status === 'confirmed') && (
                <button
                  className="btn"
                  disabled={env.busy}
                  onClick={() => void env.act('/documents/' + d.id + '/fulfill').catch(() => {})}
                >
                  <Package size={16} />
                  {purchase ? 'Recevoir les marchandises' : 'Confirmer la livraison'}
                </button>
              )}
              {!aux && d.party_id && balance(d) > 0 && (
                <button
                  className="btn"
                  onClick={() => env.open('payment', { party_id: d.party_id, document: d })}
                >
                  <Wallet size={16} />
                  Enregistrer un paiement
                </button>
              )}
            </div>
            {d.kind !== 'purchase' && (
              <>
                <p className="field-hint">
                  La conversion crée une copie liée et conserve l’original, ses paiements et son
                  stock. Une nouvelle facture doit être vérifiée puis confirmée. Un bon de livraison
                  ne déduit pas le stock une seconde fois.
                </p>
                <div className="button-row">
                  {aux ? (
                    <button
                      className="btn"
                      disabled={env.busy}
                      onClick={() => void convert('sale')}
                    >
                      Convertir en facture
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn"
                        disabled={env.busy}
                        onClick={() => void convert('quote')}
                      >
                        Convertir en devis
                      </button>
                      <button
                        className="btn"
                        disabled={env.busy}
                        onClick={() => void convert('delivery')}
                      >
                        Créer un bon de livraison
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}
        {linked.length > 0 && (
          <>
            <h3 className="section-caption">Documents liés</h3>
            <div className="button-row">
              {linked.map((x) => (
                <button
                  className="btn small"
                  key={x.id}
                  onClick={() => env.open('documentDetail', x)}
                >
                  {titles[x.kind]} · {x.number || 'Brouillon'}
                </button>
              ))}
            </div>
          </>
        )}
        {!!revisions.length && (
          <>
            <h3 className="section-caption">Historique des corrections</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ancien total</th>
                  <th>Nouveau total</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((r: any, i: number) => (
                  <tr key={i}>
                    <td>{dateLabel(r.at)}</td>
                    <td>{money(r.before.total)} MAD</td>
                    <td>{money(r.after.total)} MAD</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {!aux && (
          <>
            <h3 className="section-caption">Historique des paiements</h3>
            <PaymentList env={env} document={d} />
          </>
        )}
        {d.status !== 'reversed' && (
          <div className="danger-zone">
            <button
              className="text-button danger"
              onClick={() =>
                env.open('reason', {
                  path: '/documents/' + d.id + '/reverse',
                  label: 'reverse',
                  help: 'reverseHelp',
                })
              }
            >
              Annuler le document
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
