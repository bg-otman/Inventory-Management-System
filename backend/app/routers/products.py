from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import or_, func
from app.database import get_db
from app.models.catalog import Product, Category
from app.models.inventory import StockBalance, Warehouse
from app.models.user import User
from app.schemas.catalog import (
    ProductCreate, ProductUpdate, ProductResponse, ProductWithStockResponse, WarehouseStockItem
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/products", tags=["products"])

def build_product_with_stock(product: Product, db: DBSession) -> ProductWithStockResponse:
    balances = db.query(StockBalance, Warehouse.name).join(
        Warehouse, StockBalance.warehouse_id == Warehouse.id
    ).filter(
        StockBalance.product_id == product.id,
        Warehouse.is_active == True
    ).all()

    warehouse_stocks = [
        WarehouseStockItem(
            warehouse_id=bal.warehouse_id,
            warehouse_name=w_name,
            quantity=bal.quantity
        )
        for bal, w_name in balances
    ]
    total_stock = sum((item.quantity for item in warehouse_stocks), Decimal("0.00"))
    is_low_stock = total_stock <= product.low_stock_threshold

    data = ProductResponse.model_validate(product)
    return ProductWithStockResponse(
        **data.model_dump(),
        total_stock=total_stock,
        warehouse_stocks=warehouse_stocks,
        is_low_stock=is_low_stock
    )

@router.get("", response_model=List[ProductWithStockResponse])
def list_products(
    search: Optional[str] = Query(None, description="Search by name, SKU, or barcode"),
    category_id: Optional[int] = Query(None),
    low_stock_only: bool = Query(False),
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Product).filter(Product.is_active == True)

    if category_id:
        query = query.filter(Product.category_id == category_id)

    if search:
        s = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(Product.name).like(s),
                func.lower(Product.sku).like(s),
                func.lower(Product.barcode).like(s)
            )
        )

    products = query.order_by(Product.name.asc()).all()
    results = [build_product_with_stock(p, db) for p in products]

    if low_stock_only:
        results = [p for p in results if p.is_low_stock]

    return results

@router.get("/scan/{code}", response_model=ProductWithStockResponse)
def scan_product(
    code: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cleaned = code.strip()
    product = db.query(Product).filter(
        Product.is_active == True,
        or_(Product.barcode == cleaned, Product.sku == cleaned)
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return build_product_with_stock(product, db)

@router.get("/{product_id}", response_model=ProductWithStockResponse)
def get_product(
    product_id: int,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return build_product_with_stock(product, db)

@router.post("", response_model=ProductResponse)
def create_product(
    payload: ProductCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Category validation
    category = db.query(Category).filter(Category.id == payload.category_id).first()
    if not category:
        raise HTTPException(status_code=400, detail="Selected category does not exist")

    # SKU uniqueness check (if provided)
    if payload.sku:
        existing_sku = db.query(Product).filter(Product.sku == payload.sku).first()
        if existing_sku:
            raise HTTPException(status_code=400, detail=f"A product with SKU '{payload.sku}' already exists")

    # Barcode uniqueness check (if provided)
    if payload.barcode:
        existing_barcode = db.query(Product).filter(Product.barcode == payload.barcode).first()
        if existing_barcode:
            raise HTTPException(status_code=400, detail=f"A product with barcode '{payload.barcode}' already exists")

    product = Product(
        name=payload.name,
        category_id=payload.category_id,
        description=payload.description,
        sku=payload.sku,
        barcode=payload.barcode,
        unit=payload.unit or "unit",
        default_price=payload.default_price,
        low_stock_threshold=payload.low_stock_threshold or Decimal("0.00"),
        is_active=True
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product

@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if payload.category_id is not None:
        category = db.query(Category).filter(Category.id == payload.category_id).first()
        if not category:
            raise HTTPException(status_code=400, detail="Selected category does not exist")
        product.category_id = payload.category_id

    if payload.sku is not None:
        if payload.sku:
            existing_sku = db.query(Product).filter(
                Product.sku == payload.sku,
                Product.id != product_id
            ).first()
            if existing_sku:
                raise HTTPException(status_code=400, detail=f"A product with SKU '{payload.sku}' already exists")
        product.sku = payload.sku

    if payload.barcode is not None:
        if payload.barcode:
            existing_barcode = db.query(Product).filter(
                Product.barcode == payload.barcode,
                Product.id != product_id
            ).first()
            if existing_barcode:
                raise HTTPException(status_code=400, detail=f"A product with barcode '{payload.barcode}' already exists")
        product.barcode = payload.barcode

    if payload.name is not None:
        product.name = payload.name
    if payload.description is not None:
        product.description = payload.description
    if payload.unit is not None:
        product.unit = payload.unit
    if payload.default_price is not None:
        product.default_price = payload.default_price
    if payload.low_stock_threshold is not None:
        product.low_stock_threshold = payload.low_stock_threshold
    if payload.is_active is not None:
        product.is_active = payload.is_active

    db.commit()
    db.refresh(product)
    return product
