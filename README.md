# Matjar Bot — منصة الأتمتة والمبيعات متعددة القنوات

منصة WhatsApp + Facebook + Instagram + (جزئياً) TikTok مع تطبيق أدمن احترافي وn8n كطبقة
أتمتة رئيسية.

**📋 ابدأ من هنا: [`docs/project-report.md`](docs/project-report.md)** — تقرير شامل بحالة
كل جزء، أهم فجوات الأمان الحقيقية، العمل اليدوي المتبقي بالترتيب، وتوصيات التوسع.

راجع `docs/architecture.md` للتصميم الكامل قبل أي تعديل — كل قرار معماري موثّق هناك مع سببه.

## بنية المشروع

```
matjar-bot/
├── docs/
│   ├── architecture.md          التصميم الكامل: Architecture → DB → APIs → Workflows → Admin App
│   ├── whatsapp-backup-connector.md   إعداد العقدة الاحتياطية (Evolution API / QR)
│   └── tiktok-integration.md    حالة تكامل TikTok الفعلية — ما يعمل الآن وما هو مقيّد فعلياً ولماذا
├── database/
│   └── migrations/
│       └── 001_init_schema.sql  مخطط قاعدة البيانات الكامل (PostgreSQL)
├── api/
│   └── openapi.yaml             مواصفة الـ Backend API (32+ نقطة نهاية، مصدر الحقيقة الوحيد)
├── n8n-workflows/
│   └── 00..11-*.json            كل الـ Workflows (00 = إرسال WhatsApp المشترك)، جاهزة للاستيراد المباشر
└── admin-app/                   تطبيق الأدمن (Expo + React Native + TypeScript)
    └── README.md                 تفاصيل التشغيل وما تم بناؤه وما تبقّى
```

## ترتيب النشر الفعلي المقترح

1. **قاعدة البيانات**: نفّذ `database/migrations/001_init_schema.sql` على PostgreSQL فارغة.
2. **Backend API**: ابنِ خدمة تطبّق `api/openapi.yaml` حرفياً (لم تُبنَ الشيفرة الفعلية بعد — هذه مواصفة العقد فقط).
3. **n8n**: استورد ملفات `n8n-workflows/` بالترتيب الرقمي **بدءاً من 00**، واربط عُقد Execute Workflow ببعضها (كل عقدة بها ملاحظة توضح أي Workflow تستدعي)، واضبط متغيرات البيئة:
   - أساسية: `API_BASE_URL`, `BACKEND_API_TOKEN`, `AI_SERVICE_URL`, `AI_SERVICE_TOKEN`
   - WhatsApp (رسمي): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`
   - WhatsApp (احتياطي، اختياري) — راجع `docs/whatsapp-backup-connector.md`: `WHATSAPP_PROVIDER`, `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_API_KEY`
   - Facebook: `FACEBOOK_VERIFY_TOKEN`, `FACEBOOK_PAGE_ID`
4. **تطبيق الأدمن**: راجع `admin-app/README.md`.

## حالة الإنجاز

| الجزء | الحالة |
|---|---|
| Architecture + DB Schema + OpenAPI | ✅ مكتمل (31 نقطة نهاية، بعد عدة جولات تنظيف اكتشفت خللاً حقيقياً في تكرار `components` وأصلحته) |
| n8n Workflows | ✅ 11 Workflow (10 الأصلية + `11-admin-conversation-reply` لخدمة شاشة المحادثات) |
| Backend API (الشيفرة الفعلية) | ⬜ لم تُبنَ — العقد موثّق في `api/openapi.yaml` فقط |
| AI Service (endpoints `/nlu` و`/compose-reply`) | ⬜ لم تُبنَ — عقد مفترض فقط، موثّق داخل ملاحظات Workflow 02 |
| تطبيق الأدمن | 🟡 جزئي — تسجيل الدخول، الطلبات (قائمة+تفاصيل)، النشر، والمحادثات المُصعَّدة جاهزة؛ الباقي في `admin-app/README.md` |
| بناء APK تلقائي (CI/CD) | ✅ مكتمل — `.github/workflows/eas-build-android.yml` |
| عقدة WhatsApp احتياطية (QR) | ✅ مكتمل — Evolution API، تبديل بمتغير بيئة واحد، راجع `docs/whatsapp-backup-connector.md` |
| Instagram (نشر + تعليقات + تحويل لـ WhatsApp) | ✅ مكتمل — امتداد لنفس Workflow 09/10، الـ Backend يحتاج بناء استدعاءات Graph API الخاصة بإنستغرام |
| TikTok | 🟡 النشر فقط قابل للبناء الآن بثقة — راجع `docs/tiktok-integration.md` لسبب عدم بناء الرد على التعليقات/الرسائل الخاصة |
