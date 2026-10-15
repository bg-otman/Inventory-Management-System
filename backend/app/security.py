import hashlib, hmac, secrets, os, time, threading
from datetime import timedelta
from fastapi import HTTPException, Request
from sqlalchemy import select
from .models import User, Session, now

def digest(value): return hashlib.sha256(value.encode()).hexdigest()
def hash_password(password):
    if len(password) < 12: raise HTTPException(422, "Use a password of at least 12 characters.")
    salt = secrets.token_hex(16)
    value = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return salt + ":" + value

def verify_password(password, stored):
    try:
        salt, value = stored.split(":")
        return hmac.compare_digest(value, hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex())
    except (ValueError, TypeError): return False

def current_user(request, db):
    token = request.cookies.get("inventory_session", "")
    session = db.get(Session, digest(token)) if token else None
    if not session or session.expires < now(): raise HTTPException(401, "Please sign in.")
    user = db.get(User, session.user_id)
    if not user or not user.active: raise HTTPException(401, "Please sign in.")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if not hmac.compare_digest(session.csrf_hash, digest(request.headers.get("X-CSRF-Token", ""))):
            raise HTTPException(403, "Session verification failed. Refresh and try again.")
    return user

def owner(user):
    if user.role != "owner": raise HTTPException(403, "Only the owner can perform this action.")

def create_session(response, user, db):
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.add(Session(token_hash=digest(token), csrf_hash=digest(csrf), user_id=user.id, expires=now()+timedelta(hours=12)))
    secure = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
    response.set_cookie("inventory_session", token, httponly=True, secure=secure, samesite="lax", max_age=43200, path="/")
    response.set_cookie("inventory_csrf", csrf, httponly=False, secure=secure, samesite="lax", max_age=43200, path="/")
    return csrf

_attempts = {}
_lock = threading.Lock()
def limit_login(key):
    with _lock:
        cutoff = time.monotonic()-900
        recent = [t for t in _attempts.get(key, []) if t > cutoff]
        if len(recent) >= 10: raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
        _attempts[key] = recent + [time.monotonic()]
        if len(_attempts)>5000:
            for k in list(_attempts):
                if not _attempts[k] or _attempts[k][-1] < cutoff: _attempts.pop(k, None)
