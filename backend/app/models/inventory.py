from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Numeric, Boolean, DateTime, ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    code = Column(String(30), unique=True, nullable=True)
    address = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    stock_balances = relationship("StockBalance", back_populates="warehouse", cascade="all, delete-orphan")


class StockBalance(Base):
    __tablename__ = "stock_balances"

    id = Column(Integer, primary_key=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    quantity = Column(Numeric(12, 2), nullable=False, default=0.00)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    warehouse = relationship("Warehouse", back_populates="stock_balances")
    product = relationship("Product", back_populates="stock_balances")

    __table_args__ = (
        UniqueConstraint("warehouse_id", "product_id", name="uq_warehouse_product_stock"),
        CheckConstraint("quantity >= 0", name="chk_stock_quantity_non_negative"),
    )


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    movement_type = Column(String(30), nullable=False)  # receipt, delivery, transfer_in, transfer_out, adjustment
    quantity = Column(Numeric(12, 2), nullable=False)   # signed or positive quantity moved
    balance_after = Column(Numeric(12, 2), nullable=True)
    reference_type = Column(String(30), nullable=False) # sale, purchase, transfer, adjustment
    reference_id = Column(Integer, nullable=True)
    reason = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    warehouse = relationship("Warehouse")
    product = relationship("Product")
    created_by = relationship("User")


class WarehouseTransfer(Base):
    __tablename__ = "warehouse_transfers"

    id = Column(Integer, primary_key=True, index=True)
    reference_no = Column(String(50), unique=True, index=True, nullable=False)
    source_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    dest_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    notes = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    source_warehouse = relationship("Warehouse", foreign_keys=[source_warehouse_id])
    dest_warehouse = relationship("Warehouse", foreign_keys=[dest_warehouse_id])
    lines = relationship("WarehouseTransferLine", back_populates="transfer", cascade="all, delete-orphan")


class WarehouseTransferLine(Base):
    __tablename__ = "warehouse_transfer_lines"

    id = Column(Integer, primary_key=True, index=True)
    transfer_id = Column(Integer, ForeignKey("warehouse_transfers.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Numeric(12, 2), nullable=False)

    transfer = relationship("WarehouseTransfer", back_populates="lines")
    product = relationship("Product")
