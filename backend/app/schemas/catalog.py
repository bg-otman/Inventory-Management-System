from pydantic import BaseModel, field_validator
from typing import Optional, List
from decimal import Decimal
from datetime import datetime

class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None

class CategoryCreate(CategoryBase):
    @field_validator("name")
    def clean_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Category name cannot be empty")
        return s

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class CategoryResponse(CategoryBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProductBase(BaseModel):
    name: str
    category_id: int
    description: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    unit: str = "unit"
    default_price: Optional[Decimal] = None
    low_stock_threshold: Decimal = Decimal("0.00")

    @field_validator("name")
    def clean_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Product name cannot be empty")
        return s

    @field_validator("sku", "barcode", mode="before")
    def clean_codes(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return str(v)

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    unit: Optional[str] = None
    default_price: Optional[Decimal] = None
    low_stock_threshold: Optional[Decimal] = None
    is_active: Optional[bool] = None

    @field_validator("name")
    def clean_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            s = v.strip()
            if not s:
                raise ValueError("Product name cannot be empty")
            return s
        return v

    @field_validator("sku", "barcode", mode="before")
    def clean_codes(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return str(v)

class ProductResponse(ProductBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryResponse] = None

    class Config:
        from_attributes = True

class WarehouseStockItem(BaseModel):
    warehouse_id: int
    warehouse_name: str
    quantity: Decimal

class ProductWithStockResponse(ProductResponse):
    total_stock: Decimal = Decimal("0.00")
    warehouse_stocks: List[WarehouseStockItem] = []
    is_low_stock: bool = False
