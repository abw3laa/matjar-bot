from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_urlsafe
from typing import Annotated
from uuid import UUID

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
        "jti": token_urlsafe(18),
        "iat": now,
        "exp": now + timedelta(minutes=get_settings().jwt_expire_minutes),
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def _decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc
    with connection() as conn:
        revoked = conn.execute("SELECT 1 FROM token_revocations WHERE jti = %s", (payload.get("jti"),)).fetchone()
    if revoked:
        raise HTTPException(status_code=401, detail="Token has been revoked")
    return payload


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


def _hash_refresh(token: str) -> str:
    return sha256(token.encode()).hexdigest()


def login(email: str, password: str) -> tuple[str, str]:
    with connection() as conn:
        row = conn.execute(
            "SELECT id, password_hash, is_active FROM admin_users WHERE email = %s",
            (email.lower().strip(),),
        ).fetchone()
        if not row or not row["is_active"] or not verify_password(password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        access = create_access_token(str(row["id"]))
        refresh = token_urlsafe(48)
        conn.execute(
            "INSERT INTO admin_refresh_tokens (admin_id, token_hash, expires_at) VALUES (%s, %s, %s)",
            (row["id"], _hash_refresh(refresh), datetime.now(timezone.utc) + timedelta(days=30)),
        )
        return access, refresh


def refresh(refresh_token: str) -> tuple[str, str]:
    with connection() as conn:
        with conn.transaction():
            row = conn.execute(
                """SELECT id, admin_id FROM admin_refresh_tokens
                   WHERE token_hash = %s AND revoked_at IS NULL AND expires_at > now()
                   FOR UPDATE""",
                (_hash_refresh(refresh_token),),
            ).fetchone()
            if not row:
                raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
            conn.execute("UPDATE admin_refresh_tokens SET revoked_at = now() WHERE id = %s", (row["id"],))
            access = create_access_token(str(row["admin_id"]))
            replacement = token_urlsafe(48)
            conn.execute(
                "INSERT INTO admin_refresh_tokens (admin_id, token_hash, expires_at) VALUES (%s, %s, %s)",
                (row["admin_id"], _hash_refresh(replacement), datetime.now(timezone.utc) + timedelta(days=30)),
            )
            return access, replacement


def revoke_access_token(payload: dict) -> None:
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    with connection() as conn:
        conn.execute(
            "INSERT INTO token_revocations (jti, expires_at) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (payload["jti"], exp),
        )
