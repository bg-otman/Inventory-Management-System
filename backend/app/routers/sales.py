from datetime import datetime, date
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.sale import Sale, SaleLine
from app.models.party import Customer
from app.models.catalog import Product
from app.models.inventory import Warehouse
from app.models.payment import Payment, PaymentAllocation
from app.models.settings import CompanySettings
from app.models.user import User
from app.schemas.sale import SaleCreate, SaleResponse, SaleLineResponse
from app.services.auth_service import get_current_user
from app.services.stock_service import apply_stock_change
from app.services.sequence_service import get_next_invoice_number, get_next_payment_number
from app.services.invoice_pdf import generate_invoice_pdf

router = APIRouter(prefix="/sales", tags=["sales"])

def round_money(val: Decimal) -> Decimal:
    return val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

@router.get("", response_model=List[SaleResponse])
def list_sales(
    customer_id: Optional[int] = Query(None),
    payment_status: Optional[str] = Query(None),
    delivery_status: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Sale)
    if customer_id:
        query = query.filter(Sale.customer_id == customer_id)
    if payment_status:
        query = query.filter(Sale.payment_status == payment_status)
    if delivery_status:
        query = query.filter(Sale.delivery_status == delivery_status)

    sales = query.order_by(Sale.issue_date.desc()).limit(limit).all()
    return sales

@router.get("/{sale_id}", response_model=SaleResponse)
def get_sale(
    sale_id: int,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale invoice not found")
    return sale

@router.post("", response_model=SaleResponse)
def create_sale(
    payload: SaleCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Validate customer / walk-in rules
    customer = None
    if payload.customer_id is not None:
        customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        customer_name_snapshot = customer.name
    else:
        customer_name_snapshot = "Walk-in Customer" if payload.language == "en" else "عميل عابر"

    # 2. Validate warehouse
    warehouse = db.query(Warehouse).filter(Warehouse.id == payload.warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    # 3. Fetch tax rate from company settings if not provided
    settings = db.query(CompanySettings).first()
    tax_rate = payload.tax_rate if payload.tax_rate is not None else (settings.default_tax_rate if settings else Decimal("20.00"))

    # 4. Calculate line items
    subtotal = Decimal("0.00")
    prepared_lines = []
    for item in payload.lines:
        prod = db.query(Product).filter(Product.id == item.product_id).first()
        if not prod:
            raise HTTPException(status_code=404, detail=f"Product with ID {item.product_id} not found")
        
        line_total = round_money(item.quantity * item.unit_price)
        subtotal += line_total
        prepared_lines.append({
            "product": prod,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "line_total": line_total
        })

    # Validate discount
    if payload.discount > subtotal:
        raise HTTPException(status_code=400, detail="Discount cannot exceed subtotal")

    taxable_amount = subtotal - payload.discount
    tax_amount = round_money(taxable_amount * (tax_rate / Decimal("100.00")))
    total_amount = taxable_amount + tax_amount

    # 5. Handle initial payment & walk-in customer validation
    initial_pay = payload.initial_payment_amount or Decimal("0.00")
    if initial_pay > total_amount:
        raise HTTPException(status_code=400, detail="Initial payment cannot exceed invoice total")

    # SECTION 6 RULE: Walk-in customers MUST be paid in full
    if payload.customer_id is None and initial_pay < total_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Walk-in sales must be paid in full. To leave an unpaid balance, please select or create a named customer."
        )

    # Determine payment status
    if initial_pay >= total_amount:
        p_status = "paid"
    elif initial_pay > 0:
        p_status = "partially_paid"
    else:
        p_status = "unpaid"

    rem_amount = total_amount - initial_pay
    inv_number = get_next_invoice_number(db)

    # 6. Create Sale record
    sale = Sale(
        invoice_number=inv_number,
        customer_id=payload.customer_id,
        customer_name_snapshot=customer_name_snapshot,
        warehouse_id=payload.warehouse_id,
        subtotal=subtotal,
        discount=payload.discount,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        total_amount=total_amount,
        paid_amount=initial_pay,
        remaining_amount=rem_amount,
        payment_status=p_status,
        delivery_status="delivered" if payload.delivered_now else "pending",
        delivered_at=datetime.utcnow() if payload.delivered_now else None,
        due_date=payload.due_date,
        issue_date=datetime.utcnow(),
        language=payload.language,
        notes=payload.notes,
        created_by_id=current_user.id
    )
    db.add(sale)
    db.flush()

    # 7. Create Sale lines and handle immediate delivery if requested
    for pl in prepared_lines:
        line = SaleLine(
            sale_id=sale.id,
            product_id=pl["product"].id,
            product_name_snapshot=pl["product"].name,
            unit_snapshot=pl["product"].unit,
            quantity=pl["quantity"],
            unit_price=pl["unit_price"],
            line_total=pl["line_total"]
        )
        db.add(line)

        if payload.delivered_now:
            # Deliver now reduces stock atomically
            apply_stock_change(
                db=db,
                warehouse_id=payload.warehouse_id,
                product_id=pl["product"].id,
                delta=-pl["quantity"],
                movement_type="delivery",
                reference_type="sale",
                reference_id=sale.id,
                reason=f"Sale {inv_number} delivery",
                user_id=current_user.id
            )

    # 8. Record initial payment if provided
    if initial_pay > 0:
        pay_no = get_next_payment_number(db)
        payment = Payment(
            payment_number=pay_no,
            party_type="customer",
            customer_id=payload.customer_id,
            amount=initial_pay,
            allocated_amount=initial_pay,
            unallocated_amount=Decimal("0.00"),
            payment_date=date.today(),
            payment_method=payload.payment_method,
            reference_no=payload.payment_reference,
            notes=f"Initial payment for invoice {inv_number}",
            created_by_id=current_user.id
        )
        db.add(payment)
        db.flush()

        alloc = PaymentAllocation(
            payment_id=payment.id,
            sale_id=sale.id,
            allocated_amount=initial_pay
        )
        db.add(alloc)

    db.commit()
    db.refresh(sale)
    return sale

@router.post("/{sale_id}/deliver", response_model=SaleResponse)
def mark_delivered(
    sale_id: int,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale invoice not found")

    if sale.delivery_status == "delivered":
        raise HTTPException(status_code=400, detail="This sale has already been marked as delivered")

    # Atomically reduce stock for all lines
    for line in sale.lines:
        apply_stock_change(
            db=db,
            warehouse_id=sale.warehouse_id,
            product_id=line.product_id,
            delta=-line.quantity,
            movement_type="delivery",
            reference_type="sale",
            reference_id=sale.id,
            reason=f"Sale {sale.invoice_number} later delivery",
            user_id=current_user.id
        )

    sale.delivery_status = "delivered"
    sale.delivered_at = datetime.utcnow()
    db.commit()
    db.refresh(sale)
    return sale

@router.get("/{sale_id}/pdf")
def download_invoice_pdf(
    sale_id: int,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    company = db.query(CompanySettings).first()
    if not company:
        company = CompanySettings()

    pdf_bytes = generate_invoice_pdf(sale, company)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={sale.invoice_number}.pdf"}
    )
