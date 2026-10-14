from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import or_, func
from app.database import get_db
from app.models.party import Supplier
from app.models.purchase import Purchase
from app.models.payment import Payment
from app.models.user import User
from app.schemas.party import (
    SupplierCreate, SupplierUpdate, SupplierResponse
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

def get_supplier_balances(supplier_id: int, db: DBSession) -> tuple[Decimal, Decimal]:
    # 1. Total payable = sum of remaining_amount on unpaid/partially paid purchases where invoice recorded
    total_payable = db.query(func.coalesce(func.sum(Purchase.remaining_amount), 0.00)).filter(
        Purchase.supplier_id == supplier_id,
        Purchase.invoice_status == "recorded",
        Purchase.payment_status.in_(["unpaid", "partially_paid"])
    ).scalar()

    # 2. Total unused advance = sum of unallocated_amount on non-reversed payments
    unused_advance = db.query(func.coalesce(func.sum(Payment.unallocated_amount), 0.00)).filter(
        Payment.supplier_id == supplier_id,
        Payment.party_type == "supplier",
        Payment.is_reversed == False,
        Payment.unallocated_amount > 0
    ).scalar()

    return Decimal(str(total_payable)), Decimal(str(unused_advance))

@router.get("", response_model=List[SupplierResponse])
def list_suppliers(
    search: Optional[str] = Query(None),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Supplier).filter(Supplier.is_active == True)
    if search:
        s = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(Supplier.name).like(s),
                func.lower(Supplier.phone).like(s)
            )
        )
    suppliers = query.order_by(Supplier.name.asc()).all()
    results = []
    for sup in suppliers:
        pay, adv = get_supplier_balances(sup.id, db)
        resp = SupplierResponse.model_validate(sup)
        resp.total_payable = pay
        resp.unused_advance = adv
        results.append(resp)
    return results

@router.post("", response_model=SupplierResponse)
def create_supplier(
    payload: SupplierCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sup = Supplier(
        name=payload.name,
        phone=payload.phone,
        address=payload.address,
        email=payload.email,
        contact_person=payload.contact_person,
        notes=payload.notes,
        is_active=True
    )
    db.add(sup)
    db.commit()
    db.refresh(sup)
    resp = SupplierResponse.model_validate(sup)
    resp.total_payable = Decimal("0.00")
    resp.unused_advance = Decimal("0.00")
    return resp

@router.get("/{supplier_id}")
def get_supplier_detail(
    supplier_id: int,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sup = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found")

    pay, adv = get_supplier_balances(sup.id, db)

    purchases = db.query(Purchase).filter(Purchase.supplier_id == supplier_id).order_by(Purchase.created_at.desc()).all()
    payments = db.query(Payment).filter(
        Payment.supplier_id == supplier_id,
        Payment.party_type == "supplier"
    ).order_by(Payment.payment_date.desc()).all()

    return {
        "supplier": SupplierResponse.model_validate(sup),
        "total_payable": pay,
        "unused_advance": adv,
        "purchases": purchases,
        "payments": payments
    }

@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sup = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found")

    if payload.name is not None:
        sup.name = payload.name
    if payload.phone is not None:
        sup.phone = payload.phone
    if payload.address is not None:
        sup.address = payload.address
    if payload.email is not None:
        sup.email = payload.email
    if payload.contact_person is not None:
        sup.contact_person = payload.contact_person
    if payload.notes is not None:
        sup.notes = payload.notes
    if payload.is_active is not None:
        sup.is_active = payload.is_active

    db.commit()
    db.refresh(sup)
    pay, adv = get_supplier_balances(sup.id, db)
    resp = SupplierResponse.model_validate(sup)
    resp.total_payable = pay
    resp.unused_advance = adv
    return resp
