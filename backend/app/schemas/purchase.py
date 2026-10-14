from pydantic import BaseModel, field_validator
from typing import Optional, List
from decimal import Decimal
from datetime import datetime, date

class PurchaseLineCreate(BaseModel):
    product_id: int
    quantity: Decimal
    unit_cost: Decimal

    @field_validator("quantity")
    def validate_quantity(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v

    @field_validator("unit_cost")
    def validate_cost(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Unit cost cannot be negative")
        return v


class PurchaseCreate(BaseModel):
    supplier_id: int
    warehouse_id: int
    lines: List[PurchaseLineCreate]
    supplier_invoice_ref: Optional[str] = None
    supplier_invoice_date: Optional[date] = None
    receive_now: bool = True               # Receive goods immediately
    record_invoice_now: bool = True        # Record supplier invoice immediately
    initial_payment_amount: Optional[Decimal] = None
    payment_method: str = "cash"
    notes: Optional[str] = None

    @field_validator("lines")
    def validate_lines(cls, v: List[PurchaseLineCreate]) -> List[PurchaseLineCreate]:
        if not v:
            raise ValueError("Purchase must have at least one line item")
        return v


class PurchaseLineResponse(BaseModel):
    id: int
    product_id: int
    product_name_snapshot: str
    unit_snapshot: str
    quantity: Decimal
    unit_cost: Decimal
    line_total: Decimal

    class Config:
        from_attributes = True


class PurchaseResponse(BaseModel):
    id: int
    reference_number: str
    supplier_id: int
    supplier_name: Optional[str] = None
    warehouse_id: int
    warehouse_name: Optional[str] = None
    supplier_invoice_ref: Optional[str] = None
    supplier_invoice_date: Optional[date] = None
    total_amount: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal
    receipt_status: str
    received_at: Optional[datetime] = None
    invoice_status: str
    invoiced_at: Optional[datetime] = None
    payment_status: str
    notes: Optional[str] = None
    created_at: datetime
    lines: List[PurchaseLineResponse] = []

    class Config:
        from_attributes = True


class RecordSupplierInvoiceRequest(BaseModel):
    supplier_invoice_ref: str
    supplier_invoice_date: Optional[date] = None
