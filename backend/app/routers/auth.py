from fastapi import APIRouter, Depends, HTTPException, Response, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserLogin, UserResponse
from app.services.auth_service import (
    verify_password,
    create_user_session,
    delete_user_session,
    get_current_user
)
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

class LanguageUpdate(BaseModel):
    language: str

@router.post("/login", response_model=UserResponse)
def login(login_data: UserLogin, response: Response, db: DBSession = Depends(get_db)):
    user = db.query(User).filter(User.username == login_data.username).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    token = create_user_session(db, user.id)

    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.SESSION_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=(settings.ENVIRONMENT == "production")
    )

    return user

@router.post("/logout")
def logout(request: Request, response: Response, db: DBSession = Depends(get_db)):
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if token:
        delete_user_session(db, token)
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return user

@router.put("/language")
def update_language(
    payload: LanguageUpdate,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    if payload.language not in ("en", "ar"):
        raise HTTPException(status_code=400, detail="Language must be 'en' or 'ar'")
    user.language = payload.language
    db.commit()
    return {"language": user.language}
