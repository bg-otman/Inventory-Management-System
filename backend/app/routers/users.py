from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.services.auth_service import require_owner, hash_password

router = APIRouter(prefix="/users", tags=["users"])

@router.get("", response_model=List[UserResponse])
def list_users(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    return db.query(User).order_by(User.id.asc()).all()

@router.post("", response_model=UserResponse)
def create_user(
    payload: UserCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username is already taken")
    
    if payload.email:
        existing_email = db.query(User).filter(User.email == payload.email).first()
        if existing_email:
            raise HTTPException(status_code=400, detail="Email is already registered")

    user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        language=payload.language,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_owner)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email is not None:
        user.email = payload.email
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.language is not None:
        user.language = payload.language
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password:
        user.hashed_password = hash_password(payload.password)

    db.commit()
    db.refresh(user)
    return user
