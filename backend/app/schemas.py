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
    supplier_id: str | None = None
    purchase_cost: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=6)
    description: str = Field(default="", max_length=4000)
    unit: Literal["unit", "piece", "kg", "meter", "carton", "liter"] = "unit"
    price: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=6)
    wholesale_price: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=6)
    threshold: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=3)
    active: bool = True


class ProductCreateInput(ProductInput):
    stock_mode: Literal["purchase", "existing", "catalog"] = "purchase"
    opening_quantity: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=3)
    warehouse_id: str | None = None
    discount: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    payment: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    due_date: date | None = None
    language: Literal["fr"] = "fr"
    fulfill: bool = True
    invoice_ready: bool = True


class PartyInput(Input):
    kind: Literal["customer", "supplier"]
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(default="", max_length=100)
    address: str = Field(default="", max_length=1000)
    notes: str = Field(default="", max_length=4000)


class LineInput(Input):
    product_id: str | None = None
    name: str = Field(default="", max_length=200)
    unit: Literal["unit", "piece", "kg", "meter", "carton", "liter"] = "unit"
    warehouse_id: str | None = None
    quantity: Decimal = Field(gt=0, max_digits=16, decimal_places=3)
    price: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=6)


class DocumentInput(Input):
    kind: Literal["sale", "purchase", "quote", "delivery"]
    revision: int | None = Field(default=None, ge=0)
    issued_date: date | None = None
    notes: str = Field(default="", max_length=4000)
    party_id: str | None = None
    warehouse_id: str | None = None
    items: list[LineInput] = Field(min_length=1, max_length=100)
    discount: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)
    due_date: date | None = None
    language: Literal["fr"] = "fr"
    confirm: bool = True
    fulfill: bool | None = None
    payment: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)


class PostInput(Input):
    fulfill: bool = False
    payment: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)


class LinePriceInput(Input):
    id: str
    price: Decimal = Field(ge=0, max_digits=20, decimal_places=6)


class SalePricesInput(Input):
    items: list[LinePriceInput] = Field(min_length=1, max_length=100)
    discount: Decimal = Field(default=Decimal(0), ge=0, max_digits=16, decimal_places=2)


class AllocationInput(Input):
    document_id: str
    amount: Decimal = Field(gt=0, max_digits=16, decimal_places=2)


class PaymentInput(Input):
    party_id: str
    amount: Decimal = Field(gt=0, max_digits=16, decimal_places=2)
    paid_at: date
    method: Literal["cash", "transfer", "cheque", "other"] = "cash"
    direction: Literal["received", "paid"] | None = None
    notes: str = Field(default="", max_length=1000)
    language: Literal["fr"] = "fr"
    auto_allocate: bool = False
    preferred_document_id: str | None = None
    allocations: list[AllocationInput] = Field(default_factory=list, max_length=100)


class AllocateInput(Input):
    allocations: list[AllocationInput] = Field(min_length=1, max_length=100)
    language: Literal["fr"] = "fr"


class AdjustInput(Input):
    product_id: str
    warehouse_id: str
    quantity: Decimal = Field(max_digits=16, decimal_places=3)
    reason: str = Field(min_length=1, max_length=500)


class TransferInput(Input):
    product_id: str
    from_warehouse_id: str
    to_warehouse_id: str
    quantity: Decimal = Field(gt=0, max_digits=16, decimal_places=3)


class SettingsInput(Input):
    company_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(default="", max_length=100)
    address: str = Field(default="", max_length=500)
    logo: str = Field(default="", max_length=500000)


class ReasonInput(Input):
    reason: str = Field(min_length=1, max_length=500)
    language: Literal["fr"] = "fr"


class RestoreInput(Input):
    backup: str
    confirmed: bool


class ConvertInput(Input):
    kind: Literal["sale", "quote", "delivery"]
