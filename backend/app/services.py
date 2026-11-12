from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from sqlalchemy import select, func, case, or_
from sqlalchemy.orm import aliased
from fastapi import HTTPException
from .models import *

ZERO = Decimal("0")
MAX_MONEY = Decimal("99999999999999.99")
MAX_QUANTITY = Decimal("9999999999999.999")


def money(value):
    amount = Decimal(value)
    if not amount.is_finite() or abs(amount) > MAX_MONEY:
        raise HTTPException(422, "Le montant dépasse la limite autorisée.")
    return amount.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)


def require(db, model, key):
    value = db.get(model, key)
    if value is None:
        raise HTTPException(404, "Enregistrement introuvable.")
    return value


def activity(db, user, action, label):
    db.add(Activity(actor=user.id, action=action, label=str(label)[:200]))


def serialize(row):
    result = {}
    for c in row.__table__.columns:
        v = getattr(row, c.name)
        result[c.name] = (
            str(v)
            if isinstance(v, Decimal)
            else (v.isoformat() + "Z" if isinstance(v, datetime) else v)
        )
    return result


def paid(db, doc):
    if doc.kind not in ("sale", "purchase"):
        return ZERO
    direction = "received" if doc.kind == "sale" else "paid"
    signed = case((Payment.direction == direction, Allocation.amount), else_=-Allocation.amount)
    return (
        db.scalar(
            select(func.coalesce(func.sum(signed), 0))
            .join(Payment, Payment.id == Allocation.payment_id)
            .where(Allocation.document_id == doc.id, Payment.reversed == False)
        )
        or ZERO
    )


def unused(db, payment):
    if payment.reversed:
        return ZERO
    received, sent = aliased(Payment), aliased(Payment)
    offsets = (
        db.scalar(
            select(func.coalesce(func.sum(PaymentOffset.amount), 0))
            .join(received, received.id == PaymentOffset.received_id)
            .join(sent, sent.id == PaymentOffset.paid_id)
            .where(
                or_(PaymentOffset.received_id == payment.id, PaymentOffset.paid_id == payment.id),
                received.reversed == False,
                sent.reversed == False,
            )
        )
        or ZERO
    )
    return (
        payment.amount
        - (
            db.scalar(
                select(func.coalesce(func.sum(Allocation.amount), 0)).where(
                    Allocation.payment_id == payment.id
                )
            )
            or ZERO
        )
        - offsets
    )


def account_balance(db, party_id):
    """Positive = party owes the business; negative = business owes the party."""
    invoices = sum(
        (
            d.total * (1 if d.kind == "sale" else -1)
            for d in db.scalars(
                select(Document).where(
                    Document.party_id == party_id,
                    Document.status == "confirmed",
                    Document.kind.in_(("sale", "purchase")),
                )
            )
        ),
        ZERO,
    )
    cash = sum(
        (
            p.amount * (1 if p.direction == "paid" else -1)
            for p in db.scalars(
                select(Payment).where(Payment.party_id == party_id, Payment.reversed == False)
            )
        ),
        ZERO,
    )
    return invoices + cash


def account_paid(db, party_id):
    return {
        d.id: paid(db, d)
        for d in db.scalars(
            select(Document).where(
                Document.party_id == party_id,
                Document.status == "confirmed",
                Document.kind.in_(("sale", "purchase")),
            )
        )
    }


def make_receipt(db, user, payment, action, before, before_paid, language="fr", notes=""):
    db.flush()
    setting = db.get(Setting, 1)
    party = db.get(Party, payment.party_id) if payment.party_id else None
    changes = []
    allocated = (
        db.scalar(
            select(func.coalesce(func.sum(Allocation.amount), 0)).where(
                Allocation.payment_id == payment.id
            )
        )
        or ZERO
    )
    credit_offset = (
        payment.amount - allocated - unused(db, payment) if action == "payment" else ZERO
    )
    for doc_id, previous in before_paid.items():
        doc = db.get(Document, doc_id)
        current = paid(db, doc)
        if current != previous:
            changes.append(
                {
                    "document_id": doc.id,
                    "number": doc.number,
                    "total": str(doc.total),
                    "change": str(current - previous),
                    "paid_before": str(previous),
                    "paid_after": str(current),
                    "remaining": str(doc.total - current),
                }
            )
    receipt = Receipt(
        number=f"RCT-{setting.next_receipt:06d}",
        party_id=payment.party_id,
        payment_id=payment.id,
        action=action,
        snapshot={
            "company": dict(setting.data),
            "party": serialize(party) if party else None,
            "language": language,
            "direction": payment.direction,
            "amount": str(
                sum((abs(Decimal(c["change"])) for c in changes), ZERO)
                if action == "allocation"
                else payment.amount
            ),
            "paid_at": payment.paid_at,
            "method": payment.method,
            "notes": notes or payment.notes,
            "balance_before": str(before) if before is not None else None,
            "balance_after": str(account_balance(db, payment.party_id)) if party else None,
            "available": str(unused(db, payment)),
            "credit_offset": str(credit_offset),
            "invoices": changes,
        },
    )
    setting.next_receipt += 1
    db.add(receipt)
    db.flush()
    return receipt


def quantity_valid(product, amount):
    if product.unit in ("unit", "piece", "carton") and amount != amount.to_integral_value():
        raise HTTPException(422, "Ce produit nécessite une quantité entière.")


def move(db, user, product_id, warehouse_id, delta, reason, source=None):
    p = require(db, Product, product_id)
    if not require(db, Warehouse, warehouse_id).active:
        raise HTTPException(409, "Réactivez cet entrepôt avant de modifier son stock.")
    quantity_valid(p, abs(delta))
    if delta == 0:
        raise HTTPException(422, "La quantité ne doit pas être nulle.")
    stock = db.get(Stock, (product_id, warehouse_id))
    if stock is None:
        stock = Stock(product_id=product_id, warehouse_id=warehouse_id, quantity=ZERO)
        db.add(stock)
        db.flush()
    if stock.quantity + delta < 0:
        raise HTTPException(409, "Stock insuffisant pour cette opération.")
    if stock.quantity + delta > MAX_QUANTITY:
        raise HTTPException(422, "La quantité en stock dépasse la limite autorisée.")
    stock.quantity += delta
    db.add(
        Movement(
            product_id=product_id,
            warehouse_id=warehouse_id,
            quantity=delta,
            reason=reason,
            source_id=source,
            actor=user.id,
        )
    )


def product_save(db, user, data, product_id=None):
    require(db, Category, data.category_id)
    existing = require(db, Product, product_id) if product_id else None
    if data.supplier_id:
        supplier = require(db, Party, data.supplier_id)
        if supplier.kind != "supplier":
            raise HTTPException(422, "Choisissez un fournisseur pour ce produit.")
        if not supplier.active and (not existing or existing.supplier_id != supplier.id):
            raise HTTPException(
                422, "Ce fournisseur a été retiré. Réactivez-le ou choisissez un autre fournisseur."
            )
    opening = getattr(data, "opening_quantity", ZERO)
    warehouse = getattr(data, "warehouse_id", None)
    if opening and not warehouse:
        raise HTTPException(422, "Choisissez un entrepôt pour la quantité initiale.")
    if warehouse:
        require(db, Warehouse, warehouse)
    mode = getattr(data, "stock_mode", "existing")
    if not product_id:
        if mode == "purchase" and (not data.supplier_id or opening <= 0):
            raise HTTPException(
                422,
                "Choisissez un fournisseur et saisissez une quantité d’achat positive, ou cochez Stock déjà existant.",
            )
        if mode == "purchase" and data.invoice_ready and data.purchase_cost is None:
            raise HTTPException(422, "Saisissez le coût d’achat de ce produit.")
        if mode != "purchase" and (data.payment or data.discount or data.due_date):
            raise HTTPException(
                422, "Le paiement, la remise et l’échéance concernent un nouvel achat."
            )
        if mode == "catalog" and opening:
            raise HTTPException(422, "Saisissez la quantité dans l’achat en cours de préparation.")
    values = data.model_dump(
        exclude={
            "opening_quantity",
            "warehouse_id",
            "stock_mode",
            "discount",
            "payment",
            "due_date",
            "language",
            "fulfill",
            "invoice_ready",
        }
    )
    if existing and "supplier_id" not in data.model_fields_set:
        values.pop("supplier_id", None)
    if existing and "wholesale_price" not in data.model_fields_set:
        values.pop("wholesale_price", None)
    if product_id:
        p = existing
        if p.unit != data.unit and db.scalar(
            select(Movement.id).where(Movement.product_id == p.id).limit(1)
        ):
            raise HTTPException(
                409, "L’unité d’un produit ne peut plus être modifiée après un mouvement de stock."
            )
        for k, v in values.items():
            setattr(p, k, v)
    else:
        p = Product(**values)
        db.add(p)
    db.flush()
    purchase_id = None
    if not product_id and mode == "purchase":
        from .schemas import DocumentInput

        purchase = DocumentInput(
            kind="purchase",
            party_id=data.supplier_id,
            warehouse_id=warehouse,
            items=[{"product_id": p.id, "quantity": opening, "price": data.purchase_cost}],
            discount=data.discount,
            payment=data.payment,
            due_date=data.due_date,
            language=data.language,
            confirm=data.invoice_ready,
            fulfill=data.fulfill,
        )
        purchase_id = save_document(db, user, purchase)["id"]
    elif not product_id and opening:
        move(db, user, p.id, warehouse, opening, "Opening stock")
        activity(db, user, "stock.adjusted", "Opening stock: " + p.name)
    activity(db, user, "product.updated" if product_id else "product.created", p.name)
    return {"id": p.id, "purchase_id": purchase_id}


def document_lines(db, doc):
    return list(db.scalars(select(Line).where(Line.document_id == doc.id).order_by(Line.id)))


def recalculate(db, doc, final=False):
    lines = document_lines(db, doc)
    if final and any(line.price is None for line in lines):
        raise HTTPException(422, "Saisissez un prix pour chaque produit.")
    doc.subtotal = money(
        sum((money(line.quantity * line.price) for line in lines if line.price is not None), ZERO)
    )
    if doc.discount > doc.subtotal:
        raise HTTPException(422, "La remise dépasse le sous-total.")
    doc.tax = ZERO
    doc.tax_rate = ZERO
    doc.total = money(doc.subtotal - doc.discount)


def fulfill(db, user, doc):
    if doc.kind not in ("sale", "purchase") or doc.warehouse_id is None:
        raise HTTPException(422, "Ce document ne modifie pas le stock.")
    if doc.status == "reversed":
        raise HTTPException(409, "Cette opération a été annulée.")
    if doc.fulfilled:
        return
    if doc.kind == "sale" and doc.status != "confirmed":
        raise HTTPException(409, "Confirmez la facture avant la livraison.")
    for line in document_lines(db, doc):
        move(
            db,
            user,
            line.product_id,
            line.warehouse_id or doc.warehouse_id,
            line.quantity * (-1 if doc.kind == "sale" else 1),
            "Sale delivery" if doc.kind == "sale" else "Purchase receipt",
            doc.id,
        )
    doc.fulfilled = True
    doc.fulfilled_at = now()
    activity(
        db,
        user,
        "sale.delivered" if doc.kind == "sale" else "purchase.received",
        doc.number or "Pending invoice",
    )


def allocate(db, user, payment, allocations):
    if payment.reversed:
        raise HTTPException(409, "Ce paiement a été annulé.")
    for a in allocations:
        doc = require(db, Document, a.document_id)
        if (
            doc.kind not in ("sale", "purchase")
            or doc.status != "confirmed"
            or doc.party_id != payment.party_id
        ):
            raise HTTPException(
                422, "Le paiement et la facture doivent concerner le même client ou fournisseur."
            )
        amount = money(a.amount)
        normal = payment.direction == ("received" if doc.kind == "sale" else "paid")
        capacity = doc.total - paid(db, doc) if normal else paid(db, doc)
        if amount > unused(db, payment) or amount > capacity:
            raise HTTPException(
                409, "Le montant affecté dépasse le paiement disponible ou le solde de la facture."
            )
        db.add(Allocation(payment_id=payment.id, document_id=doc.id, amount=amount))
        db.flush()


def offset_deposits(db, payment):
    """A refund uses unused cash first, before reopening paid invoices."""
    for other in db.scalars(
        select(Payment)
        .where(
            Payment.party_id == payment.party_id,
            Payment.direction != payment.direction,
            Payment.reversed == False,
        )
        .order_by(Payment.created_at, Payment.id)
    ):
        amount = min(unused(db, payment), unused(db, other))
        if amount > 0:
            incoming = payment if payment.direction == "received" else other
            outgoing = other if payment.direction == "received" else payment
            db.add(PaymentOffset(received_id=incoming.id, paid_id=outgoing.id, amount=amount))
            db.flush()
        if unused(db, payment) <= 0:
            break


def allocate_oldest(db, user, payment, preferred_document_id=None):
    from .schemas import AllocationInput

    docs = list(
        db.scalars(
            select(Document)
            .where(
                Document.party_id == payment.party_id,
                Document.status == "confirmed",
                Document.kind.in_(("sale", "purchase")),
            )
            .order_by(Document.created_at, Document.id)
        )
    )
    if preferred_document_id:
        if not any(d.id == preferred_document_id for d in docs):
            raise HTTPException(422, "Choisissez une facture confirmée appartenant à ce compte.")
        docs.sort(key=lambda d: d.id != preferred_document_id)
    for doc in docs:
        normal = payment.direction == ("received" if doc.kind == "sale" else "paid")
        room = doc.total - paid(db, doc) if normal else paid(db, doc)
        amount = min(unused(db, payment), room)
        if amount > 0:
            allocate(db, user, payment, [AllocationInput(document_id=doc.id, amount=amount)])
        if unused(db, payment) <= 0:
            break


def record_payment(db, user, data):
    party = require(db, Party, data.party_id)
    before = account_balance(db, party.id)
    before_paid = account_paid(db, party.id)
    payment = Payment(
        party_id=data.party_id,
        amount=data.amount,
        paid_at=data.paid_at.isoformat(),
        method=data.method,
        direction=data.direction or ("received" if party.kind == "customer" else "paid"),
        notes=data.notes,
        actor=user.id,
    )
    db.add(payment)
    db.flush()
    offset_deposits(db, payment)
    allocate(db, user, payment, data.allocations)
    if data.auto_allocate:
        allocate_oldest(db, user, payment, data.preferred_document_id)
    receipt = make_receipt(db, user, payment, "payment", before, before_paid, data.language)
    activity(db, user, "payment.recorded", str(payment.amount) + " MAD")
    return {"id": payment.id, "receipt_id": receipt.id}


def allocate_payment(db, user, payment, data):
    before = account_balance(db, payment.party_id)
    before_paid = account_paid(db, payment.party_id)
    allocate(db, user, payment, data.allocations)
    receipt = make_receipt(db, user, payment, "allocation", before, before_paid, data.language)
    activity(db, user, "payment.allocated", receipt.number)
    return {"ok": True, "receipt_id": receipt.id}


def reverse_payment(db, user, payment, data):
    if payment.reversed:
        raise HTTPException(409, "Cette opération est déjà annulée.")
    before = account_balance(db, payment.party_id) if payment.party_id else None
    before_paid = account_paid(db, payment.party_id)
    payment.reversed = True
    db.flush()
    for a in db.scalars(select(Allocation).where(Allocation.payment_id == payment.id)):
        doc = require(db, Document, a.document_id)
        if paid(db, doc) < 0 or paid(db, doc) > doc.total:
            raise HTTPException(
                409,
                "Annulez d’abord le paiement lié le plus récent pour conserver un solde de facture valide.",
            )
    receipt = make_receipt(
        db, user, payment, "reversal", before, before_paid, data.language, data.reason
    )
    activity(db, user, "payment.reversed", data.reason)
    return {"ok": True, "receipt_id": receipt.id}


def confirm(db, user, doc, payment_amount=ZERO):
    if doc.kind not in ("sale", "purchase") or (
        doc.warehouse_id is not None and any(not l.product_id for l in document_lines(db, doc))
    ):
        raise HTTPException(422, "Associez chaque ligne de facture à un produit du catalogue.")
    if doc.status != "draft":
        raise HTTPException(409, "Seul un brouillon peut être confirmé.")
    recalculate(db, doc, True)
    if doc.kind == "sale" and not doc.party_id and payment_amount != doc.total:
        raise HTTPException(
            422,
            "Les ventes aux clients de passage doivent être payées intégralement. Choisissez un client identifié pour un crédit ou une avance.",
        )
    if payment_amount > doc.total:
        raise HTTPException(
            422, "Enregistrez l’avance supplémentaire depuis le compte du client ou du fournisseur."
        )
    setting = db.get(Setting, 1)
    if doc.kind == "sale":
        doc.number = f"INV-{setting.next_invoice:06d}"
        setting.next_invoice += 1
    else:
        doc.number = f"PUR-{setting.next_purchase:06d}"
        setting.next_purchase += 1
    doc.status = "confirmed"
    doc.issued_at = now()
    if payment_amount:
        db.flush()
        before = account_balance(db, doc.party_id) if doc.party_id else None
        before_paid = {doc.id: ZERO}
        p = Payment(
            party_id=doc.party_id,
            amount=payment_amount,
            paid_at=date.today().isoformat(),
            direction="received" if doc.kind == "sale" else "paid",
            actor=user.id,
        )
        db.add(p)
        db.flush()
        db.add(Allocation(payment_id=p.id, document_id=doc.id, amount=payment_amount))
        make_receipt(db, user, p, "payment", before, before_paid, doc.language)
    party = db.get(Party, doc.party_id) if doc.party_id else None
    doc.snapshot = {
        "company": setting.data,
        "party": serialize(party) if party else None,
        "lines": invoice_lines(db, doc),
        "paid_at_issue": str(payment_amount),
        "total": str(doc.total),
        "subtotal": str(doc.subtotal),
        "discount": str(doc.discount),
        "language": doc.language,
        "due_date": doc.due_date,
    }
    activity(db, user, "sale.confirmed" if doc.kind == "sale" else "purchase.invoiced", doc.number)


def invoice_lines(db, doc):
    return [
        {
            **serialize(line),
            "warehouse_name": (
                require(db, Warehouse, line.warehouse_id or doc.warehouse_id).name
                if doc.warehouse_id is not None
                else ""
            ),
        }
        for line in document_lines(db, doc)
    ]


def update_sale_prices(db, user, doc, data):
    if doc.kind != "sale" or doc.status != "confirmed":
        raise HTTPException(409, "Seule une vente confirmée peut être ajustée ici.")
    lines = document_lines(db, doc)
    prices = {line.id: line.price for line in data.items}
    if len(prices) != len(data.items) or set(prices) != {line.id for line in lines}:
        raise HTTPException(
            422, "Les lignes ne correspondent pas à cette facture. Rouvrez la vente."
        )
    old = {
        "total": str(doc.total),
        "discount": str(doc.discount),
        "lines": [serialize(line) for line in lines],
    }
    if doc.discount == data.discount and all(line.price == prices[line.id] for line in lines):
        return {"id": doc.id}
    for line in lines:
        line.price = prices[line.id]
    doc.discount = data.discount
    db.flush()
    recalculate(db, doc, True)
    allocated = paid(db, doc)
    if doc.total < allocated:
        raise HTTPException(
            409,
            "Le nouveau total est inférieur au montant déjà payé. Enregistrez d’abord le remboursement ou annulez le paiement concerné.",
        )
    if not doc.party_id and doc.total != allocated:
        raise HTTPException(
            409,
            "Une vente à un client de passage doit rester entièrement payée. Annulez et recréez cette vente pour changer son montant payé.",
        )
    revision = {
        "at": now().isoformat() + "Z",
        "before": old,
        "after": {
            "total": str(doc.total),
            "discount": str(doc.discount),
            "lines": [serialize(line) for line in lines],
        },
    }
    doc.snapshot = {
        **doc.snapshot,
        "lines": invoice_lines(db, doc),
        "total": str(doc.total),
        "subtotal": str(doc.subtotal),
        "discount": str(doc.discount),
        "price_revisions": [*doc.snapshot.get("price_revisions", []), revision],
    }
    doc.revision += 1
    activity(db, user, "sale.prices_updated", f"{doc.number}: {old['total']} → {doc.total} MAD")
    return {"id": doc.id}


def save_document(db, user, data, doc_id=None):
    from .documents import save

    return save(db, user, data, doc_id)


def reverse_document(db, user, doc, reason):
    if doc.status == "reversed":
        raise HTTPException(409, "Cette opération est déjà annulée.")
    if db.scalar(
        select(Allocation.id)
        .join(Payment, Payment.id == Allocation.payment_id)
        .where(Allocation.document_id == doc.id, Payment.reversed == False)
        .limit(1)
    ):
        raise HTTPException(409, "Annulez les paiements affectés avant d’annuler ce document.")
    if doc.fulfilled:
        for line in document_lines(db, doc):
            move(
                db,
                user,
                line.product_id,
                line.warehouse_id or doc.warehouse_id,
                line.quantity * (1 if doc.kind == "sale" else -1),
                "Reversal: " + reason,
                doc.id,
            )
    doc.status = "reversed"
    activity(db, user, "document.reversed", (doc.number or "Draft") + ": " + reason)


def state(db, user):
    from .preferences import normalize_language

    docs = []
    for d in db.scalars(select(Document).order_by(Document.created_at.desc())):
        data = serialize(d)
        data["items"] = [serialize(l) for l in document_lines(db, d)]
        data["language"] = normalize_language(data["language"])
        data.pop("tax", None)
        data.pop("tax_rate", None)
        data.pop("reference", None)
        data["snapshot"] = {
            k: v for k, v in data["snapshot"].items() if k not in ("tax", "tax_rate")
        }
        if "language" in data["snapshot"]:
            data["snapshot"]["language"] = normalize_language(data["snapshot"]["language"])
        if "company" in data["snapshot"]:
            data["snapshot"]["company"] = {
                k: v
                for k, v in data["snapshot"]["company"].items()
                if k not in ("tax_id", "default_tax", "company_name_ar")
            }
        data["paid"] = str(paid(db, d))
        docs.append(data)
    payments = []
    for p in db.scalars(select(Payment).order_by(Payment.created_at.desc())):
        data = serialize(p)
        data["available"] = str(unused(db, p))
        data.pop("reference", None)
        data["allocations"] = [
            serialize(a)
            for a in db.scalars(select(Allocation).where(Allocation.payment_id == p.id))
        ]
        payments.append(data)
    setting = db.get(Setting, 1)
    return {
        "categories": [serialize(c) for c in db.scalars(select(Category).order_by(Category.name))],
        "warehouses": [
            serialize(w) for w in db.scalars(select(Warehouse).order_by(Warehouse.name))
        ],
        "products": [
            {k: v for k, v in serialize(p).items() if k not in ("sku", "barcode")}
            for p in db.scalars(select(Product).order_by(Product.created_at.desc()))
        ],
        "stock": [serialize(s) for s in db.scalars(select(Stock))],
        "parties": [
            {**serialize(p), "balance": str(account_balance(db, p.id))}
            for p in db.scalars(select(Party).order_by(Party.name))
        ],
        "documents": docs,
        "payments": payments,
        "receipts": [
            {
                **{k: v for k, v in serialize(r).items() if k != "snapshot"},
                "details": {
                    k: normalize_language(v) if k == "language" else v
                    for k, v in r.snapshot.items()
                    if k not in ("company", "party")
                },
            }
            for r in db.scalars(select(Receipt).order_by(Receipt.created_at.desc()))
        ],
        "movements": [
            serialize(m)
            for m in db.scalars(select(Movement).order_by(Movement.created_at.desc()).limit(300))
        ],
        "activity": [
            serialize(a)
            for a in db.scalars(select(Activity).order_by(Activity.created_at.desc()).limit(50))
        ],
        "settings": {
            k: v
            for k, v in setting.data.items()
            if k not in ("tax_id", "default_tax", "company_name_ar")
        },
    }
