from pydantic import BaseModel, field_validator
from typing import Optional, List
from decimal import Decimal
from datetime import datetime, date

class SaleLineCreate(BaseModel):
    product_id: int
    quantity: Decimal
    unit_price: Decimal

    @field_validator("quantity")
    def validate_quantity(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v

    @field_validator("unit_price")
    def validate_price(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Unit price cannot be negative")
        return v


class SaleCreate(BaseModel):
    customer_id: Optional[int] = None  # None = Walk-in
    warehouse_id: int
    lines: List[SaleLineCreate]
    discount: Decimal = Decimal("0.00")
    tax_rate: Optional[Decimal] = None  # If None, use company default
    delivered_now: bool = True          # Default is delivered now
    due_date: Optional[date] = None
    language: str = "en"                # "en" or "ar"
    notes: Optional[str] = None
    initial_payment_amount: Optional[Decimal] = None
    payment_method: str = "cash"
    payment_reference: Optional[str] = None

    @field_validator("lines")
    def validate_lines(cls, v: List[SaleLineCreate]) -> List[SaleLineCreate]:
        if not v:
            raise ValueError("Sale must have at least one line item")
        return v

    @field_validator("discount")
    def validate_discount(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Discount cannot be negative")
        return v


class SaleLineResponse(BaseModel):
    id: int
    product_id: int
    product_name_snapshot: str
    unit_snapshot: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal

    class Config:
        from_attributes = True


class SaleResponse(BaseModel):
    id: int
    invoice_number: str
    customer_id: Optional[int] = None
    customer_name_snapshot: str
    warehouse_id: int
    subtotal: Decimal
    discount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    remaining_amount: Decimal
    payment_status: str
    delivery_status: str
    delivered_at: Optional[datetime] = None
    due_date: Optional[date] = None
    issue_date: datetime
    language: str
    notes: Optional[str] = None
    created_at: datetime
    lines: List[SaleLineResponse] = []

    class Config:
        from_attributes = True
