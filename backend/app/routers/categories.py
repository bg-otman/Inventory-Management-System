from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func
from app.database import get_db
from app.models.catalog import Category
from app.models.user import User
from app.schemas.catalog import CategoryCreate, CategoryUpdate, CategoryResponse
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/categories", tags=["categories"])

@router.get("", response_model=List[CategoryResponse])
def list_categories(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Category).order_by(Category.name.asc()).all()

@router.post("", response_model=CategoryResponse)
def create_category(
    payload: CategoryCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    trimmed_name = payload.name.strip()
    # Check case-insensitive duplicate
    existing = db.query(Category).filter(
        func.lower(Category.name) == trimmed_name.lower()
    ).first()

    if existing:
        # As specified in Section 4: If category exists, return the existing category instead of duplicating
        return existing

    cat = Category(
        name=trimmed_name,
        description=payload.description
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat

@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if payload.name:
        trimmed = payload.name.strip()
        existing = db.query(Category).filter(
            func.lower(Category.name) == trimmed.lower(),
            Category.id != category_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Category with this name already exists")
        cat.name = trimmed

    if payload.description is not None:
        cat.description = payload.description

    db.commit()
    db.refresh(cat)
    return cat
