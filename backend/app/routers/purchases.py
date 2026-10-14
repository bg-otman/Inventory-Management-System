from datetime import datetime, date
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.purchase import Purchase, PurchaseLine
from app.models.party import Supplier
from app.models.catalog import Product
from app.models.inventory import Warehouse
from app.models.payment import Payment, PaymentAllocation
from app.models.user import User
from app.schemas.purchase import (
    PurchaseCreate, PurchaseResponse, RecordSupplierInvoiceRequest
)
from app.services.auth_service import get_current_user
from app.services.stock_service import apply_stock_change
from app.services.sequence_service import get_next_purchase_number, get_next_payment_number

router = APIRouter(prefix="/purchases", tags=["purchases"])

def round_money(val: Decimal) -> Decimal:
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

@router.get("", response_model=List[PurchaseResponse])
def list_purchases(
    supplier_id: Optional[int] = Query(None),
    receipt_status: Optional[str] = Query(None),
    invoice_status: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Purchase).join(Supplier, Purchase.supplier_id == Supplier.id).join(Warehouse, Purchase.warehouse_id == Warehouse.id)
    if supplier_id:
        query = query.filter(Purchase.supplier_id == supplier_id)
    if receipt_status:
        query = query.filter(Purchase.receipt_status == receipt_status)
    if invoice_status:
        query = query.filter(Purchase.invoice_status == invoice_status)
    if payment_status:
        query = query.filter(Purchase.payment_status == payment_status)

    purchases = query.order_by(Purchase.created_at.desc()).limit(limit).all()

    results = []
    for p in purchases:
        resp = PurchaseResponse.model_validate(p)
        resp.supplier_name = p.supplier.name if p.supplier else "-"
        resp.warehouse_name = p.warehouse.name if p.warehouse else "-"
        results.append(resp)
    return results

@router.get("/{purchase_id}", response_model=PurchaseResponse)
def get_purchase(
    purchase_id: int,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    p = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Purchase not found")
    resp = PurchaseResponse.model_validate(p)
    resp.supplier_name = p.supplier.name if p.supplier else "-"
    resp.warehouse_name = p.warehouse.name if p.warehouse else "-"
    return resp

@router.post("", response_model=PurchaseResponse)
def create_purchase(
    payload: PurchaseCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    warehouse = db.query(Warehouse).filter(Warehouse.id == payload.warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    total_amount = Decimal("0.00")
    prepared_lines = []
    for item in payload.lines:
        prod = db.query(Product).filter(Product.id == item.product_id).first()
        if not prod:
            raise HTTPException(status_code=404, detail=f"Product with ID {item.product_id} not found")

        line_total = round_money(item.quantity * item.unit_cost)
        total_amount += line_total
        prepared_lines.append({
            "product": prod,
            "quantity": item.quantity,
            "unit_cost": item.unit_cost,
            "line_total": line_total
        })

    initial_pay = payload.initial_payment_amount or Decimal("0.00")
    if initial_pay > total_amount:
        raise HTTPException(status_code=400, detail="Initial payment cannot exceed purchase total")

    if initial_pay >= total_amount:
        p_status = "paid"
    elif initial_pay > 0:
        p_status = "partially_paid"
    else:
        p_status = "unpaid"

    rem_amount = total_amount - initial_pay
    ref_no = get_next_purchase_number(db)

    purchase = Purchase(
        reference_number=ref_no,
        supplier_id=payload.supplier_id,
        warehouse_id=payload.warehouse_id,
        supplier_invoice_ref=payload.supplier_invoice_ref,
        supplier_invoice_date=payload.supplier_invoice_date,
        total_amount=total_amount,
        paid_amount=initial_pay,
        remaining_amount=rem_amount,
        receipt_status="received" if payload.receive_now else "pending",
        received_at=datetime.utcnow() if payload.receive_now else None,
        invoice_status="recorded" if payload.record_invoice_now else "not_recorded",
        invoiced_at=datetime.utcnow() if payload.record_invoice_now else None,
        payment_status=p_status,
        notes=payload.notes,
        created_by_id=current_user.id
    )
    db.add(purchase)
    db.flush()

    for pl in prepared_lines:
        line = PurchaseLine(
            purchase_id=purchase.id,
            product_id=pl["product"].id,
            product_name_snapshot=pl["product"].name,
            unit_snapshot=pl["product"].unit,
            quantity=pl["quantity"],
            unit_cost=pl["unit_cost"],
            line_total=pl["line_total"]
        )
        db.add(line)

        if payload.receive_now:
            apply_stock_change(
                db=db,
                warehouse_id=payload.warehouse_id,
                product_id=pl["product"].id,
                delta=pl["quantity"],
                movement_type="receipt",
                reference_type="purchase",
                reference_id=purchase.id,
                reason=f"Purchase {ref_no} receipt",
                user_id=current_user.id
            )

    # Initial payment
    if initial_pay > 0:
        pay_no = get_next_payment_number(db)
        payment = Payment(
            payment_number=pay_no,
            party_type="supplier",
            supplier_id=payload.supplier_id,
            amount=initial_pay,
            allocated_amount=initial_pay,
            unallocated_amount=Decimal("0.00"),
            payment_date=date.today(),
            payment_method=payload.payment_method,
            notes=f"Initial payment for purchase {ref_no}",
            created_by_id=current_user.id
        )
        db.add(payment)
        db.flush()

        alloc = PaymentAllocation(
            payment_id=payment.id,
            purchase_id=purchase.id,
            allocated_amount=initial_pay
        )
        db.add(alloc)

    db.commit()
    db.refresh(purchase)
    resp = PurchaseResponse.model_validate(purchase)
    resp.supplier_name = supplier.name
    resp.warehouse_name = warehouse.name
    return resp

@router.post("/{purchase_id}/receive", response_model=PurchaseResponse)
def receive_goods(
    purchase_id: int,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    if purchase.receipt_status == "received":
        raise HTTPException(status_code=400, detail="Goods have already been received for this purchase")

    for line in purchase.lines:
        apply_stock_change(
            db=db,
            warehouse_id=purchase.warehouse_id,
            product_id=line.product_id,
            delta=line.quantity,
            movement_type="receipt",
            reference_type="purchase",
            reference_id=purchase.id,
            reason=f"Purchase {purchase.reference_number} goods receipt",
            user_id=current_user.id
        )

    purchase.receipt_status = "received"
    purchase.received_at = datetime.utcnow()
    db.commit()
    db.refresh(purchase)
    resp = PurchaseResponse.model_validate(purchase)
    resp.supplier_name = purchase.supplier.name if purchase.supplier else "-"
    resp.warehouse_name = purchase.warehouse.name if purchase.warehouse else "-"
    return resp

@router.post("/{purchase_id}/record-invoice", response_model=PurchaseResponse)
def record_invoice(
    purchase_id: int,
    payload: RecordSupplierInvoiceRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    if purchase.invoice_status == "recorded":
        raise HTTPException(status_code=400, detail="Supplier invoice has already been recorded")

    purchase.supplier_invoice_ref = payload.supplier_invoice_ref
    purchase.supplier_invoice_date = payload.supplier_invoice_date or date.today()
    purchase.invoice_status = "recorded"
    purchase.invoiced_at = datetime.utcnow()

    db.commit()
    db.refresh(purchase)
    resp = PurchaseResponse.model_validate(purchase)
    resp.supplier_name = purchase.supplier.name if purchase.supplier else "-"
    resp.warehouse_name = purchase.warehouse.name if purchase.warehouse else "-"
    return resp
