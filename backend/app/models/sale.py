from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Numeric, Date, DateTime, ForeignKey, Index, Sequence
from sqlalchemy.orm import relationship
from app.database import Base

class InvoiceSequence(Base):
    __tablename__ = "invoice_sequences"

    id = Column(Integer, primary_key=True)
    last_val = Column(Integer, nullable=False, default=0)


class Sale(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(50), unique=True, index=True, nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)  # NULL = Walk-in
    customer_name_snapshot = Column(String(150), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    
    subtotal = Column(Numeric(12, 2), nullable=False, default=0.00)
    discount = Column(Numeric(12, 2), nullable=False, default=0.00)
    tax_rate = Column(Numeric(5, 2), nullable=False, default=0.00)  # e.g. 20.00%
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    paid_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    remaining_amount = Column(Numeric(12, 2), nullable=False, default=0.00)

    payment_status = Column(String(30), nullable=False, default="unpaid")  # unpaid, partially_paid, paid
    delivery_status = Column(String(30), nullable=False, default="delivered")  # delivered, pending
    delivered_at = Column(DateTime, nullable=True)
    due_date = Column(Date, nullable=True)
    issue_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    language = Column(String(5), nullable=False, default="en")  # snapshot: "en" or "ar"
    notes = Column(Text, nullable=True)

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="sales")
    warehouse = relationship("Warehouse")
    created_by = relationship("User")
    lines = relationship("SaleLine", back_populates="sale", cascade="all, delete-orphan")
    allocations = relationship("PaymentAllocation", back_populates="sale")


class SaleLine(Base):
    __tablename__ = "sale_lines"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    product_name_snapshot = Column(String(200), nullable=False)
    unit_snapshot = Column(String(30), nullable=False, default="unit")
    quantity = Column(Numeric(12, 2), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    line_total = Column(Numeric(12, 2), nullable=False)

    sale = relationship("Sale", back_populates="lines")
    product = relationship("Product")
