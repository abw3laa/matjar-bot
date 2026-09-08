import base64
import os
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    evolution_api_url: str = "http://evolution-api:8080"
    evolution_api_key: str
    evolution_instance: str = "matjar"
    ui_user: str = "admin"
    ui_password: str
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
app = FastAPI(title="Matjar WhatsApp QR")


def check_basic(authorization: str | None) -> None:
    if not authorization or not authorization.startswith("Basic "):
        raise HTTPException(401, "Authentication required", headers={"WWW-Authenticate": "Basic"})
    try:
        user, password = base64.b64decode(authorization[6:]).decode().split(":", 1)
    except Exception as exc:
        raise HTTPException(401, "Invalid authentication", headers={"WWW-Authenticate": "Basic"}) from exc
    if user != settings.ui_user or password != settings.ui_password:
        raise HTTPException(401, "Invalid authentication", headers={"WWW-Authenticate": "Basic"})


async def evolution(method: str, path: str, payload: dict[str, Any] | None = None) -> Any:
    headers = {"apikey": settings.evolution_api_key}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.request(
                method,
                settings.evolution_api_url.rstrip("/") + path,
                headers=headers,
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Evolution API is unavailable") from exc
    if response.status_code >= 400:
        raise HTTPException(response.status_code, "Evolution API request failed")
    try:
        return response.json()
    except ValueError:
        return {"text": response.text[:200]}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/whatsapp", response_class=HTMLResponse)
@app.get("/whatsapp/", response_class=HTMLResponse)
async def page(authorization: str | None = Header(default=None)) -> str:
    check_basic(authorization)
    return """<!doctype html><html lang='ar' dir='rtl'><meta charset='utf-8'>
<title>ربط WhatsApp</title><style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:20px}img{max-width:360px;border:1px solid #ddd;padding:12px}.ok{color:green}.bad{color:#a00}</style>
<h1>ربط WhatsApp</h1><p id='status'>جارٍ التحميل...</p><img id='qr' alt='QR Code' hidden><p>افتح WhatsApp ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز.</p>
<script>
async function api(path, options){const r=await fetch(path,options);if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
async function refresh(){try{await api('/whatsapp/api/create',{method:'POST'});}catch(e){}
try{const s=await api('/whatsapp/api/status');const state=s.instance?.state||s.instance?.status||s.state||'unknown';document.getElementById('status').textContent='الحالة: '+state;if(state==='open'){document.getElementById('qr').hidden=true;return;}const q=await api('/whatsapp/api/qr');const b=q.qrcode?.base64||q.base64;if(b){const img=document.getElementById('qr');img.src=b;img.hidden=false;}}catch(e){document.getElementById('status').textContent='تعذر الاتصال بالخدمة';}}
refresh();setInterval(refresh,5000);
</script></html>"""


@app.post("/whatsapp/api/create")
async def create(authorization: str | None = Header(default=None)) -> Any:
    check_basic(authorization)
    return await evolution(
        "POST",
        "/instance/create",
        {
            "instanceName": settings.evolution_instance,
            "qrcode": True,
            "integration": "WHATSAPP-BAILEYS",
            "rejectCall": True,
            "readMessages": False,
            "readStatus": False,
        },
    )


@app.get("/whatsapp/api/qr")
async def qr(authorization: str | None = Header(default=None)) -> Any:
    check_basic(authorization)
    return await evolution("GET", f"/instance/connect/{settings.evolution_instance}")


@app.get("/whatsapp/api/status")
async def status(authorization: str | None = Header(default=None)) -> Any:
    check_basic(authorization)
    return await evolution("GET", f"/instance/connectionState/{settings.evolution_instance}")
