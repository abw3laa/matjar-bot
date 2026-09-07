import re
from pathlib import Path

from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.idempotency import claim_or_replay
from app.auth import require_service_or_user
from app.main import app


client = TestClient(app)


def normalize(path: str) -> str:
    return re.sub(r"{[^}]+}", "{}", path)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_all_openapi_operations_are_registered() -> None:
    contract = []
    current = None
    in_paths = False
    for line in Path("../api/openapi.yaml").read_text().splitlines():
        if line == "paths:":
            in_paths = True
            continue
        if in_paths and line.startswith("components:"):
            break
        if not in_paths:
            continue
        path_match = re.match(r"^  (/[^:]+):$", line)
        if path_match:
            current = path_match.group(1)
        method_match = re.match(r"^    (get|post|patch|put|delete):$", line)
        if method_match:
            contract.append((normalize(current), method_match.group(1).upper()))

    registered = {
        (normalize(route.path.removeprefix("/v1")), method)
        for route in app.routes
        for method in getattr(route, "methods", set())
    }
    assert set(contract) <= registered


class FakeCursor:
    def __init__(self, rows):
        self.rows = iter(rows)
        self.calls = []

    def fetchone(self):
        return next(self.rows, None)


class FakeConnection:
    def __init__(self, rows):
        self.cursor = FakeCursor(rows)

    def execute(self, query, params):
        self.cursor.calls.append((query, params))
        return self.cursor


def test_idempotency_claims_a_new_key() -> None:
    conn = FakeConnection([{"id": "new"}])
    assert claim_or_replay(conn, "test", "key-1") is None
    assert len(conn.cursor.calls) == 1


def test_idempotency_without_key_is_disabled() -> None:
    conn = FakeConnection([])
    assert claim_or_replay(conn, "test", None) is None
    assert conn.cursor.calls == []


def test_idempotency_replays_completed_response() -> None:
    conn = FakeConnection([
        None,
        {"response_status": 200, "response_body": {"ok": True}, "completed_at": "now"},
    ])
    response = claim_or_replay(conn, "test", "key-2")
    assert response is not None
    assert response.status_code == 200
    assert response.body == b'{"ok":true}'


def test_idempotency_rejects_in_progress_duplicate() -> None:
    conn = FakeConnection([None, {"response_status": None, "response_body": None, "completed_at": None}])
    try:
        claim_or_replay(conn, "test", "key-3")
    except HTTPException as exc:
        assert exc.status_code == 409
    else:
        raise AssertionError("Expected an in-progress duplicate to be rejected")


def test_internal_token_can_be_sent_as_bearer(monkeypatch) -> None:
    from app import auth
    monkeypatch.setattr(auth.get_settings(), "internal_api_token", "internal-secret")
    assert require_service_or_user(authorization="Bearer internal-secret") == {
        "sub": "internal-service", "role": "service"
    }
