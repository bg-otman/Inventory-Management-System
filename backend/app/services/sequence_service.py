from sqlalchemy.orm import Session as DBSession
from app.models.sale import InvoiceSequence
from app.models.purchase import PurchaseSequence
from app.models.payment import PaymentSequence

def get_next_invoice_number(db: DBSession) -> str:
    seq = db.query(InvoiceSequence).with_for_update().first()
    if not seq:
        seq = InvoiceSequence(last_val=0)
        db.add(seq)
        db.flush()
    seq.last_val += 1
    db.flush()
    return f"INV-{seq.last_val:06d}"

def get_next_purchase_number(db: DBSession) -> str:
    seq = db.query(PurchaseSequence).with_for_update().first()
    if not seq:
        seq = PurchaseSequence(last_val=0)
        db.add(seq)
        db.flush()
    seq.last_val += 1
    db.flush()
    return f"PO-{seq.last_val:06d}"

def get_next_payment_number(db: DBSession) -> str:
    seq = db.query(PaymentSequence).with_for_update().first()
    if not seq:
        seq = PaymentSequence(last_val=0)
        db.add(seq)
        db.flush()
    seq.last_val += 1
    db.flush()
    return f"PAY-{seq.last_val:06d}"
