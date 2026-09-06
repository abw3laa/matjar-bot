from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from pwdlib import PasswordHash

from .config import get_settings
from .db import connection

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_access_token(subject: str, role: str = "admin") -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=get_settings().jwt_expire_minutes),
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


def require_auth(authorization: Annotated[str | None, Header()] = None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    return _decode_token(authorization.split(" ", 1)[1].strip())


def require_service_or_user(
    authorization: Annotated[str | None, Header()] = None,
    x_internal_token: Annotated[str | None, Header()] = None,
) -> dict:
    settings = get_settings()
    if settings.internal_api_token and x_internal_token == settings.internal_api_token:
        return {"sub": "internal-service", "role": "service"}
    return require_auth(authorization)


def login(email: str, password: str) -> str:
    with connection() as conn:
        row = conn.execute(
            "SELECT id, password_hash, is_active FROM admin_users WHERE email = %s",
            (email.lower().strip(),),
        ).fetchone()
        if not row or not row["is_active"] or not verify_password(password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        return create_access_token(str(row["id"]))
