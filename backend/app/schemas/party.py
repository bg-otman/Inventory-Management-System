from pydantic import BaseModel, field_validator
from typing import Optional, List
from decimal import Decimal
from datetime import datetime

class CustomerBase(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None

class CustomerCreate(CustomerBase):
    @field_validator("name")
    def clean_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Customer name cannot be empty")
        return s

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class CustomerResponse(CustomerBase):
    id: int
    is_active: bool
    created_at: datetime
    total_receivable: Decimal = Decimal("0.00")  # Outstanding invoice balance
    unused_deposit: Decimal = Decimal("0.00")    # Unallocated payment deposit

    class Config:
        from_attributes = True


class SupplierBase(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    notes: Optional[str] = None

class SupplierCreate(SupplierBase):
    @field_validator("name")
    def clean_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Supplier name cannot be empty")
        return s

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class SupplierResponse(SupplierBase):
    id: int
    is_active: bool
    created_at: datetime
    total_payable: Decimal = Decimal("0.00")  # Outstanding bill balance
    unused_advance: Decimal = Decimal("0.00") # Unallocated payment advance

    class Config:
        from_attributes = True
