from pydantic import BaseModel, field_validator
from typing import Optional, List
from decimal import Decimal
from datetime import datetime

class WarehouseBase(BaseModel):
    name: str
    code: Optional[str] = None
    address: Optional[str] = None

class WarehouseCreate(WarehouseBase):
    @field_validator("name")
    def clean_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Warehouse name cannot be empty")
        return s

class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None

class WarehouseResponse(WarehouseBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class StockAdjustmentCreate(BaseModel):
    warehouse_id: int
    product_id: int
    quantity: Decimal  # Positive for addition, negative for reduction
    reason: str

    @field_validator("reason")
    def clean_reason(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Adjustment reason is required")
        return s


class TransferLineItem(BaseModel):
    product_id: int
    quantity: Decimal

class WarehouseTransferCreate(BaseModel):
    source_warehouse_id: int
    dest_warehouse_id: int
    lines: List[TransferLineItem]
    notes: Optional[str] = None


class StockMovementResponse(BaseModel):
    id: int
    warehouse_id: int
    warehouse_name: str
    product_id: int
    product_name: str
    movement_type: str
    quantity: Decimal
    balance_after: Optional[Decimal] = None
    reference_type: str
    reference_id: Optional[int] = None
    reason: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LowStockAlertResponse(BaseModel):
    product_id: int
    product_name: str
    warehouse_id: int
    warehouse_name: str
    current_stock: Decimal
    threshold: Decimal
    unit: str
