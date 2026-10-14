from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Numeric, Date, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database import Base

class PurchaseSequence(Base):
    __tablename__ = "purchase_sequences"

    id = Column(Integer, primary_key=True)
    last_val = Column(Integer, nullable=False, default=0)


class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    reference_number = Column(String(50), unique=True, index=True, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)

    supplier_invoice_ref = Column(String(100), nullable=True)
    supplier_invoice_date = Column(Date, nullable=True)

    total_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    paid_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    remaining_amount = Column(Numeric(12, 2), nullable=False, default=0.00)

    receipt_status = Column(String(30), nullable=False, default="pending")  # pending, received
    received_at = Column(DateTime, nullable=True)

    invoice_status = Column(String(30), nullable=False, default="recorded") # not_recorded, recorded
    invoiced_at = Column(DateTime, nullable=True)

    payment_status = Column(String(30), nullable=False, default="unpaid")   # unpaid, partially_paid, paid
    notes = Column(Text, nullable=True)

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    supplier = relationship("Supplier", back_populates="purchases")
    warehouse = relationship("Warehouse")
    created_by = relationship("User")
    lines = relationship("PurchaseLine", back_populates="purchase", cascade="all, delete-orphan")
    allocations = relationship("PaymentAllocation", back_populates="purchase")


class PurchaseLine(Base):
    __tablename__ = "purchase_lines"

    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    product_name_snapshot = Column(String(200), nullable=False)
    unit_snapshot = Column(String(30), nullable=False, default="unit")
    quantity = Column(Numeric(12, 2), nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    line_total = Column(Numeric(12, 2), nullable=False)

    purchase = relationship("Purchase", back_populates="lines")
    product = relationship("Product")
