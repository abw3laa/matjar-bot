# تشغيل WhatsApp عبر QR على الخادم

## الهدف

هذا الدليل يضيف اتصال WhatsApp Web تجريبيًا عبر **Evolution API** باستخدام QR Code، بحيث تفتح:

```text
https://abw3laa.duckdns.org/whatsapp
```

ثم تعرض صفحة الإدارة حالة الاتصال وQR المطلوب مسحه من تطبيق WhatsApp عبر:

```text
الإعدادات ← الأجهزة المرتبطة ← ربط جهاز
```

هذا المسار لا يحتاج إلى WhatsApp Business Cloud API أو Access Token من Meta. لكنه يعتمد على جلسة WhatsApp Web غير الرسمية، ولذلك يُفضَّل استخدام رقم تجريبي مخصص. لا يوجد ضمان من WhatsApp ضد الفصل أو الحظر، ولا ينبغي استخدامه مع رقم شخصي مهم قبل الاختبار.

---

## الوضع الحالي قبل البدء

الخدمات الموجودة على الخادم:

| الخدمة | الوضع المتوقع | الملاحظات |
|---|---|---|
| n8n | يعمل | لا تحذف الحاوية أو Volume `n8n_data` |
| PostgreSQL | يعمل داخل مشروع Matjar | لا علاقة له بقاعدة n8n SQLite |
| Backend | يعمل على `127.0.0.1:8000` | لا تغيّر المنفذ |
| AI Service | يعمل على `127.0.0.1:8010` | يبقى `configured:false` حتى إضافة مفتاح مزود AI |
| Caddy | يعمل على 80/443 | سنضيف مسارًا فقط، ولا نغيّر النطاق الأساسي |

النسخة الاحتياطية الحالية لـ n8n هي:

```text
/home/ubuntu/matjar-backups/20260907-031136/n8n-data.tar.gz
```

لا تبدأ إذا كان n8n متوقفًا أو إذا لم تكن النسخة الاحتياطية موجودة.

---

## التصميم

```text
Browser
  │ HTTPS
  ▼
Caddy: https://abw3laa.duckdns.org/whatsapp
  │
  ▼
QR Web UI على 127.0.0.1:8020
  │ شبكة Docker matjar-net
  ▼
Evolution API على http://evolution-api:8080
  │ Webhook داخلي
  ▼
n8n على http://n8n:5678/webhook/whatsapp/webhook/evolution
```

لن نفتح Evolution API مباشرة على الإنترنت. صفحة QR فقط تكون متاحة من خلال Caddy، ويجب حمايتها برمز دخول أو Basic Authentication قبل الاستخدام.

---

# المرحلة 1: فحص احتياطي قبل أي تعديل

نفّذ على الخادم:

```bash
set -e

sudo test -f /home/ubuntu/matjar-backups/20260907-031136/n8n-data.tar.gz
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
sudo docker volume inspect n8n_data >/dev/null
sudo caddy validate --config /etc/caddy/Caddyfile

echo 'PRECHECK-OK'
```

لا تنتقل إذا لم يظهر:

```text
PRECHECK-OK
```

---

# المرحلة 2: إنشاء مجلد الخدمة

```bash
sudo mkdir -p /opt/matjar-bot/whatsapp-ui
sudo chown -R ubuntu:ubuntu /opt/matjar-bot/whatsapp-ui
cd /opt/matjar-bot/whatsapp-ui
```

أنشئ ملفًا عشوائيًا قويًا لمفتاح Evolution:

```bash
EVOLUTION_API_KEY="$(openssl rand -hex 32)"
printf '%s\n' "$EVOLUTION_API_KEY" > evolution-api.key
chmod 600 evolution-api.key
unset EVOLUTION_API_KEY
```

لا تعرض محتوى `evolution-api.key` ولا ترسله في المحادثة.

---

# المرحلة 3: إضافة Evolution API إلى Compose

افتح ملف Compose:

```bash
cd /opt/matjar-bot/deploy
nano docker-compose.yml
```

أضف الخدمة التالية تحت `services:`. لا تحذف الخدمات الموجودة:

```yaml
  evolution-api:
    image: evoapicloud/evolution-api:latest
    restart: unless-stopped
    environment:
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY}
      SERVER_URL: http://evolution-api:8080
      SERVER_PORT: 8080
      LANGUAGE: en
      LOG_LEVEL: ERROR,WARN
      DEL_INSTANCE: false
      DATABASE_ENABLED: false
      CACHE_REDIS_ENABLED: false
    volumes:
      - evolution_instances:/evolution/instances
    networks: [matjar]
    expose:
      - "8080"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/ || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 10
```

ثم أضف في نهاية الملف تحت `volumes:`:

```yaml
  evolution_instances:
```

وأضف إلى `deploy/.env` قيمة المفتاح دون طباعتها:

```bash
cd /opt/matjar-bot/deploy
EVOLUTION_API_KEY="$(cat /opt/matjar-bot/whatsapp-ui/evolution-api.key)"
printf '\nEVOLUTION_API_KEY=%s\n' "$EVOLUTION_API_KEY" >> .env
unset EVOLUTION_API_KEY
chmod 600 .env
```

قبل التشغيل تحقق من Compose:

```bash
sudo docker compose --env-file .env -f docker-compose.yml config --quiet
echo 'COMPOSE-OK'
```

إذا ظهر خطأ، توقف ولا تشغّل الخدمة.

---

# المرحلة 4: تشغيل Evolution API فقط

```bash
cd /opt/matjar-bot/deploy
sudo docker compose --env-file .env -f docker-compose.yml up -d evolution-api
```

تحقق:

```bash
sudo docker compose --env-file .env -f docker-compose.yml ps evolution-api
sudo docker compose --env-file .env -f docker-compose.yml logs --tail=50 evolution-api
```

يجب أن تكون الحاوية `Up` أو `healthy`. لا تنشر منفذ Evolution إلى الإنترنت، ولا تضف `ports:` للخدمة؛ `expose` كافٍ للاتصال الداخلي.

اختبار داخلي من داخل Backend أو n8n:

```bash
sudo docker exec n8n node -e "fetch('http://evolution-api:8080').then(async r=>console.log('EVOLUTION',r.status,(await r.text()).slice(0,120))).catch(e=>{console.error(e);process.exit(1)})"
```

إذا نجح الاتصال، سيظهر رمز HTTP وحالة مختصرة. لا تطبع مفتاح API.

---

# المرحلة 5: إنشاء واجهة QR آمنة

لا تعرض Evolution API أو مفتاحه للمتصفح. صفحة QR يجب أن تكون خادمًا وسيطًا يقرأ المفتاح من البيئة ويستدعي Evolution API من الخادم.

أنشئ مجلد الواجهة:

```bash
sudo mkdir -p /opt/matjar-bot/whatsapp-ui/app
sudo chown -R ubuntu:ubuntu /opt/matjar-bot/whatsapp-ui
cd /opt/matjar-bot/whatsapp-ui
```

أنشئ `app.py` كتطبيق Flask أو FastAPI صغير يقدّم ثلاثة مسارات فقط:

```text
GET /whatsapp/                 صفحة HTML
POST /whatsapp/api/create      إنشاء instance باسم matjar
GET /whatsapp/api/qr           جلب QR من Evolution API
GET /whatsapp/api/status       جلب connectionState
```

قواعد التطبيق:

1. يقرأ `EVOLUTION_API_URL=http://evolution-api:8080` و`EVOLUTION_API_KEY` من البيئة.
2. لا يعيد المفتاح إلى المتصفح أبدًا.
3. يستخدم `apikey` فقط في طلبات الخادم إلى Evolution API.
4. يقبل instance ثابتًا باسم `matjar`.
5. يفرض Basic Authentication أو Secret Header على كل مسارات الواجهة قبل عرض QR.
6. يضع حدًا زمنيًا للطلبات، مثل 10 ثوانٍ.
7. لا يسجل QR أو API key في logs.
8. يعرض QR بصيغة `data:image/png;base64,...` كما يرجعها Evolution API.
9. يحدّث الحالة كل 5 ثوانٍ فقط أثناء فتح الصفحة، وليس polling كل ثانية.

منطق الطلبات إلى Evolution API:

```text
POST /instance/create
Headers: apikey: <server-only-key>
Body:
{
  "instanceName": "matjar",
  "qrcode": true,
  "integration": "WHATSAPP-BAILEYS",
  "rejectCall": true,
  "readMessages": false,
  "readStatus": false
}
```

إذا كان الـ instance موجودًا، لا تعيد إنشاءه؛ اطلب:

```text
GET /instance/connect/matjar
Headers: apikey: <server-only-key>
```

وللحالة:

```text
GET /instance/connectionState/matjar
Headers: apikey: <server-only-key>
```

القيم الطبيعية للحالة:

```text
close
connecting
open
```

> المرجع الرسمي يوضح أن إنشاء instance مع `qrcode: true` يعيد QR، وأن `/instance/connect/{instance}` يعيد QR عند الحاجة، وأن `/instance/connectionState/{instance}` يعيد حالة الاتصال.

---

# المرحلة 6: ربط Webhook مع n8n

في Workflow:

```text
01 - WhatsApp Incoming Messages
```

يوجد Webhook خاص بـ Evolution باسم تقريبي:

```text
WhatsApp Webhook - Events (POST)
```

بعد معرفة Production URL من n8n، اضبط Evolution API على:

```text
http://n8n:5678/webhook/whatsapp/webhook/evolution
```

لا تستخدم رابط Caddy العام للاتصال الداخلي.

إعداد Webhook في Evolution API:

```text
POST /webhook/set/matjar
Headers:
  apikey: <server-only-key>
  Content-Type: application/json

Body:
{
  "webhook": {
    "enabled": true,
    "url": "http://n8n:5678/webhook/whatsapp/webhook/evolution",
    "byEvents": true,
    "base64": false,
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
  }
}
```

إذا كان إصدار Evolution API المستخدم يطلب صيغة مختلفة، اعتمد على استجابة API ووثيقته، ولا تغيّر Workflows عشوائيًا.

ضع سرًا داخليًا للـ webhook إن كان الإصدار يدعم headers، ثم اجعل عقدة Webhook في n8n تتحقق منه قبل معالجة الرسالة.

---

# المرحلة 7: إعداد Workflow 00

في n8n افتح:

```text
00 - Send WhatsApp Message (Shared)
```

اضبط متغيرات البيئة داخل حاوية n8n:

```text
WHATSAPP_PROVIDER=evolution_api
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_INSTANCE=matjar
EVOLUTION_API_KEY=<نفس المفتاح الموجود على الخادم>
```

لا تضع المفتاح في GitHub أو داخل عقدة n8n كنص ثابت.

بعد تعديل متغيرات Docker، يلزم إعادة إنشاء n8n حتى يقرأها. قبل ذلك:

```bash
sudo docker exec n8n n8n --version
sudo tar -C /var/lib/docker/volumes/n8n_data/_data \
  -czf "$HOME/matjar-backups/n8n-data-before-evolution-$(date +%Y%m%d-%H%M%S).tar.gz" .
```

بعد حفظ نسخة جديدة فقط، أعد إنشاء n8n بنفس Volume `n8n_data` وبنفس إعدادات Caddy السابقة، مع إضافة:

```text
WHATSAPP_PROVIDER
EVOLUTION_API_URL
EVOLUTION_INSTANCE
EVOLUTION_API_KEY
```

ثم أعد ربطه بشبكة `matjar-net` إذا لزم:

```bash
sudo docker network connect matjar-net n8n 2>/dev/null || true
```

تحقق أن n8n يرى Evolution API:

```bash
sudo docker exec n8n node -e "fetch('http://evolution-api:8080').then(r=>console.log('EVOLUTION-N8N',r.status)).catch(e=>{console.error(e);process.exit(1)})"
```

---

# المرحلة 8: إضافة Caddy لمسار `/whatsapp`

لا تستبدل ملف Caddy كاملًا. افتح نسخة احتياطية أولًا:

```bash
sudo cp /etc/caddy/Caddyfile "$HOME/matjar-backups/Caddyfile-$(date +%Y%m%d-%H%M%S)"
sudo nano /etc/caddy/Caddyfile
```

داخل block النطاق الحالي، أضف قبل `reverse_proxy localhost:5678`:

```caddy
handle /whatsapp* {
    reverse_proxy 127.0.0.1:8020
}
```

يجب أن يصبح الشكل تقريبًا:

```caddy
abw3laa.duckdns.org {
    handle /whatsapp* {
        reverse_proxy 127.0.0.1:8020
    }

    reverse_proxy localhost:5678
}
```

قبل إعادة تحميل Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

إذا نجح:

```bash
sudo systemctl reload caddy
```

إذا فشل، أعد الملف من النسخة الاحتياطية ولا تعِد تشغيل Caddy:

```bash
sudo cp "$HOME/matjar-backups/<Caddyfile-backup>" /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

---

# المرحلة 9: اختبار صفحة QR

افتح:

```text
https://abw3laa.duckdns.org/whatsapp
```

يجب أن ترى:

```text
Evolution API: connected to server
Instance: matjar
Status: connecting
QR image
```

امسح QR من WhatsApp:

```text
WhatsApp ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز
```

بعد المسح يجب أن تصبح الحالة:

```text
open
```

ثم اختبر من الخادم:

```bash
sudo docker compose --env-file /opt/matjar-bot/deploy/.env \
  -f /opt/matjar-bot/deploy/docker-compose.yml \
  logs --tail=80 evolution-api
```

لا ترسل logs إذا احتوت على QR أو Token.

---

# المرحلة 10: إرسال رسالة اختبار واحدة

لا تفعّل Workflow استقبال الرسائل قبل نجاح اتصال QR.

اختبر الإرسال أولًا من خلال Evolution API إلى رقم اختبار تملكه فقط:

```text
POST /message/sendText/matjar
Headers:
  apikey: <server-only-key>
  Content-Type: application/json
Body:
{
  "number": "رقم دولي بلا +",
  "text": "رسالة اختبار Matjar"
}
```

لا ترسل رسالة إلى عملاء حقيقيين في الاختبار.

بعد نجاح الإرسال:

1. شغّل Workflow `00` يدويًا ببيانات اختبار.
2. تأكد من وصول الرسالة.
3. افحص سجل Workflow.
4. لا تفعّل Workflow 01 قبل ضبط webhook واختباره.

---

# المرحلة 11: التفعيل التدريجي

التفعيل المقترح:

| الترتيب | Workflow | شرط التفعيل |
|---:|---|---|
| 00 | Send WhatsApp Message (Shared) | إرسال اختبار ناجح إلى رقمك |
| 01 | WhatsApp Incoming Messages | webhook وصل إلى n8n وAI مفعّل أو مسار الفشل مضبوط |
| 02 | WhatsApp AI Conversation | `AI_SERVICE_URL` يعمل و`OPENAI_API_KEY` موجود |
| 03 | Order Creation | اختبار إنشاء طلب تجريبي ناجح |
| 04 | Payment Proof Processing | تخزين ملف واختبار idempotency |
| 05 | Admin Notification | جهاز Expo أو قناة إشعار مضبوطة |
| 06 | Order Status Updates | اختبار تغيير حالة واحد |
| 07 | Facebook Publishing | بيانات Meta موجودة، وإلا يبقى غير مفعّل |
| 08 | Scheduled Posts | اختبار جدولة بدون نشر عام |
| 09 | Facebook & Instagram Comments | Meta signature وWebhook مضبوطين |
| 10 | Messenger Automation | بيانات Meta وموافقة الاختبار موجودة |
| 11 | Admin Conversation Reply | تسجيل دخول الأدمن واختبار داخلي ناجح |

لا تفعّل `01` و`02` إذا كانت AI Service تعيد:

```json
{"configured":false}
```

إلا إذا كان Workflow يحتوي على مسار واضح لإحالة العميل إلى بشري عند فشل AI.

---

# التراجع وإيقاف الخدمة

إيقاف Evolution فقط دون المساس بـ n8n:

```bash
cd /opt/matjar-bot/deploy
sudo docker compose --env-file .env -f docker-compose.yml stop evolution-api
```

إزالة الحاوية مع إبقاء جلسة WhatsApp:

```bash
sudo docker compose --env-file .env -f docker-compose.yml rm -f evolution-api
```

إزالة الخدمة وبيانات الجلسة نهائيًا **لا تنفذها إلا إذا قررت إلغاء WhatsApp**:

```bash
sudo docker volume ls | grep evolution
sudo docker volume rm <evolution-volume-name>
```

التراجع عن شبكة n8n:

```bash
sudo docker network disconnect matjar-net n8n
```

التراجع عن Caddy:

```bash
sudo cp "$HOME/matjar-backups/<Caddyfile-backup>" /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

لا تحذف:

```text
n8n_data
/home/ubuntu/matjar-backups/20260907-031136/n8n-data.tar.gz
```

---

# قائمة نجاح نهائية

اعتبر المرحلة ناجحة فقط عند تحقق كل البنود التالية:

```text
[ ] n8n ما زال Up
[ ] PostgreSQL healthy
[ ] Backend /health = 200
[ ] AI Service /health = 200
[ ] Evolution API Up/healthy
[ ] صفحة /whatsapp تعمل عبر HTTPS
[ ] QR يظهر دون كشف API key
[ ] تم ربط رقم تجريبي وأصبحت الحالة open
[ ] رسالة اختبار وصلت إلى رقمك
[ ] Evolution webhook وصل إلى n8n
[ ] Workflow 00 نجح يدويًا
[ ] لم يتم تفعيل أي Workflow غير مختبر
[ ] توجد نسخة احتياطية جديدة قبل إعادة إنشاء n8n
```

## مراجع

- Evolution API — Instances وQR وconnection state: https://evolutionapi-evolution-api-90.mintlify.app/concepts/instances
- Evolution API — Webhooks: https://evolutionapi-evolution-api-90.mintlify.app/concepts/webhooks


---

# ملحق عملي: واجهة QR جاهزة للنسخ

إذا أردت تنفيذ صفحة QR دون بناء واجهة من الصفر، استخدم هذه الخدمة الوسيطة الصغيرة. ضع الملفات التالية في `/opt/matjar-bot/whatsapp-ui`.

## ملف `requirements.txt`

```text
fastapi==0.115.6
uvicorn[standard]==0.34.0
httpx==0.28.1
pydantic-settings==2.7.1
```

## ملف `app.py`

```python
import html
import os
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    evolution_api_url: str = "http://evolution-api:8080"
    evolution_api_key: str
    evolution_instance: str = "matjar"
    ui_user: str
    ui_password: str

    class Config:
        env_file = ".env"


settings = Settings()
app = FastAPI(title="Matjar WhatsApp QR")


def check_basic(authorization: str | None) -> None:
    import base64
    if not authorization or not authorization.startswith("Basic "):
        raise HTTPException(401, "Authentication required", headers={"WWW-Authenticate": "Basic"})
    try:
        raw = base64.b64decode(authorization[6:]).decode()
        user, password = raw.split(":", 1)
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
            response = await client.request(method, settings.evolution_api_url.rstrip("/") + path, headers=headers, json=payload)
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
async function api(path, options){const r=await fetch(path,options); if(!r.ok) throw new Error('HTTP '+r.status); return r.json()}
async function refresh(){try{await api('/whatsapp/api/create',{method:'POST'});}catch(e){}
try{const s=await api('/whatsapp/api/status'); document.getElementById('status').textContent='الحالة: '+(s.instance?.state||s.instance?.status||s.state||'unknown'); if((s.instance?.state||s.state)==='open'){document.getElementById('qr').hidden=true;return;} const q=await api('/whatsapp/api/qr'); const b=q.qrcode?.base64||q.base64; if(b){const img=document.getElementById('qr');img.src=b;img.hidden=false;} }catch(e){document.getElementById('status').textContent='تعذر الاتصال بالخدمة';}}
refresh(); setInterval(refresh,5000);
</script></html>"""


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
```

## ملف `Dockerfile`

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
EXPOSE 8020
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8020"]
```

## إضافة خدمة الواجهة إلى Compose

أضف إلى `services:`:

```yaml
  whatsapp-ui:
    build:
      context: ../whatsapp-ui
    restart: unless-stopped
    environment:
      EVOLUTION_API_URL: http://evolution-api:8080
      EVOLUTION_API_KEY: ${EVOLUTION_API_KEY}
      EVOLUTION_INSTANCE: matjar
      UI_USER: ${WHATSAPP_UI_USER}
      UI_PASSWORD: ${WHATSAPP_UI_PASSWORD}
    ports:
      - "127.0.0.1:8020:8020"
    networks: [matjar]
    depends_on:
      evolution-api:
        condition: service_started
```

أضف إلى `deploy/.env`، دون إرسال القيم:

```bash
WHATSAPP_UI_USER=admin
WHATSAPP_UI_PASSWORD=<كلمة-مرور-قوية-جديدة>
```

شغّل الواجهة:

```bash
cd /opt/matjar-bot/deploy
sudo docker compose --env-file .env -f docker-compose.yml up -d --build whatsapp-ui
```

اختبرها محليًا:

```bash
curl -I -u "$WHATSAPP_UI_USER:$WHATSAPP_UI_PASSWORD" http://127.0.0.1:8020/whatsapp
```

ثم أضف Caddy route المذكور في المرحلة 8 وافتح:

```text
https://abw3laa.duckdns.org/whatsapp
```

> ملاحظة: بعض إصدارات Evolution API قد تعيد `404` إذا حاولت إنشاء instance موجودًا. الكود أعلاه يتجاهل خطأ الإنشاء ثم يطلب الحالة وQR؛ إذا لم يظهر QR، احذف instance `matjar` من Evolution API مرة واحدة فقط أو أضف فحصًا لمسار `/instance/fetchInstances` قبل الإنشاء.

## ملاحظة أمنية مهمة

Basic Authentication هنا حماية أولية مناسبة لصفحة QR الخاصة. لا تشارك رابط الصفحة أو بيانات الدخول. بعد ربط الرقم، يفضّل تقييد الوصول إلى `/whatsapp` بعنوان IP أو VPN، وإيقاف الصفحة أو تغيير كلمة مرورها.
