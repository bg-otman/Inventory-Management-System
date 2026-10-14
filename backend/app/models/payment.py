from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Text, Numeric, Date, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database import Base

class PaymentSequence(Base):
    __tablename__ = "payment_sequences"

    id = Column(Integer, primary_key=True)
    last_val = Column(Integer, nullable=False, default=0)


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    payment_number = Column(String(50), unique=True, index=True, nullable=False)
    party_type = Column(String(20), nullable=False)  # "customer" or "supplier"
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True, index=True)

    amount = Column(Numeric(12, 2), nullable=False)
    allocated_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    unallocated_amount = Column(Numeric(12, 2), nullable=False, default=0.00)  # Deposit / advance balance

    payment_date = Column(Date, nullable=False, default=date.today)
    payment_method = Column(String(50), nullable=False, default="cash")  # cash, bank_transfer, cheque, other
    reference_no = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)

    is_reversed = Column(Boolean, default=False, nullable=False)
    reversal_reason = Column(Text, nullable=True)
    reversed_at = Column(DateTime, nullable=True)

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    customer = relationship("Customer", back_populates="payments")
    supplier = relationship("Supplier", back_populates="payments")
    created_by = relationship("User")
    allocations = relationship("PaymentAllocation", back_populates="payment", cascade="all, delete-orphan")


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"

    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=False)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=True)
    allocated_amount = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    payment = relationship("Payment", back_populates="allocations")
    sale = relationship("Sale", back_populates="allocations")
    purchase = relationship("Purchase", back_populates="allocations")
