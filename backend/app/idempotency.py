from typing import Any

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from psycopg.types.json import Jsonb


def claim_or_replay(conn, scope: str, key: str | None) -> JSONResponse | None:
    """Claim a key or return the exact previously completed response.

    A missing key preserves backward compatibility. Concurrent callers that hit an
    in-progress key receive 409 rather than executing the operation twice.
    """
    if not key:
        return None
    claimed = conn.execute(
        """INSERT INTO api_idempotency (scope, idempotency_key)
           VALUES (%s, %s) ON CONFLICT (scope, idempotency_key) DO NOTHING
           RETURNING id""",
        (scope, key),
    ).fetchone()
    if claimed:
        return None
    previous = conn.execute(
        """SELECT response_status, response_body, completed_at
           FROM api_idempotency WHERE scope = %s AND idempotency_key = %s""",
        (scope, key),
    ).fetchone()
    if not previous or previous["completed_at"] is None:
        raise HTTPException(409, "An identical request is already in progress")
    return JSONResponse(status_code=previous["response_status"], content=previous["response_body"])


def complete(conn, scope: str, key: str | None, status_code: int, body: Any) -> None:
    if not key:
        return
    conn.execute(
        """UPDATE api_idempotency
           SET response_status = %s, response_body = %s::jsonb, completed_at = now()
           WHERE scope = %s AND idempotency_key = %s""",
        (status_code, Jsonb(jsonable_encoder(body)), scope, key),
    )
