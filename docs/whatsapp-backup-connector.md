# العقدة الاحتياطية لـ WhatsApp — Evolution API (ربط بمسح QR)

## لماذا؟
WhatsApp Cloud API الرسمي يحتاج موافقة Meta Business Verification، وقد يتوقف/يُعلَّق الحساب،
أو يكون غير متاح أصلاً لبعض الأعمال. هذه عقدة احتياطية بديلة تعمل بربط رقم WhatsApp عادي عبر
مسح رمز QR (تماماً مثل WhatsApp Web) — بلا حاجة لأي موافقة من Meta.

**هذه ليست بديلاً دائماً موصى به للاستخدام الأساسي** — فهي غير رسمية (تعتمد على مكتبة Baileys
التي تحاكي بروتوكول WhatsApp Web)، ويحمل استخدامها مخاطرة حظر الرقم من طرف WhatsApp إن أُسيء
استخدامها (إرسال جماعي، معدل رسائل مرتفع جداً، سلوك يشبه Spam). استخدمها كخطة B عند توقف الرسمي،
وليس كبديل دائم لحساب Business موثّق.

## كيف تعمل في هذا المشروع
- Workflow **`00 - Send WhatsApp Message (Shared)`** هو نقطة الإرسال الوحيدة في كل المنظومة —
  كل Workflow آخر (02, 03, 06, 11) يستدعيه بدل التحدث لـ Graph API مباشرة.
- التبديل بين الاثنين هو **متغير بيئة واحد** في n8n: `WHATSAPP_PROVIDER=cloud_api` (افتراضي) أو
  `WHATSAPP_PROVIDER=evolution_api`.
- **الاستقبال منفصل عن الإرسال**: `01 - WhatsApp Incoming Messages` يحتوي الآن مسارَي webhook
  مستقلَّين — مسار Meta الأصلي، ومسار Evolution الجديد (`Evolution Webhook - Events (POST)`) —
  وكلاهما يوحّدان مخرجاتهما لنفس الشكل قبل أن يدخلا نفس منطق المعالجة اللاحقة. أي: يمكن تفعيل
  الاثنين معاً فعلياً (رقمان مختلفان، أحدهما رسمي والآخر احتياطي)، وليس فقط التبديل الكامل بينهما.

## نشر Evolution API (Docker)

```yaml
# docker-compose.yml
services:
  evolution-api:
    image: evoapicloud/evolution-api:latest
    ports:
      - "8080:8080"
    environment:
      - AUTHENTICATION_API_KEY=ضع-مفتاحاً-سرياً-قوياً-هنا
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://user:pass@your-postgres-host:5432/evolution
      - CACHE_REDIS_ENABLED=true
      - CACHE_REDIS_URI=redis://your-redis-host:6379
```

يُفضَّل قاعدة بيانات Postgres مستقلة (أو schema منفصل) عن قاعدة بيانات المشروع الأساسية —
Evolution تخزّن فيها حالة الجلسة/الأجهزة، وليس بيانات تجارية، فلا داعي لمشاركتها.

## الربط لأول مرة (QR)

1. أنشئ instance عبر لوحة Evolution (`/manager` على الرابط الذي نشرته):
   اسم الـ instance = نفس قيمة `EVOLUTION_INSTANCE` أدناه.
2. فعّل الـ Webhook لهذا الـ instance، وأشّر رابطه إلى:
   `https://<رابط n8n لديك>/webhook/whatsapp/webhook/evolution`
   مع تفعيل الحدث `MESSAGES_UPSERT` على الأقل.
3. امسح رمز QR الذي تعرضه اللوحة بتطبيق WhatsApp على الهاتف المخصص لهذا الرقم
   (الإعدادات ← الأجهزة المرتبطة ← ربط جهاز).
4. الرقم متصل الآن — لا حاجة لإعادة المسح ما لم يُفصَل الجهاز يدوياً أو يخرج الهاتف عن الشبكة لفترة طويلة جداً.

## متغيرات البيئة المطلوبة في n8n

| المتغير | مثال | الوصف |
|---|---|---|
| `WHATSAPP_PROVIDER` | `evolution_api` | التبديل الفعلي. اتركه فارغاً أو `cloud_api` للوضع الرسمي |
| `EVOLUTION_API_URL` | `https://evolution.yourdomain.com` | رابط خادم Evolution المنشور |
| `EVOLUTION_INSTANCE` | `matjar-main` | اسم الـ instance الذي أنشأته |
| `EVOLUTION_API_KEY` | (المفتاح من `AUTHENTICATION_API_KEY`) | يُرسَل في header باسم `apikey` |

## القيد الوحيد المتبقي: الوسائط (إثبات التحويل)

الرسائل النصية تعمل بالتوازي الكامل بين المزوّدين فوراً بلا أي عمل إضافي. أما استقبال
**صور/PDF إثبات التحويل عبر مسار Evolution تحديداً** فيحتاج تعديلاً صغيراً إضافياً في
`04 - Payment Proof Processing` (آلية تنزيل الوسائط مختلفة عن أسلوب Meta ثنائي الخطوة) —
لم يُنفَّذ بعد، ومُشار إليه بوضوح في ملاحظة عقدة `Extract Evolution Message`. إن كانت
العقدة الاحتياطية مفعّلة فعلياً، اختبر مسار استلام إثبات التحويل تحديداً قبل الاعتماد عليها
بالكامل في هذا الجزء تحديداً.
