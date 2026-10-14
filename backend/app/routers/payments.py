from datetime import datetime, date
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.payment import Payment, PaymentAllocation
from app.models.sale import Sale
from app.models.purchase import Purchase
from app.models.party import Customer, Supplier
from app.models.user import User
from app.models.audit import ActivityLog
from app.schemas.payment import (
    PaymentCreate, PaymentResponse, PaymentReversalRequest, PaymentAllocationResponse
)
from app.services.auth_service import get_current_user, require_owner
from app.services.sequence_service import get_next_payment_number

router = APIRouter(prefix="/payments", tags=["payments"])

def round_money(val: Decimal) -> Decimal:
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

@router.get("", response_model=List[PaymentResponse])
def list_payments(
    party_type: Optional[str] = Query(None),
    customer_id: Optional[int] = Query(None),
    supplier_id: Optional[int] = Query(None),
    limit: int = Query(100, le=500),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Payment)
    if party_type:
        query = query.filter(Payment.party_type == party_type)
    if customer_id:
        query = query.filter(Payment.customer_id == customer_id)
    if supplier_id:
        query = query.filter(Payment.supplier_id == supplier_id)

    payments = query.order_by(Payment.payment_date.desc(), Payment.id.desc()).limit(limit).all()

    results = []
    for p in payments:
        resp = PaymentResponse.model_validate(p)
        resp.customer_name = p.customer.name if p.customer else None
        resp.supplier_name = p.supplier.name if p.supplier else None
        results.append(resp)
    return results

@router.post("", response_model=PaymentResponse)
def create_payment(
    payload: PaymentCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if payload.party_type not in ("customer", "supplier"):
        raise HTTPException(status_code=400, detail="party_type must be 'customer' or 'supplier'")

    if payload.party_type == "customer":
        if payload.customer_id is None:
            # SECTION 8 RULE: Named party is always required for deposit / debt
            raise HTTPException(status_code=400, detail="A named customer is required for recording customer payments and deposits")
        customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        supplier_id = None
        customer_id = payload.customer_id
    else:
        if payload.supplier_id is None:
            raise HTTPException(status_code=400, detail="A named supplier is required for recording supplier payments and advances")
        supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        customer_id = None
        supplier_id = payload.supplier_id

    total_allocated = Decimal("0.00")
    allocation_records = []

    # Process allocations
    for alloc in payload.allocations:
        if payload.party_type == "customer":
            sale = db.query(Sale).filter(Sale.id == alloc.invoice_id).with_for_update().first()
            if not sale:
                raise HTTPException(status_code=404, detail=f"Sale invoice {alloc.invoice_id} not found")
            if sale.customer_id != customer_id:
                raise HTTPException(status_code=400, detail=f"Invoice {sale.invoice_number} does not belong to this customer")
            
            if alloc.amount > sale.remaining_amount:
                raise HTTPException(
                    status_code=400,
                    detail=f"Allocation amount ({alloc.amount}) exceeds remaining balance ({sale.remaining_amount}) of invoice {sale.invoice_number}"
                )

            sale.paid_amount += alloc.amount
            sale.remaining_amount -= alloc.amount
            if sale.remaining_amount <= 0:
                sale.payment_status = "paid"
            else:
                sale.payment_status = "partially_paid"

            allocation_records.append({
                "sale_id": sale.id,
                "purchase_id": None,
                "amount": alloc.amount
            })

        else: # supplier
            purchase = db.query(Purchase).filter(Purchase.id == alloc.invoice_id).with_for_update().first()
            if not purchase:
                raise HTTPException(status_code=404, detail=f"Purchase order {alloc.invoice_id} not found")
            if purchase.supplier_id != supplier_id:
                raise HTTPException(status_code=400, detail=f"Purchase {purchase.reference_number} does not belong to this supplier")

            if alloc.amount > purchase.remaining_amount:
                raise HTTPException(
                    status_code=400,
                    detail=f"Allocation amount ({alloc.amount}) exceeds remaining balance ({purchase.remaining_amount}) of purchase {purchase.reference_number}"
                )

            purchase.paid_amount += alloc.amount
            purchase.remaining_amount -= alloc.amount
            if purchase.remaining_amount <= 0:
                purchase.payment_status = "paid"
            else:
                purchase.payment_status = "partially_paid"

            allocation_records.append({
                "sale_id": None,
                "purchase_id": purchase.id,
                "amount": alloc.amount
            })

        total_allocated += alloc.amount

    if total_allocated > payload.amount:
        raise HTTPException(
            status_code=400,
            detail=f"Total allocated amount ({total_allocated}) cannot exceed payment amount ({payload.amount})"
        )

    unallocated_amount = payload.amount - total_allocated
    pay_no = get_next_payment_number(db)

    payment = Payment(
        payment_number=pay_no,
        party_type=payload.party_type,
        customer_id=customer_id,
        supplier_id=supplier_id,
        amount=payload.amount,
        allocated_amount=total_allocated,
        unallocated_amount=unallocated_amount,
        payment_date=payload.payment_date or date.today(),
        payment_method=payload.payment_method,
        reference_no=payload.reference_no,
        notes=payload.notes,
        created_by_id=current_user.id
    )
    db.add(payment)
    db.flush()

    for rec in allocation_records:
        pa = PaymentAllocation(
            payment_id=payment.id,
            sale_id=rec["sale_id"],
            purchase_id=rec["purchase_id"],
            allocated_amount=rec["amount"]
        )
        db.add(pa)

    db.commit()
    db.refresh(payment)
    resp = PaymentResponse.model_validate(payment)
    if payment.customer:
        resp.customer_name = payment.customer.name
    if payment.supplier:
        resp.supplier_name = payment.supplier.name
    return resp

@router.post("/{payment_id}/reverse", response_model=PaymentResponse)
def reverse_payment(
    payment_id: int,
    payload: PaymentReversalRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    payment = db.query(Payment).filter(Payment.id == payment_id).with_for_update().first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.is_reversed:
        raise HTTPException(status_code=400, detail="This payment has already been reversed")

    # Undo allocations
    for alloc in payment.allocations:
        if alloc.sale_id:
            sale = db.query(Sale).filter(Sale.id == alloc.sale_id).with_for_update().first()
            if sale:
                sale.paid_amount -= alloc.allocated_amount
                sale.remaining_amount += alloc.allocated_amount
                if sale.remaining_amount >= sale.total_amount:
                    sale.payment_status = "unpaid"
                else:
                    sale.payment_status = "partially_paid"
        elif alloc.purchase_id:
            purchase = db.query(Purchase).filter(Purchase.id == alloc.purchase_id).with_for_update().first()
            if purchase:
                purchase.paid_amount -= alloc.allocated_amount
                purchase.remaining_amount += alloc.allocated_amount
                if purchase.remaining_amount >= purchase.total_amount:
                    purchase.payment_status = "unpaid"
                else:
                    purchase.payment_status = "partially_paid"

    payment.is_reversed = True
    payment.reversal_reason = payload.reason
    payment.reversed_at = datetime.utcnow()
    # Unallocated is zeroed out as well since the whole payment is reversed
    payment.unallocated_amount = Decimal("0.00")

    # Audit log
    audit = ActivityLog(
        user_id=current_user.id,
        action="payment_reversed",
        entity_type="payment",
        entity_id=payment.id,
        details=f"Payment {payment.payment_number} ({payment.amount} MAD) reversed. Reason: {payload.reason}"
    )
    db.add(audit)

    db.commit()
    db.refresh(payment)
    resp = PaymentResponse.model_validate(payment)
    if payment.customer:
        resp.customer_name = payment.customer.name
    if payment.supplier:
        resp.supplier_name = payment.supplier.name
    return resp
