from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session as DBSession
from fastapi import HTTPException, status
from app.models.inventory import StockBalance, StockMovement, Warehouse
from app.models.catalog import Product

def get_or_create_stock_balance(db: DBSession, warehouse_id: int, product_id: int, for_update: bool = True) -> StockBalance:
    query = db.query(StockBalance).filter(
        StockBalance.warehouse_id == warehouse_id,
        StockBalance.product_id == product_id
    )
    if for_update:
        query = query.with_for_update()
    
    balance = query.first()
    if not balance:
        balance = StockBalance(
            warehouse_id=warehouse_id,
            product_id=product_id,
            quantity=Decimal("0.00")
        )
        db.add(balance)
        db.flush()
        if for_update:
            balance = db.query(StockBalance).filter(
                StockBalance.id == balance.id
            ).with_for_update().first()
    return balance

def apply_stock_change(
    db: DBSession,
    warehouse_id: int,
    product_id: int,
    delta: Decimal,
    movement_type: str,
    reference_type: str,
    reference_id: Optional[int] = None,
    reason: Optional[str] = None,
    user_id: Optional[int] = None
) -> StockBalance:
    """
    Atomically updates stock balance and creates a stock movement log.
    If delta is negative (e.g. delivery, transfer out, adjustment down),
    checks that current_stock + delta >= 0. Raises 400 if it would make stock negative.
    """
    # Verify product and warehouse exist
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail=f"Product with ID {product_id} not found")
    
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail=f"Warehouse with ID {warehouse_id} not found")

    balance = get_or_create_stock_balance(db, warehouse_id, product_id, for_update=True)
    new_quantity = balance.quantity + delta

    if new_quantity < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Insufficient stock for product '{product.name}' in warehouse '{warehouse.name}'. "
                f"Available: {balance.quantity} {product.unit}, Requested reduction: {abs(delta)} {product.unit}."
            )
        )

    balance.quantity = new_quantity
    db.flush()

    # Create movement ledger record
    movement = StockMovement(
        warehouse_id=warehouse_id,
        product_id=product_id,
        movement_type=movement_type,
        quantity=delta,
        balance_after=new_quantity,
        reference_type=reference_type,
        reference_id=reference_id,
        reason=reason,
        created_by_id=user_id
    )
    db.add(movement)
    db.flush()

    return balance
