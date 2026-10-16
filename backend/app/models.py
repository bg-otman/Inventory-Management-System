import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import String, Text, ForeignKey, Numeric, DateTime, Boolean, JSON, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

def uid(): return str(uuid.uuid4())
def now(): return datetime.now(timezone.utc).replace(tzinfo=None)

class Category(Base):
    __tablename__ = "categories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120))
    normalized: Mapped[str] = mapped_column(String(120), unique=True)

class Warehouse(Base):
    __tablename__ = "warehouses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120), unique=True)

class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id"))
    # Nullable only for old records whose supplier is not yet known.
    supplier_id: Mapped[str | None] = mapped_column(ForeignKey("parties.id", name="fk_products_supplier"), nullable=True)
    purchase_cost: Mapped[Decimal | None] = mapped_column(Numeric(16, 2), nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    unit: Mapped[str] = mapped_column(String(30), default="unit")
    price: Mapped[Decimal | None] = mapped_column(Numeric(16, 2), nullable=True)
    threshold: Mapped[Decimal] = mapped_column(Numeric(16, 3), default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (CheckConstraint("threshold >= 0"), CheckConstraint("price IS NULL OR price >= 0"),
                      CheckConstraint("purchase_cost IS NULL OR purchase_cost >= 0", name="ck_products_purchase_cost"))

class Stock(Base):
    __tablename__ = "stock"
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), primary_key=True)
    warehouse_id: Mapped[str] = mapped_column(ForeignKey("warehouses.id"), primary_key=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 3), default=0)
    __table_args__ = (CheckConstraint("quantity >= 0"),)

class Movement(Base):
    __tablename__ = "movements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    warehouse_id: Mapped[str] = mapped_column(ForeignKey("warehouses.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 3))
    reason: Mapped[str] = mapped_column(Text)
    source_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    actor: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class Party(Base):
    __tablename__ = "parties"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(100), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(String(20))
    party_id: Mapped[str | None] = mapped_column(ForeignKey("parties.id"), nullable=True)
    warehouse_id: Mapped[str] = mapped_column(ForeignKey("warehouses.id"))
    number: Mapped[str | None] = mapped_column(String(60), nullable=True, unique=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    fulfilled: Mapped[bool] = mapped_column(Boolean, default=False)
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(16, 2), default=0)
    discount: Mapped[Decimal] = mapped_column(Numeric(16, 2), default=0)
    # Legacy issued records retain their original amounts. New documents set these to zero;
    # these fields are not accepted by the API or shown in the application.
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(8, 3), default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(16, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(16, 2), default=0)
    due_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    language: Mapped[str] = mapped_column(String(2), default="en")
    reference: Mapped[str] = mapped_column(String(120), default="")
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    actor: Mapped[str] = mapped_column(String(36))

class Line(Base):
    __tablename__ = "document_lines"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"))
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    name: Mapped[str] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(String(30))
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 3))
    price: Mapped[Decimal | None] = mapped_column(Numeric(16, 2), nullable=True)
    __table_args__ = (CheckConstraint("quantity > 0"), CheckConstraint("price IS NULL OR price >= 0"))

class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    party_id: Mapped[str | None] = mapped_column(ForeignKey("parties.id"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    method: Mapped[str] = mapped_column(String(30), default="cash")
    reference: Mapped[str] = mapped_column(String(120), default="")
    paid_at: Mapped[str] = mapped_column(String(10))
    reversed: Mapped[bool] = mapped_column(Boolean, default=False)
    actor: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (CheckConstraint("amount > 0"),)

class Allocation(Base):
    __tablename__ = "allocations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    payment_id: Mapped[str] = mapped_column(ForeignKey("payments.id"))
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    __table_args__ = (CheckConstraint("amount > 0"),)

class Setting(Base):
    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    next_invoice: Mapped[int] = mapped_column(default=1)
    next_purchase: Mapped[int] = mapped_column(default=1)

class Operation(Base):
    __tablename__ = "operations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    key: Mapped[str] = mapped_column(String(100))
    request_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)
    __table_args__ = (UniqueConstraint("key"),)

class Activity(Base):
    __tablename__ = "activity"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    action: Mapped[str] = mapped_column(String(100))
    label: Mapped[str] = mapped_column(String(200))
    actor: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
