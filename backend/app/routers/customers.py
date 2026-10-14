from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import or_, func
from app.database import get_db
from app.models.party import Customer
from app.models.sale import Sale
from app.models.payment import Payment
from app.models.user import User
from app.schemas.party import (
    CustomerCreate, CustomerUpdate, CustomerResponse
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/customers", tags=["customers"])

def get_customer_balances(customer_id: int, db: DBSession) -> tuple[Decimal, Decimal]:
    # 1. Total receivable = sum of remaining_amount on unpaid/partially paid sales
    total_receivable = db.query(func.coalesce(func.sum(Sale.remaining_amount), 0.00)).filter(
        Sale.customer_id == customer_id,
        Sale.payment_status.in_(["unpaid", "partially_paid"])
    ).scalar()

    # 2. Total unused deposit = sum of unallocated_amount on non-reversed payments
    unused_deposit = db.query(func.coalesce(func.sum(Payment.unallocated_amount), 0.00)).filter(
        Payment.customer_id == customer_id,
        Payment.party_type == "customer",
        Payment.is_reversed == False,
        Payment.unallocated_amount > 0
    ).scalar()

    return Decimal(str(total_receivable)), Decimal(str(unused_deposit))

@router.get("", response_model=List[CustomerResponse])
def list_customers(
    search: Optional[str] = Query(None),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Customer).filter(Customer.is_active == True)
    if search:
        s = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(Customer.name).like(s),
                func.lower(Customer.phone).like(s)
            )
        )
    customers = query.order_by(Customer.name.asc()).all()
    results = []
    for c in customers:
        rec, dep = get_customer_balances(c.id, db)
        resp = CustomerResponse.model_validate(c)
        resp.total_receivable = rec
        resp.unused_deposit = dep
        results.append(resp)
    return results

@router.post("", response_model=CustomerResponse)
def create_customer(
    payload: CustomerCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    c = Customer(
        name=payload.name,
        phone=payload.phone,
        address=payload.address,
        email=payload.email,
        notes=payload.notes,
        is_active=True
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    resp = CustomerResponse.model_validate(c)
    resp.total_receivable = Decimal("0.00")
    resp.unused_deposit = Decimal("0.00")
    return resp

@router.get("/{customer_id}")
def get_customer_detail(
    customer_id: int,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")

    rec, dep = get_customer_balances(c.id, db)

    # Invoices
    sales = db.query(Sale).filter(Sale.customer_id == customer_id).order_by(Sale.issue_date.desc()).all()
    
    # Payments
    payments = db.query(Payment).filter(
        Payment.customer_id == customer_id,
        Payment.party_type == "customer"
    ).order_by(Payment.payment_date.desc()).all()

    return {
        "customer": CustomerResponse.model_validate(c),
        "total_receivable": rec,
        "unused_deposit": dep,
        "sales": sales,
        "payments": payments
    }

@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")

    if payload.name is not None:
        c.name = payload.name
    if payload.phone is not None:
        c.phone = payload.phone
    if payload.address is not None:
        c.address = payload.address
    if payload.email is not None:
        c.email = payload.email
    if payload.notes is not None:
        c.notes = payload.notes
    if payload.is_active is not None:
        c.is_active = payload.is_active

    db.commit()
    db.refresh(c)
    rec, dep = get_customer_balances(c.id, db)
    resp = CustomerResponse.model_validate(c)
    resp.total_receivable = rec
    resp.unused_deposit = dep
    return resp
