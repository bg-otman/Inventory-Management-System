"""Editable invoices and non-posting quotations/delivery notes."""

from collections import defaultdict
from copy import deepcopy
from datetime import datetime
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import select
from .models import (
    Document,
    Line,
    Product,
    Party,
    Warehouse,
    Stock,
    Allocation,
    Payment,
    Setting,
    now,
)
from . import services as s

INVOICES = ("sale", "purchase")


def snapshot(db, doc):
    party = db.get(Party, doc.party_id) if doc.party_id else None
    return {
        **doc.snapshot,
        "company": doc.snapshot.get("company", dict(db.get(Setting, 1).data)),
        "party": s.serialize(party) if party else None,
        "lines": s.invoice_lines(db, doc),
        "total": str(doc.total),
        "subtotal": str(doc.subtotal),
        "discount": str(doc.discount),
        "language": "fr",
        "due_date": doc.due_date,
        "notes": doc.notes,
        "issued_at": doc.issued_at.isoformat() if doc.issued_at else None,
        "warehouse_id": doc.warehouse_id,
    }


def issue(db, doc):
    setting = db.get(Setting, 1)
    if not doc.number:
        counter = "next_quote" if doc.kind == "quote" else "next_delivery"
        doc.number = f"{'DEV' if doc.kind=='quote' else 'BL'}-{getattr(setting,counter):06d}"
        setattr(setting, counter, getattr(setting, counter) + 1)
    doc.status = "confirmed"
    doc.issued_at = doc.issued_at or now()


def stock_vector(lines, default):
    result = defaultdict(Decimal)
    for l in lines:
        result[(l.product_id, l.warehouse_id or default)] += l.quantity
    return result


def save(db, user, data, doc_id=None):
    doc = s.require(db, Document, doc_id) if doc_id else None
    if doc and (doc.kind != data.kind or doc.status == "reversed"):
        raise HTTPException(409, "Ce document est annulé ou son type ne correspond pas.")
    if doc and data.revision is not None and doc.revision != data.revision:
        raise HTTPException(409, "Ce document a changé. Fermez puis rouvrez le formulaire.")
    invoice = data.kind in INVOICES
    confirmed = bool(doc and doc.status == "confirmed")
    old_lines = s.document_lines(db, doc) if doc else []
    old_stock = stock_vector(old_lines, doc.warehouse_id) if doc and doc.fulfilled else {}
    old_snapshot = deepcopy(snapshot(db, doc)) if doc else None
    allocated = s.paid(db, doc) if doc else Decimal(0)
    if confirmed and (not data.confirm or data.payment):
        raise HTTPException(
            422, "Un document émis reste émis. Enregistrez les paiements séparément."
        )
    if doc and doc.fulfilled and not data.fulfill:
        raise HTTPException(
            409, "La livraison est déjà enregistrée. Annulez l’opération pour la retirer."
        )
    if data.party_id:
        party = s.require(db, Party, data.party_id)
        if party.kind != ("supplier" if data.kind == "purchase" else "customer"):
            raise HTTPException(
                422, "Choisissez le client ou fournisseur correspondant au document."
            )
        if not party.active and (not doc or doc.party_id != party.id):
            raise HTTPException(422, "Ce compte a été retiré. Réactivez-le pour l’utiliser.")
    elif data.kind == "purchase":
        raise HTTPException(422, "Choisissez un fournisseur.")
    if (
        doc
        and doc.party_id != data.party_id
        and db.scalar(
            select(Allocation.id)
            .join(Payment, Payment.id == Allocation.payment_id)
            .where(Allocation.document_id == doc.id, Payment.reversed == False)
            .limit(1)
        )
    ):
        raise HTTPException(
            409, "Annulez les paiements liés avant de changer le client ou fournisseur."
        )
    if not invoice and (data.payment or data.fulfill):
        raise HTTPException(
            422, "Un devis ou bon de livraison ne crée ni paiement ni mouvement de stock."
        )
    if not data.confirm and data.payment:
        raise HTTPException(422, "Enregistrez l’avance dans le compte avant facturation.")
    allowed_old = {(l.product_id, l.warehouse_id or doc.warehouse_id) for l in old_lines}
    default = s.require(db, Warehouse, data.warehouse_id)
    if not default.active and (not doc or doc.warehouse_id != default.id):
        raise HTTPException(409, "Choisissez un entrepôt actif.")
    prepared = []
    for row in data.items:
        wh = s.require(db, Warehouse, row.warehouse_id or data.warehouse_id)
        if not wh.active and (row.product_id, wh.id) not in allowed_old:
            raise HTTPException(409, "Choisissez un entrepôt actif.")
        if data.kind == "purchase" and wh.id != data.warehouse_id:
            raise HTTPException(422, "Toutes les lignes d’achat doivent utiliser le même entrepôt.")
        if row.product_id:
            p = s.require(db, Product, row.product_id)
            if not p.active and not any(l.product_id == p.id for l in old_lines):
                raise HTTPException(422, "Ce produit a été retiré.")
            s.quantity_valid(p, row.quantity)
            name, unit = p.name, p.unit
        else:
            if invoice and (data.confirm or data.fulfill):
                raise HTTPException(
                    422,
                    "Associez chaque ligne à un produit du catalogue avant de confirmer ou recevoir la facture.",
                )
            if not row.name:
                raise HTTPException(422, "Saisissez la désignation de chaque ligne libre.")
            name, unit = row.name, row.unit
            if (
                unit in ("unit", "piece", "carton")
                and row.quantity != row.quantity.to_integral_value()
            ):
                raise HTTPException(422, "Cette unité nécessite une quantité entière.")
        prepared.append(
            Line(
                product_id=row.product_id,
                warehouse_id=wh.id,
                name=name,
                unit=unit,
                quantity=row.quantity,
                price=row.price,
            )
        )
    if not doc:
        doc = Document(
            kind=data.kind,
            warehouse_id=data.warehouse_id,
            actor=user.id,
            status="draft",
            fulfilled=False,
            revision=0,
        )
        db.add(doc)
        db.flush()
    for k in ("party_id", "warehouse_id", "discount", "notes"):
        setattr(doc, k, getattr(data, k))
    doc.language = "fr"
    doc.due_date = data.due_date.isoformat() if data.due_date else None
    if data.issued_date:
        doc.issued_at = datetime.combine(data.issued_date, datetime.min.time())
    for row in old_lines:
        db.delete(row)
    for row in prepared:
        row.document_id = doc.id
        db.add(row)
    db.flush()
    s.recalculate(db, doc, data.confirm)
    if confirmed and invoice:
        if doc.total < allocated:
            raise HTTPException(
                409,
                "Le total est inférieur au montant déjà payé. Enregistrez d’abord un remboursement ou annulez le paiement.",
            )
        if not doc.party_id and doc.total != allocated:
            raise HTTPException(
                409,
                "Une vente de passage doit rester entièrement payée. Corrigez les paiements avant de modifier le total.",
            )
    if old_stock:
        new_stock = stock_vector(prepared, doc.warehouse_id)
        sign = -1 if doc.kind == "sale" else 1
        for p, w in sorted(set(old_stock) | set(new_stock)):
            delta = sign * (new_stock.get((p, w), 0) - old_stock.get((p, w), 0))
            if delta:
                s.move(
                    db,
                    user,
                    p,
                    w,
                    delta,
                    "Correction du document " + (doc.number or doc.id),
                    doc.id,
                )
    if data.confirm and not confirmed:
        if invoice:
            s.confirm(db, user, doc, data.payment)
            if data.issued_date:
                doc.issued_at = datetime.combine(data.issued_date, datetime.min.time())
        else:
            issue(db, doc)
    if invoice and data.fulfill and (data.kind == "purchase" or data.confirm):
        s.fulfill(db, user, doc)
    if data.confirm:
        doc.snapshot = snapshot(db, doc)
    if doc_id:
        doc.revision += 1
        doc.snapshot = {
            **doc.snapshot,
            "revisions": [
                *doc.snapshot.get("revisions", []),
                {
                    "at": now().isoformat() + "Z",
                    "before": {
                        k: v
                        for k, v in old_snapshot.items()
                        if k not in ("revisions", "price_revisions")
                    },
                    "after": {
                        "total": str(doc.total),
                        "party_id": doc.party_id,
                        "lines": s.invoice_lines(db, doc),
                        "notes": doc.notes,
                        "due_date": doc.due_date,
                        "issued_at": doc.issued_at.isoformat() if doc.issued_at else None,
                    },
                },
            ],
        }
    s.activity(
        db, user, "document.updated" if doc_id else "document.saved", doc.number or "Brouillon"
    )
    return {"id": doc.id}


def convert(db, user, id, kind):
    source = s.require(db, Document, id)
    if source.status == "reversed":
        raise HTTPException(409, "Ce document est annulé.")
    if (source.kind, kind) not in (
        ("quote", "sale"),
        ("sale", "quote"),
        ("sale", "delivery"),
        ("delivery", "sale"),
    ):
        raise HTTPException(422, "Cette conversion n’est pas disponible.")
    target = db.scalar(
        select(Document).where(
            Document.source_id == source.id, Document.kind == kind, Document.status != "reversed"
        )
    )
    if target:
        return {"id": target.id, "existing": True}
    if kind == "sale" and source.source_id:
        parent = db.get(Document, source.source_id)
        if parent and parent.kind == "sale" and parent.status != "reversed":
            return {"id": parent.id, "existing": True}
    target = Document(
        kind=kind,
        source_id=source.id,
        party_id=source.party_id,
        warehouse_id=source.warehouse_id,
        discount=source.discount,
        subtotal=source.subtotal,
        total=source.total,
        notes=source.notes,
        due_date=source.due_date,
        language="fr",
        actor=user.id,
        status="draft",
        fulfilled=False,
        revision=0,
    )
    db.add(target)
    db.flush()
    for l in s.document_lines(db, source):
        db.add(
            Line(
                document_id=target.id,
                product_id=l.product_id,
                warehouse_id=l.warehouse_id,
                name=l.name,
                unit=l.unit,
                quantity=l.quantity,
                price=l.price,
            )
        )
    db.flush()
    if kind != "sale":
        s.recalculate(db, target, True)
        issue(db, target)
        target.snapshot = snapshot(db, target)
    s.activity(
        db,
        user,
        "document.converted",
        (source.number or "Brouillon") + " → " + (target.number or "Brouillon de vente"),
    )
    return {"id": target.id}


def remove_warehouse(db, user, id):
    w = s.require(db, Warehouse, id)
    if not w.active:
        return {"id": id}
    if len(list(db.scalars(select(Warehouse).where(Warehouse.active == True)))) <= 1:
        raise HTTPException(409, "Conservez au moins un entrepôt actif.")
    if db.scalar(
        select(Stock.product_id).where(Stock.warehouse_id == id, Stock.quantity > 0).limit(1)
    ):
        raise HTTPException(
            409, "Transférez ou corrigez le stock de cet entrepôt avant de le retirer."
        )
    if db.scalar(
        select(Line.id)
        .join(Document, Document.id == Line.document_id)
        .where(
            Document.kind.in_(INVOICES),
            Document.status != "reversed",
            Document.fulfilled == False,
            (
                (Line.warehouse_id == id)
                | ((Line.warehouse_id == None) & (Document.warehouse_id == id))
            ),
        )
        .limit(1)
    ):
        raise HTTPException(
            409, "Terminez ou modifiez les opérations en attente dans cet entrepôt."
        )
    w.active = False
    s.activity(db, user, "warehouse.removed", w.name)
    return {"id": id}
