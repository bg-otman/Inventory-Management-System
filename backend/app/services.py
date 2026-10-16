from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from sqlalchemy import select, func
from fastapi import HTTPException
from .models import *

ZERO = Decimal("0")
ACTOR = "local"
MAX_MONEY = Decimal("99999999999999.99")
MAX_QUANTITY = Decimal("9999999999999.999")
def money(value):
    amount = Decimal(value)
    if not amount.is_finite() or abs(amount) > MAX_MONEY:
        raise HTTPException(422, "Amount exceeds the supported limit.")
    return amount.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
def require(db, model, key):
    value = db.get(model, key)
    if value is None: raise HTTPException(404, "Record not found.")
    return value
def activity(db, user, action, label):
    db.add(Activity(actor=user or ACTOR, action=action, label=str(label)[:200]))
def serialize(row):
    result = {}
    for c in row.__table__.columns:
        v = getattr(row, c.name)
        result[c.name] = str(v) if isinstance(v, Decimal) else (v.isoformat()+"Z" if isinstance(v, datetime) else v)
    return result

def paid(db, doc):
    return db.scalar(select(func.coalesce(func.sum(Allocation.amount), 0)).join(Payment, Payment.id==Allocation.payment_id)
        .where(Allocation.document_id==doc.id, Payment.reversed==False)) or ZERO

def unused(db, payment):
    if payment.reversed: return ZERO
    return payment.amount - (db.scalar(select(func.coalesce(func.sum(Allocation.amount),0))
        .where(Allocation.payment_id==payment.id)) or ZERO)

def quantity_valid(product, amount):
    if product.unit in ("unit","piece","carton") and amount != amount.to_integral_value():
        raise HTTPException(422, "This product requires a whole quantity.")

def move(db, user, product_id, warehouse_id, delta, reason, source=None):
    p = require(db, Product, product_id); require(db, Warehouse, warehouse_id)
    quantity_valid(p, abs(delta))
    if delta == 0: raise HTTPException(422, "Quantity must not be zero.")
    stock = db.get(Stock, (product_id, warehouse_id))
    if stock is None:
        stock = Stock(product_id=product_id,warehouse_id=warehouse_id,quantity=ZERO)
        db.add(stock); db.flush()
    if stock.quantity + delta < 0: raise HTTPException(409, "Not enough stock for this operation.")
    if stock.quantity + delta > MAX_QUANTITY: raise HTTPException(422, "Stock quantity exceeds the supported limit.")
    stock.quantity += delta
    db.add(Movement(product_id=product_id,warehouse_id=warehouse_id,quantity=delta,reason=reason,source_id=source,actor=user or ACTOR))

def product_save(db,user,data,product_id=None):
    require(db,Category,data.category_id)
    supplier=require(db,Party,data.supplier_id)
    if supplier.kind!="supplier":
        raise HTTPException(422,"Select a supplier for this product.")
    values=data.model_dump()
    values["sku"] = data.sku.strip().upper() if data.sku and data.sku.strip() else None
    values["barcode"] = data.barcode.strip() if data.barcode and data.barcode.strip() else None
    if product_id:
        p=require(db,Product,product_id)
        if p.unit != data.unit and db.scalar(select(Movement.id).where(Movement.product_id==p.id).limit(1)):
            raise HTTPException(409,"A product unit cannot change after stock activity.")
        for k,v in values.items(): setattr(p,k,v)
    else:
        p=Product(**values);db.add(p)
    db.flush()
    activity(db,user,"product.updated" if product_id else "product.created",p.name)
    return {"id":p.id}

def document_lines(db,doc): return list(db.scalars(select(Line).where(Line.document_id==doc.id).order_by(Line.id)))

def recalculate(db,doc,final=False):
    lines=document_lines(db,doc)
    if final and any(line.price is None for line in lines):
        raise HTTPException(422,"Enter an explicit price for every product.")
    doc.subtotal=money(sum((money(line.quantity*line.price) for line in lines if line.price is not None),ZERO))
    if doc.discount > doc.subtotal: raise HTTPException(422,"Discount exceeds the subtotal.")
    doc.tax=ZERO;doc.tax_rate=ZERO
    doc.total=money(doc.subtotal-doc.discount)

def fulfill(db,user,doc):
    if doc.status=="reversed": raise HTTPException(409,"This record was reversed.")
    if doc.fulfilled: return
    if doc.kind=="sale" and doc.status!="confirmed": raise HTTPException(409,"Confirm the invoice before delivery.")
    for line in document_lines(db,doc):
        move(db,user,line.product_id,doc.warehouse_id,line.quantity*(-1 if doc.kind=="sale" else 1),
             "Sale delivery" if doc.kind=="sale" else "Purchase receipt",doc.id)
    doc.fulfilled=True;doc.fulfilled_at=now()
    activity(db,user,"sale.delivered" if doc.kind=="sale" else "purchase.received",doc.number or "Pending invoice")

def allocate(db,user,payment,allocations):
    if payment.reversed: raise HTTPException(409,"This payment was reversed.")
    for a in allocations:
        doc=require(db,Document,a.document_id)
        if doc.status!="confirmed" or doc.party_id!=payment.party_id:
            raise HTTPException(422,"Payment and invoice must belong to the same customer or supplier.")
        amount=money(a.amount)
        if amount > unused(db,payment) or amount > doc.total-paid(db,doc):
            raise HTTPException(409,"Allocation exceeds the available payment or invoice balance.")
        db.add(Allocation(payment_id=payment.id,document_id=doc.id,amount=amount));db.flush()

def record_payment(db,user,data):
    require(db,Party,data.party_id)
    payment=Payment(party_id=data.party_id,amount=data.amount,paid_at=data.paid_at.isoformat(),
        method=data.method,reference=data.reference,actor=user or ACTOR)
    db.add(payment);db.flush();allocate(db,user,payment,data.allocations)
    activity(db,user,"payment.recorded",str(payment.amount)+" MAD")
    return {"id":payment.id}

def confirm(db,user,doc,payment_amount=ZERO):
    if doc.status!="draft": raise HTTPException(409,"Only a draft can be confirmed.")
    recalculate(db,doc,True)
    if doc.kind=="sale" and not doc.party_id and payment_amount!=doc.total:
        raise HTTPException(422,"Walk-in sales must be paid in full. Select a customer for credit or deposits.")
    if payment_amount>doc.total: raise HTTPException(422,"Record an extra deposit from the customer or supplier account.")
    setting=db.get(Setting,1)
    if doc.kind=="sale":
        doc.number=f"INV-{setting.next_invoice:06d}";setting.next_invoice+=1
    else:
        doc.number=f"PUR-{setting.next_purchase:06d}";setting.next_purchase+=1
    doc.status="confirmed";doc.issued_at=now()
    if payment_amount:
        p=Payment(party_id=doc.party_id,amount=payment_amount,paid_at=date.today().isoformat(),actor=user or ACTOR)
        db.add(p);db.flush()
        db.add(Allocation(payment_id=p.id,document_id=doc.id,amount=payment_amount))
    party=db.get(Party,doc.party_id) if doc.party_id else None
    doc.snapshot={"company":setting.data,"party":serialize(party) if party else None,
        "lines":[serialize(l) for l in document_lines(db,doc)],"paid_at_issue":str(payment_amount),
        "total":str(doc.total),"subtotal":str(doc.subtotal),"discount":str(doc.discount),
        "language":doc.language,"due_date":doc.due_date}
    activity(db,user,"sale.confirmed" if doc.kind=="sale" else "purchase.invoiced",doc.number)

def save_document(db,user,data,doc_id=None):
    require(db,Warehouse,data.warehouse_id)
    if data.party_id:
        party=require(db,Party,data.party_id)
        if party.kind != ("customer" if data.kind=="sale" else "supplier"): raise HTTPException(422,"Select the correct customer or supplier.")
    elif data.kind=="purchase": raise HTTPException(422,"Select a supplier.")
    if not data.confirm and data.payment: raise HTTPException(422,"Use the account payment action for a deposit before invoicing.")
    if doc_id:
        doc=require(db,Document,doc_id)
        if doc.status!="draft": raise HTTPException(409,"Posted invoices cannot be edited.")
        if doc.kind!=data.kind: raise HTTPException(422,"Document type cannot change.")
        old=document_lines(db,doc)
        if doc.fulfilled:
            before=sorted((l.product_id,str(l.quantity.normalize())) for l in old)
            after=sorted((l.product_id,str(l.quantity.normalize())) for l in data.items)
            if before!=after or doc.warehouse_id!=data.warehouse_id or doc.party_id!=data.party_id:
                raise HTTPException(409,"Received quantities, warehouse, and supplier cannot change.")
        for line in old: db.delete(line)
    else:
        doc=Document(kind=data.kind,warehouse_id=data.warehouse_id,actor=user or ACTOR,status="draft",fulfilled=False)
        db.add(doc);db.flush()
    for k in ("party_id","warehouse_id","discount","language","reference"): setattr(doc,k,getattr(data,k))
    doc.due_date=data.due_date.isoformat() if data.due_date else None
    for line in data.items:
        product=require(db,Product,line.product_id)
        if not product.active: raise HTTPException(422,"This product is archived.")
        quantity_valid(product,line.quantity)
        db.add(Line(document_id=doc.id,product_id=product.id,name=product.name,unit=product.unit,quantity=line.quantity,price=line.price))
    db.flush();recalculate(db,doc)
    if data.confirm: confirm(db,user,doc,data.payment)
    if data.fulfill:
        if data.kind=="purchase" or data.confirm: fulfill(db,user,doc)
    activity(db,user,"document.saved",doc.number or "Draft")
    return {"id":doc.id}

def reverse_document(db,user,doc,reason):
    if doc.status=="reversed": raise HTTPException(409,"Already reversed.")
    if paid(db,doc)>0: raise HTTPException(409,"Reverse allocated payments before reversing this document.")
    if doc.fulfilled:
        for line in document_lines(db,doc):
            move(db,user,line.product_id,doc.warehouse_id,line.quantity*(1 if doc.kind=="sale" else -1),"Reversal: "+reason,doc.id)
    doc.status="reversed"
    activity(db,user,"document.reversed",(doc.number or "Draft")+": "+reason)

def state(db,user=ACTOR):
    docs=[]
    for d in db.scalars(select(Document).order_by(Document.created_at.desc())):
        data=serialize(d);data["items"]=[serialize(l) for l in document_lines(db,d)]
        data.pop("tax",None);data.pop("tax_rate",None)
        data["snapshot"]={k:v for k,v in data["snapshot"].items() if k not in ("tax","tax_rate")}
        if "company" in data["snapshot"]:
            data["snapshot"]["company"]={k:v for k,v in data["snapshot"]["company"].items() if k not in ("tax_id","default_tax")}
        data["paid"]=str(paid(db,d));docs.append(data)
    payments=[]
    for p in db.scalars(select(Payment).order_by(Payment.created_at.desc())):
        data=serialize(p);data["available"]=str(unused(db,p))
        data["allocations"]=[serialize(a) for a in db.scalars(select(Allocation).where(Allocation.payment_id==p.id))]
        payments.append(data)
    setting=db.get(Setting,1)
    return {"workspace":{"name":"Local workspace"},"user":{"role":"workspace"},
        "categories":[serialize(c) for c in db.scalars(select(Category).order_by(Category.name))],
        "warehouses":[serialize(w) for w in db.scalars(select(Warehouse).order_by(Warehouse.name))],
        "products":[serialize(p) for p in db.scalars(select(Product).order_by(Product.created_at.desc()))],
        "stock":[serialize(s) for s in db.scalars(select(Stock))],
        "parties":[serialize(p) for p in db.scalars(select(Party).order_by(Party.name))],
        "documents":docs,"payments":payments,
        "movements":[serialize(m) for m in db.scalars(select(Movement).order_by(Movement.created_at.desc()).limit(300))],
        "activity":[serialize(a) for a in db.scalars(select(Activity).order_by(Activity.created_at.desc()).limit(50))],
        "settings":{k:v for k,v in setting.data.items() if k not in ("tax_id","default_tax")}}
