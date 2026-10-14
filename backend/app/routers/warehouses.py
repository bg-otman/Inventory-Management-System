import secrets
from typing import List
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.inventory import Warehouse, WarehouseTransfer, WarehouseTransferLine
from app.models.user import User
from app.schemas.inventory import (
    WarehouseCreate, WarehouseUpdate, WarehouseResponse, WarehouseTransferCreate
)
from app.services.auth_service import get_current_user
from app.services.stock_service import apply_stock_change

router = APIRouter(prefix="/warehouses", tags=["warehouses"])

@router.get("", response_model=List[WarehouseResponse])
def list_warehouses(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Warehouse).filter(Warehouse.is_active == True).order_by(Warehouse.id.asc()).all()

@router.post("", response_model=WarehouseResponse)
def create_warehouse(
    payload: WarehouseCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing = db.query(Warehouse).filter(Warehouse.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Warehouse with this name already exists")

    wh = Warehouse(
        name=payload.name,
        code=payload.code,
        address=payload.address,
        is_active=True
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh

@router.put("/{warehouse_id}", response_model=WarehouseResponse)
def update_warehouse(
    warehouse_id: int,
    payload: WarehouseUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    if payload.name:
        existing = db.query(Warehouse).filter(
            Warehouse.name == payload.name,
            Warehouse.id != warehouse_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Warehouse with this name already exists")
        wh.name = payload.name

    if payload.code is not None:
        wh.code = payload.code
    if payload.address is not None:
        wh.address = payload.address
    if payload.is_active is not None:
        wh.is_active = payload.is_active

    db.commit()
    db.refresh(wh)
    return wh

@router.post("/transfer")
def transfer_stock(
    payload: WarehouseTransferCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if payload.source_warehouse_id == payload.dest_warehouse_id:
        raise HTTPException(status_code=400, detail="Source and destination warehouses must be different")

    if not payload.lines:
        raise HTTPException(status_code=400, detail="Transfer must contain at least one product")

    src = db.query(Warehouse).filter(Warehouse.id == payload.source_warehouse_id).first()
    dst = db.query(Warehouse).filter(Warehouse.id == payload.dest_warehouse_id).first()
    if not src or not dst:
        raise HTTPException(status_code=404, detail="One or both warehouses not found")

    ref_no = f"TR-{secrets.token_hex(4).upper()}"
    transfer = WarehouseTransfer(
        reference_no=ref_no,
        source_warehouse_id=payload.source_warehouse_id,
        dest_warehouse_id=payload.dest_warehouse_id,
        notes=payload.notes,
        created_by_id=current_user.id
    )
    db.add(transfer)
    db.flush()

    for item in payload.lines:
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="Transfer quantity must be positive")

        # 1. Decrease source warehouse (will fail if insufficient stock)
        apply_stock_change(
            db=db,
            warehouse_id=payload.source_warehouse_id,
            product_id=item.product_id,
            delta=-item.quantity,
            movement_type="transfer_out",
            reference_type="transfer",
            reference_id=transfer.id,
            reason=f"Transfer to {dst.name} ({ref_no})",
            user_id=current_user.id
        )

        # 2. Increase destination warehouse
        apply_stock_change(
            db=db,
            warehouse_id=payload.dest_warehouse_id,
            product_id=item.product_id,
            delta=item.quantity,
            movement_type="transfer_in",
            reference_type="transfer",
            reference_id=transfer.id,
            reason=f"Transfer from {src.name} ({ref_no})",
            user_id=current_user.id
        )

        t_line = WarehouseTransferLine(
            transfer_id=transfer.id,
            product_id=item.product_id,
            quantity=item.quantity
        )
        db.add(t_line)

    db.commit()
    return {"message": "Stock transfer completed successfully", "reference_no": ref_no}
