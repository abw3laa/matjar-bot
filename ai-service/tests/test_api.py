import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_unconfigured_without_secrets(monkeypatch):
    from app import main
    monkeypatch.setattr(main.settings, "ai_service_token", "")
    monkeypatch.setattr(main.settings, "openai_api_key", "")
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "configured": False}


def test_nlu_fails_closed_without_service_token(monkeypatch):
    from app import main
    monkeypatch.setattr(main.settings, "ai_service_token", "")
    response = TestClient(app).post("/nlu", json={"message_text": "السعر؟"})
    assert response.status_code == 503


def test_compose_fails_closed_with_invalid_token(monkeypatch):
    from app import main
    monkeypatch.setattr(main.settings, "ai_service_token", "expected")
    response = TestClient(app).post(
        "/compose-reply",
        headers={"Authorization": "Bearer wrong"},
        json={"intent": "ask_price", "grounding_data": {"base_price": 10}},
    )
    assert response.status_code == 401
