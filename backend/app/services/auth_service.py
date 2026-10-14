import secrets
from datetime import datetime, timedelta
import bcrypt
from fastapi import Request, HTTPException, status, Depends
from sqlalchemy.orm import Session as DBSession
from app.database import get_db
from app.models.user import User, Session
from app.config import settings

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_user_session(db: DBSession, user_id: int) -> str:
    token = secrets.token_urlsafe(48)
    expires_at = datetime.utcnow() + timedelta(seconds=settings.SESSION_MAX_AGE_SECONDS)
    session = Session(
        session_token=token,
        user_id=user_id,
        expires_at=expires_at
    )
    db.add(session)
    db.commit()
    return token

def delete_user_session(db: DBSession, token: str):
    db.query(Session).filter(Session.session_token == token).delete()
    db.commit()

def get_current_user_optional(request: Request, db: DBSession = Depends(get_db)) -> User | None:
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        # Also check Authorization header as fallback: Bearer <token>
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]

    if not token:
        return None

    session = db.query(Session).filter(
        Session.session_token == token,
        Session.expires_at > datetime.utcnow()
    ).first()

    if not session or not session.user or not session.user.is_active:
        return None

    return session.user

def get_current_user(user: User = Depends(get_current_user_optional)) -> User:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    return user

def require_owner(user: User = Depends(get_current_user)) -> User:
    if user.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner privileges required for this action"
        )
    return user
