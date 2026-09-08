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
    return r'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhatsApp Connect | Matjar Bot</title>
<style>
:root{--bg:#061020;--panel:#09182b;--panel2:#0c2035;--line:#19314a;--text:#f5f8fc;--muted:#91a4bc;--green:#10c875;--green2:#087d55;--blue:#1687ff;--shadow:0 18px 45px #0005}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 70% 0,#073c35 0,transparent 30%),var(--bg);color:var(--text);font-family:Tahoma,Arial,sans-serif;min-height:100vh}.app{min-height:100vh}.top{height:70px;background:#071426eF;border-bottom:1px solid #20334a;display:flex;align-items:center;justify-content:space-between;padding:0 28px;direction:ltr}.brand{display:flex;align-items:center;gap:13px}.wa{width:42px;height:42px;border-radius:50%;background:#18c978;display:grid;place-items:center;font-size:27px;font-weight:bold;color:white;box-shadow:0 0 20px #11d68188}.brand strong{font-size:19px;letter-spacing:.2px}.brand small{display:block;color:#aabbd0;font-size:12px;margin-top:3px}.user{display:flex;align-items:center;gap:12px;direction:rtl;color:#dce7f4}.avatar{width:42px;height:42px;border-radius:50%;background:#26354b;display:grid;place-items:center;font-size:21px}.user small{display:block;color:#94a7bc;font-size:11px;margin-top:3px}.shell{display:flex;direction:ltr}.side{width:245px;min-height:calc(100vh - 70px);background:#071426;border-right:1px solid #172c43;padding:30px 13px;display:flex;flex-direction:column;direction:rtl}.nav{display:flex;align-items:center;gap:17px;padding:14px 17px;border-radius:8px;color:#a8b9ce;margin-bottom:6px;font-size:16px}.nav.active{background:linear-gradient(100deg,#079765,#09b875);color:white;box-shadow:0 8px 20px #00a96a33}.nav .ico{width:25px;text-align:center;font-size:21px}.side-foot{margin-top:auto;padding:18px 10px;color:#a6b5c8;font-size:13px}.dot{display:inline-block;width:10px;height:10px;background:#16d880;border-radius:50%;margin-left:7px}.side-foot small{display:block;margin-top:8px;color:#6f849e}.main{direction:rtl;flex:1;padding:27px 35px 20px;max-width:1220px;margin:auto;width:100%}.hero{min-height:160px;border:1px solid #1d4a55;border-radius:13px;background:linear-gradient(100deg,#062e32,#063d34 50%,#0a4e3e);position:relative;overflow:hidden;padding:35px 48px;display:flex;align-items:center;gap:30px;box-shadow:var(--shadow)}.hero:after{content:"";position:absolute;width:430px;height:430px;border:1px solid #51dba447;border-radius:50%;left:-80px;top:-170px}.hero .bigwa{font-size:75px;color:#25dc83;text-shadow:0 0 22px #13cf8177;z-index:1}.hero h1{margin:0 0 9px;font-size:27px}.hero p{margin:0;color:#b2d4cf;font-size:15px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:17px;margin-top:20px}.card,.qr-card,.steps,.code-card{background:linear-gradient(145deg,#0a192c,#081526);border:1px solid var(--line);border-radius:13px;box-shadow:var(--shadow)}.card{padding:20px;display:flex;align-items:center;gap:14px;min-height:105px}.card-icon{width:51px;height:51px;border-radius:50%;background:#073f35;color:#2de28b;display:grid;place-items:center;font-size:24px}.card h3{margin:0 0 8px;font-size:16px}.muted{color:#90a2ba;font-size:12px}.pill{display:inline-block;color:white;background:#09b875;border-radius:18px;padding:4px 16px;font-size:13px;margin-bottom:8px}.content{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;margin-top:19px}.qr-card{padding:25px;text-align:center}.qr-card h2,.steps h2{font-size:20px;margin:0 0 10px}.qr-card p{color:#91a4bc;margin:0 0 18px;font-size:13px}.qr-box{width:270px;height:270px;background:#fff;border-radius:13px;margin:0 auto 18px;display:grid;place-items:center;overflow:hidden}.qr-box img{width:100%;height:100%;object-fit:contain}.qr-empty{color:#52657d;font-size:14px;padding:20px}.refresh{border:0;background:linear-gradient(90deg,#0bbd70,#08c982);color:#fff;font-size:16px;font-weight:bold;border-radius:26px;padding:13px 52px;cursor:pointer;box-shadow:0 8px 18px #00b86b44}.refresh:active{transform:scale(.98)}.hint{margin:15px 0 0!important;color:#7f94ae!important;font-size:12px!important}.steps{padding:25px}.steps h2{margin-bottom:22px}.step{display:flex;align-items:flex-start;gap:13px;margin:19px 0;color:#dce6f2;font-size:15px}.num{min-width:29px;height:29px;border-radius:50%;background:#0cb876;color:white;display:grid;place-items:center;font-weight:bold}.step small{display:block;color:#8296af;margin-top:7px}.code-card{margin-top:19px;padding:23px 28px;display:flex;align-items:center;justify-content:space-between;gap:25px}.code-card h2{margin:0 0 8px;font-size:18px}.code-card p{color:#91a4bc;font-size:12px;margin:0}.code{font-size:25px;letter-spacing:8px;border:1px solid #1b4160;border-radius:10px;padding:15px 28px;color:white;background:#07182b;min-width:260px;text-align:center}.footer{display:flex;align-items:center;justify-content:space-between;margin-top:18px;color:#71859d;font-size:11px}.services{color:#a6b7ca}.services b{color:#14ca7a;margin:0 4px}.ok{color:#18d47e}.error{color:#ff8b8b}@media(max-width:900px){.side{width:75px;padding:20px 8px}.nav{justify-content:center;padding:14px 5px}.nav span:not(.ico),.side-foot{display:none}.main{padding:18px}.content{grid-template-columns:1fr}.cards{grid-template-columns:1fr}.hero{padding:25px}.hero h1{font-size:22px}.code-card{flex-direction:column;align-items:stretch}.code{min-width:0}.top{padding:0 15px}}@media(max-width:550px){.side{display:none}.main{padding:12px}.hero{min-height:145px;padding:22px}.hero .bigwa{font-size:50px}.hero h1{font-size:19px}.qr-box{width:230px;height:230px}}
</style></head>
<body><div class="app">
<header class="top"><div class="brand"><div class="wa">◔</div><div><strong>WhatsApp Connect</strong><small>ربط واتساب بسهولة وأمان</small></div></div><div class="user"><div class="avatar">♙</div><div><strong>admin</strong><small>مدير النظام</small></div><span>⌄</span></div></header>
<div class="shell"><aside class="side"><div class="nav active"><span class="ico">⌂</span><span>الرئيسية</span></div><div class="nav"><span class="ico">⚙</span><span>الإعدادات</span></div><div class="nav"><span class="ico">▤</span><span>السجلات</span></div><div class="nav"><span class="ico">?</span><span>المساعدة</span></div><div class="side-foot"><span class="dot"></span><b>Matjar Bot</b><small>منصة التجارة والمبيعات</small></div></aside>
<main class="main"><section class="hero"><div class="bigwa">◔</div><div><h1>مرحباً بك في لوحة التحكم</h1><p>قم بمسح رمز QR لتوصيل حساب واتساب الخاص بك</p></div></section>
<section class="cards"><div class="card"><div class="card-icon">●</div><div><h3>حالة الاتصال</h3><span id="pill" class="pill">جارٍ التحقق</span><div id="stateHint" class="muted">جارٍ فحص الاتصال...</div></div></div><div class="card"><div class="card-icon">☎</div><div><h3>الرقم المتصل به</h3><strong id="phone">غير متصل بعد</strong><div id="lastSeen" class="muted">آخر اتصال: —</div></div></div><div class="card"><div class="card-icon">⟳</div><div><h3>تحديث QR</h3><div class="muted">احصل على رمز جديد</div></div><button class="refresh" style="padding:11px 17px;margin-right:auto" onclick="refresh(true)">⟳</button></div></section>
<section class="content"><section class="qr-card"><h2>امسح رمز QR من واتساب</h2><p>افتح واتساب على هاتفك ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز</p><div class="qr-box"><img id="qr" alt="رمز QR لربط واتساب" hidden><div id="qrEmpty" class="qr-empty">جارٍ تحميل رمز QR...</div></div><button class="refresh" onclick="refresh(true)">تحديث رمز QR ⟳</button><p class="hint">سيتم تحديث الرمز تلقائياً عند الضغط على التحديث</p></section><section class="steps"><h2>طريقة الربط <span style="float:left">▦</span></h2><div class="step"><span class="num">1</span><div>افتح تطبيق واتساب على هاتفك<small>WhatsApp ◔</small></div></div><div class="step"><span class="num">2</span><div>ادخل إلى الإعدادات<small>الإعدادات ⚙</small></div></div><div class="step"><span class="num">3</span><div>اختر الأجهزة المرتبطة<small>الأجهزة المرتبطة ▣</small></div></div><div class="step"><span class="num">4</span><div>اضغط على ربط جهاز<small>ربط جهاز ▯</small></div></div><div class="step"><span class="num">5</span><div>امسح رمز QR المعروض هنا<small>وجّه كاميرا هاتفك إلى الرمز</small></div></div></section></section>
<section class="code-card"><div><h2>رمز الاتصال (بديل عن QR)</h2><p>في حال تعذر مسح رمز QR، يمكنك ربط الحساب باستخدام رمز الاتصال أدناه.</p></div><div><div id="code" class="code">— — —</div><div class="muted" style="text-align:center;margin-top:8px">◷ الرمز صالح لمدة محدودة</div></div></section>
<footer class="footer"><div><span class="dot"></span><span class="ok">جميع الخدمات تعمل بشكل طبيعي</span></div><div class="services">WhatsApp UI <b>•</b> Evolution API <b>•</b> Redis <b>•</b> PostgreSQL <b>•</b> n8n <b>•</b> Caddy</div><div>الإصدار 1.0.0</div></footer>
</main></div></div>
<script>
const $=id=>document.getElementById(id);
async function api(path,options){const r=await fetch(path,options);if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
function setState(state){const s=String(state||'unknown').toLowerCase();const open=s==='open'||s==='connected';$('pill').textContent=open?'متصل':(s==='connecting'?'جاري الاتصال':'غير متصل');$('pill').style.background=open?'#09b875':(s==='connecting'?'#b57a16':'#8a3040');$('stateHint').textContent=open?'الاتصال نشط وجاهز للإرسال والاستقبال':'يرجى مسح رمز QR لإتمام الربط';if(open){$('qr').hidden=true;$('qrEmpty').hidden=false;$('qrEmpty').textContent='تم الربط بنجاح ✓';}}
async function refresh(force=false){try{if(force)await api('/whatsapp/api/create',{method:'POST'});const s=await api('/whatsapp/api/status');const state=s.instance?.state||s.instance?.status||s.state||'unknown';setState(state);if(String(state).toLowerCase()==='open')return;const q=await api('/whatsapp/api/qr');const b=q.qrcode?.base64||q.base64;if(b){const img=$('qr');img.src=b.startsWith('data:')?b:'data:image/png;base64,'+b;img.hidden=false;$('qrEmpty').hidden=true;}if(q.code)$('code').textContent=q.code;}catch(e){$('pill').textContent='غير متصل';$('pill').style.background='#8a3040';$('stateHint').textContent='تعذر الاتصال بالخدمة';$('qrEmpty').textContent='تعذر تحميل رمز QR';}}
refresh();setInterval(()=>refresh(false),5000);
</script></body></html>'''


@app.post("/whatsapp/api/create")
async def create(authorization: str | None = Header(default=None)) -> Any:
    check_basic(authorization)
    return await evolution("POST", "/instance/create", {"instanceName": settings.evolution_instance, "qrcode": True, "integration": "WHATSAPP-BAILEYS", "rejectCall": True, "readMessages": False, "readStatus": False})


@app.get("/whatsapp/api/qr")
async def qr(authorization: str | None = Header(default=None)) -> Any:
    check_basic(authorization)
    return await evolution("GET", f"/instance/connect/{settings.evolution_instance}")


@app.get("/whatsapp/api/status")
async def status(authorization: str | None = Header(default=None)) -> Any:
    check_basic(authorization)
    return await evolution("GET", f"/instance/connectionState/{settings.evolution_instance}")
