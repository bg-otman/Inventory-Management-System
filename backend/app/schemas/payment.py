from pydantic import BaseModel, field_validator
from typing import Optional, List
from decimal import Decimal
from datetime import date, datetime

class AllocationItem(BaseModel):
    invoice_id: int  # sale_id or purchase_id
    amount: Decimal

    @field_validator("amount")
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Allocation amount must be greater than zero")
        return v


class PaymentCreate(BaseModel):
    party_type: str  # "customer" or "supplier"
    customer_id: Optional[int] = None
    supplier_id: Optional[int] = None
    amount: Decimal
    payment_date: Optional[date] = None
    payment_method: str = "cash"  # cash, bank_transfer, cheque, other
    reference_no: Optional[str] = None
    notes: Optional[str] = None
    allocations: List[AllocationItem] = []

    @field_validator("amount")
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Payment amount must be greater than zero")
        return v


class PaymentAllocationResponse(BaseModel):
    id: int
    sale_id: Optional[int] = None
    purchase_id: Optional[int] = None
    invoice_number: Optional[str] = None
    allocated_amount: Decimal
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentResponse(BaseModel):
    id: int
    payment_number: str
    party_type: str
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    amount: Decimal
    allocated_amount: Decimal
    unallocated_amount: Decimal
    payment_date: date
    payment_method: str
    reference_no: Optional[str] = None
    notes: Optional[str] = None
    is_reversed: bool
    reversal_reason: Optional[str] = None
    created_at: datetime
    allocations: List[PaymentAllocationResponse] = []

    class Config:
        from_attributes = True


class PaymentReversalRequest(BaseModel):
    reason: str

    @field_validator("reason")
    def validate_reason(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Reversal reason is required")
        return s
