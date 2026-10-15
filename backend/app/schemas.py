from decimal import Decimal
from typing import Literal
from datetime import date
from pydantic import BaseModel, ConfigDict, Field

class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)

class NameInput(Input):
    name: str = Field(min_length=1, max_length=120)

class ProductInput(Input):
    name: str = Field(min_length=1, max_length=200)
    category_id: str
    supplier_id: str = Field(min_length=1, max_length=36)
    purchase_cost: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    description: str = Field(default="", max_length=4000)
    sku: str | None = Field(default=None, max_length=100)
    barcode: str | None = Field(default=None, max_length=100)
    unit: Literal["unit","piece","kg","meter","carton","liter"] = "unit"
    price: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    threshold: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=3)
    active: bool = True

class PartyInput(Input):
    kind: Literal["customer","supplier"]
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(default="", max_length=100)
    address: str = Field(default="", max_length=1000)
    notes: str = Field(default="", max_length=4000)

class LineInput(Input):
    product_id: str
    quantity: Decimal = Field(gt=0, max_digits=16, decimal_places=3)
    price: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)

class DocumentInput(Input):
    kind: Literal["sale","purchase"]
    party_id: str | None = None
    warehouse_id: str
    items: list[LineInput] = Field(min_length=1, max_length=100)
    discount: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    due_date: date | None = None
    language: Literal["en","ar"] = "en"
    reference: str = Field(default="", max_length=120)
    confirm: bool = True
    fulfill: bool = True
    payment: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)

class PostInput(Input):
    fulfill: bool = False
    payment: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)

class AllocationInput(Input):
    document_id: str
    amount: Decimal = Field(gt=0, max_digits=16, decimal_places=2)

class PaymentInput(Input):
    party_id: str
    amount: Decimal = Field(gt=0, max_digits=16, decimal_places=2)
    paid_at: date
    method: Literal["cash","transfer","cheque","other"] = "cash"
    reference: str = Field(default="", max_length=120)
    allocations: list[AllocationInput] = Field(default_factory=list, max_length=100)

class AllocateInput(Input):
    allocations: list[AllocationInput] = Field(min_length=1, max_length=100)

class AdjustInput(Input):
    product_id: str
    warehouse_id: str
    quantity: Decimal = Field(max_digits=16, decimal_places=3)
    reason: str = Field(min_length=1,max_length=500)

class TransferInput(Input):
    product_id: str
    from_warehouse_id: str
    to_warehouse_id: str
    quantity: Decimal = Field(gt=0, max_digits=16, decimal_places=3)

class LoginInput(Input):
    username: str = Field(min_length=1,max_length=100)
    password: str = Field(min_length=1,max_length=200)

class UserInput(Input):
    username: str = Field(min_length=1,max_length=100)
    name: str = Field(min_length=1,max_length=120)
    password: str = Field(min_length=12,max_length=200)
    role: Literal["owner","employee"] = "employee"

class SettingsInput(Input):
    company_name: str = Field(min_length=1,max_length=200)
    company_name_ar: str = Field(default="",max_length=200)
    phone: str = Field(default="",max_length=100)
    address: str = Field(default="",max_length=500)
    logo: str = Field(default="",max_length=500000)

class ReasonInput(Input):
    reason: str = Field(min_length=1,max_length=500)

class RestoreInput(Input):
    backup: str
    password: str = Field(min_length=1,max_length=200)
    confirmed: bool
