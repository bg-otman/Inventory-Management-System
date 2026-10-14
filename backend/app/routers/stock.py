from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.catalog import Product
from app.models.inventory import StockBalance, StockMovement, Warehouse
from app.models.user import User
from app.schemas.inventory import (
    StockAdjustmentCreate, StockMovementResponse, LowStockAlertResponse
)
from app.services.auth_service import get_current_user
from app.services.stock_service import apply_stock_change

router = APIRouter(prefix="/stock", tags=["stock"])

@router.get("/movements", response_model=List[StockMovementResponse])
def list_stock_movements(
    warehouse_id: Optional[int] = Query(None),
    product_id: Optional[int] = Query(None),
    limit: int = Query(100, le=500),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(StockMovement).join(
        Warehouse, StockMovement.warehouse_id == Warehouse.id
    ).join(
        Product, StockMovement.product_id == Product.id
    ).outerjoin(
        User, StockMovement.created_by_id == User.id
    )

    if warehouse_id:
        query = query.filter(StockMovement.warehouse_id == warehouse_id)
    if product_id:
        query = query.filter(StockMovement.product_id == product_id)

    movements = query.order_by(StockMovement.created_at.desc()).limit(limit).all()

    results = []
    for m in movements:
        results.append(StockMovementResponse(
            id=m.id,
            warehouse_id=m.warehouse_id,
            warehouse_name=m.warehouse.name if m.warehouse else "-",
            product_id=m.product_id,
            product_name=m.product.name if m.product else "-",
            movement_type=m.movement_type,
            quantity=m.quantity,
            balance_after=m.balance_after,
            reference_type=m.reference_type,
            reference_id=m.reference_id,
            reason=m.reason,
            created_by_name=m.created_by.full_name if m.created_by else None,
            created_at=m.created_at
        ))
    return results

@router.post("/adjustments")
def create_stock_adjustment(
    payload: StockAdjustmentCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if payload.quantity == 0:
        raise HTTPException(status_code=400, detail="Adjustment quantity cannot be zero")

    apply_stock_change(
        db=db,
        warehouse_id=payload.warehouse_id,
        product_id=payload.product_id,
        delta=payload.quantity,
        movement_type="adjustment",
        reference_type="adjustment",
        reason=payload.reason,
        user_id=current_user.id
    )
    db.commit()
    return {"message": "Stock adjustment recorded successfully"}

@router.get("/alerts", response_model=List[LowStockAlertResponse])
def get_low_stock_alerts(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns active low-stock alerts where on-hand quantity is at or below its threshold.
    """
    rows = db.query(
        StockBalance, Product, Warehouse
    ).join(
        Product, StockBalance.product_id == Product.id
    ).join(
        Warehouse, StockBalance.warehouse_id == Warehouse.id
    ).filter(
        Product.is_active == True,
        Warehouse.is_active == True,
        StockBalance.quantity <= Product.low_stock_threshold
    ).order_by(StockBalance.quantity.asc()).all()

    alerts = []
    for bal, prod, wh in rows:
        alerts.append(LowStockAlertResponse(
            product_id=prod.id,
            product_name=prod.name,
            warehouse_id=wh.id,
            warehouse_name=wh.name,
            current_stock=bal.quantity,
            threshold=prod.low_stock_threshold,
            unit=prod.unit
        ))
    return alerts
