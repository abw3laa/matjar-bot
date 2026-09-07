# منصة الأتمتة والمبيعات متعددة القنوات (WhatsApp + Facebook)
## وثيقة التصميم الشامل — Architecture → Database → APIs → n8n Workflows → Admin App

> هذه الوثيقة تحوّل المتطلبات المرسلة إلى تصميم تقني كامل دون حذف أي متطلب أو اختراع متطلبات جديدة.

---

## 1. البنية المعمارية العامة (System Architecture)

### 1.1 المبدأ الأساسي
**قاعدة البيانات = Source of Truth الوحيد** للأسعار، المخزون، حالة الطلب، رقم التتبع.
**الذكاء الاصطناعي = طبقة فهم وصياغة فقط** (NLU + Content Generation)، ولا يخزّن ولا يخترع بيانات تجارية؛ أي معلومة تجارية يذكرها البوت يجب أن تُجلب حيّة (real-time query) من الـ API/DB.

### 1.2 الطبقات (Layers)

```
┌─────────────────────────────────────────────────────────────────┐
│  CHANNEL LAYER                                                   │
│  WhatsApp Cloud API │ Facebook Page/Comments │ Messenger          │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ Webhooks
┌───────────────────────────────▼───────────────────────────────────┐
│  AUTOMATION LAYER — n8n (Orchestration)                           │
│  استقبال الأحداث، تنسيق الاستدعاءات بين القنوات/AI/Backend        │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ REST calls
┌───────────────────────────────▼───────────────────────────────────┐
│  APPLICATION / API LAYER (Backend Service)                        │
│  منطق العمل، Idempotency، State Machine، Source-of-Truth Access   │
└───────┬─────────────────────────────────────┬─────────────────────┘
        │                                     │
┌───────▼────────┐                   ┌────────▼─────────┐
│  DATABASE       │                   │  AI SERVICE        │
│  PostgreSQL     │                   │  NLU + Content Gen  │
│  (دائمة)        │                   │  (بدون تخزين بيانات  │
│                 │                   │   تجارية)            │
└─────────────────┘                   └──────────────────────┘
        │
┌───────▼────────┐
│  OBJECT STORAGE │  (S3-compatible) لإثباتات التحويل، صور/فيديوهات المنشورات
└─────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ADMIN APP (Mobile-first)                                        │
│  الطلبات │ النشر على مواقع التواصل │ الإشعارات                    │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 لماذا هذا التقسيم
- **n8n لا يحمل منطق العمل الحرج** (لا يقرر السعر ولا يغيّر حالة الطلب مباشرة) — فقط ينسّق. القرار والتحقق النهائي دائماً عبر الـ Backend API الذي يفرض قواعد العمل والـ Idempotency، لتفادي تكرار الطلبات/الرسائل عند إعادة تشغيل Workflow.
- **الـ Backend API طبقة موحّدة** يستخدمها n8n والـ Admin App معاً، فلا يوجد مصدرين للحقيقة.
- **الـ AI Service بلا حالة (stateless)** تجاه البيانات التجارية: يستقبل سياق المحادثة + بيانات حقيقية من الـ API كمدخلات، ويُخرج نية العميل (Intent/Entities) أو نص منشور، ولا يقرر سعراً أو مخزوناً.

---

## 2. مخطط قاعدة البيانات (Database Schema)

قاعدة بيانات علائقية (PostgreSQL) — كل الجداول التالية مطلوبة صراحة في المواصفات.

### 2.1 Products & Catalog

```sql
products (
  id UUID PK,
  name TEXT,
  description TEXT,
  base_price NUMERIC,        -- قد تُلغى لصالح سعر الـ variant
  is_active BOOLEAN,
  created_at, updated_at
)

product_variants (
  id UUID PK,
  product_id UUID FK -> products,
  sku TEXT UNIQUE,
  color TEXT,
  size TEXT,
  price NUMERIC,
  is_active BOOLEAN,
  created_at, updated_at
)

inventory (
  id UUID PK,
  variant_id UUID FK -> product_variants,
  quantity_available INTEGER,
  reserved_quantity INTEGER,   -- لتفادي بيع نفس القطعة مرتين أثناء انتظار مراجعة الأدمن
  updated_at
)
```

### 2.2 Customers & Conversations

```sql
customers (
  id UUID PK,
  full_name TEXT,
  phone TEXT UNIQUE,
  address TEXT,
  created_at, updated_at
)

customer_channel_identities (      -- ربط نفس العميل عبر أكثر من قناة (WhatsApp/Messenger)
  id UUID PK,
  customer_id UUID FK -> customers,
  channel TEXT,                    -- whatsapp | messenger
  channel_user_id TEXT,
  UNIQUE(channel, channel_user_id)
)

conversations (
  id UUID PK,
  customer_channel_identity_id UUID FK,
  channel TEXT,
  status TEXT,                     -- active | escalated_to_human | closed
  current_context JSONB,           -- المنتج/اللون/المقاس قيد النقاش حالياً (context tracking)
  created_at, updated_at
)

messages (
  id UUID PK,
  conversation_id UUID FK -> conversations,
  direction TEXT,                  -- inbound | outbound
  sender TEXT,                     -- customer | bot | admin
  content TEXT,
  message_type TEXT,               -- text | image | document
  media_url TEXT,
  created_at
)
```

### 2.3 Orders

```sql
orders (
  id UUID PK,
  order_number TEXT UNIQUE,        -- رقم مرجعي واضح للعميل والأدمن
  customer_id UUID FK -> customers,
  conversation_id UUID FK -> conversations,
  status TEXT,                     -- انظر State Machine في القسم 4
  payment_method_id UUID FK -> payment_methods,
  total_amount NUMERIC,
  shipping_address TEXT,
  created_at, updated_at
)

order_items (
  id UUID PK,
  order_id UUID FK -> orders,
  variant_id UUID FK -> product_variants,
  quantity INTEGER,
  unit_price NUMERIC
)

order_status_history (
  id UUID PK,
  order_id UUID FK -> orders,
  from_status TEXT,
  to_status TEXT,
  changed_by TEXT,                 -- system | admin:<id> | bot
  note TEXT,
  created_at
)

tracking_numbers (
  id UUID PK,
  order_id UUID FK -> orders UNIQUE,
  tracking_number TEXT,
  carrier TEXT,
  entered_by_admin_id UUID,
  created_at
)
```

### 2.4 Payments

```sql
payment_methods (
  id UUID PK,
  type TEXT,                       -- bank_transfer | cash_on_delivery
  is_enabled BOOLEAN,
  details JSONB,                   -- IBAN وغيرها، قابلة للإدارة من النظام
  created_at, updated_at
)

payment_proofs (
  id UUID PK,
  order_id UUID FK -> orders,
  file_url TEXT,
  file_type TEXT,                  -- pdf | image
  ai_verification_result JSONB,    -- نتيجة تحليل AI الأولي (اختياري، غير قطعي)
  reviewed_by_admin_id UUID,
  created_at
)
```

### 2.5 Social / Facebook

```sql
social_accounts (
  id UUID PK,
  platform TEXT,                   -- facebook | (قابلة للتوسع: instagram, tiktok لاحقاً)
  page_id TEXT,
  access_token_ref TEXT,           -- مرجع آمن للتوكن (مُخزَّن مشفّراً/في Secret Manager)
  is_active BOOLEAN
)

social_posts (
  id UUID PK,
  product_id UUID FK -> products NULL,
  created_by_admin_id UUID,
  media_urls JSONB,
  ai_generated_caption TEXT,
  final_caption TEXT,
  target_platforms JSONB,          -- ["facebook"] أو all
  status TEXT,                     -- draft | scheduled | published | failed
  published_post_id TEXT,          -- ID المنشور الفعلي بعد النشر
  created_at, updated_at
)

scheduled_posts (
  id UUID PK,
  social_post_id UUID FK -> social_posts,
  scheduled_at TIMESTAMPTZ,
  status TEXT,                     -- pending | executed | failed
  executed_at TIMESTAMPTZ
)

facebook_comments (
  id UUID PK,
  facebook_comment_id TEXT UNIQUE,
  social_post_id UUID FK -> social_posts,
  commenter_facebook_id TEXT,
  comment_text TEXT,
  replied BOOLEAN DEFAULT FALSE,
  messenger_sent BOOLEAN DEFAULT FALSE,
  created_at
)

messenger_conversations (
  id UUID PK,
  commenter_facebook_id TEXT,
  facebook_comment_id UUID FK -> facebook_comments,
  status TEXT,                     -- sent | customer_replied
  created_at
)
```

### 2.6 Automation / Idempotency

```sql
automation_state (
  id UUID PK,
  entity_type TEXT,                -- e.g. 'facebook_comment_reply', 'messenger_dm'
  entity_key TEXT,                 -- مثال: commenter_facebook_id + post_id
  status TEXT,
  processed_at TIMESTAMPTZ,
  UNIQUE(entity_type, entity_key)  -- يمنع التكرار (idempotency) على مستوى DB
)
```

هذا الجدول هو الأداة المركزية لتنفيذ متطلب **"منع تكرار الرد/الرسالة لنفس الشخص"**: قبل إرسال أي رد على تعليق أو رسالة Messenger، يتحقق النظام من وجود سجل مطابق؛ إن وُجد يتم تجاهل التكرار.

---

## 3. آلية حفظ سياق المحادثة (Conversation Context)

لتنفيذ متطلب "بدي الأسود" / "بدي L" دون إعادة السؤال:

- كل `conversation` تحمل حقل `current_context JSONB` بالشكل:
```json
{
  "active_product_id": "uuid",
  "selected_color": null,
  "selected_size": null,
  "last_intent": "asked_price",
  "updated_at": "..."
}
```
- عند كل رسالة واردة، تستخرج طبقة الـ AI الـ Intent/Entities، ثم يقوم الـ Backend API بدمجها (merge) مع `current_context` الحالي بدلاً من استبداله بالكامل — أي أن "بدي الأسود" تُفهم كتحديث لـ `selected_color` ضمن `active_product_id` الحالي، وليس كطلب مستقل.
- أي بيانات طلب (اسم، هاتف، عنوان) ذُكرت سابقاً في المحادثة تُستخرج وتُخزَّن أيضاً ضمن الـ context أو مباشرة في `customers`، بحيث لا يُطلب من العميل تكرارها.

---

## 4. آلة حالات الطلب (Order State Machine)

```
NEW
 → PRODUCT_SELECTED
 → WAITING_FOR_CUSTOMER_DATA
 → WAITING_FOR_PAYMENT
 → WAITING_FOR_PAYMENT_PROOF
 → PENDING_ADMIN_REVIEW
 → APPROVED → SHIPPED   (بعد إدخال رقم التتبع)
 → REJECTED
 → OUT_OF_STOCK
```

- كل انتقال حالة يُسجَّل في `order_status_history` (من — إلى — بواسطة من — وقت).
- الحالة الحالية للطلب تُقرأ دائماً من `orders.status`، وليس من نص المحادثة أو من ذاكرة الـ AI.
- الانتقالات الحساسة (مثل PENDING_ADMIN_REVIEW → APPROVED) يجب أن تكون **Idempotent**: استدعاء نفس العملية مرتين (مثلاً بسبب retry في n8n) لا يجب أن يُنشئ رقم تتبع مكرر أو يرسل رسالة تأكيد مرتين — يُستخدم لهذا `automation_state` أو قيد UNIQUE على `tracking_numbers.order_id`.

---

## 5. طبقة الـ APIs (Backend Service)

كل استدعاءات n8n والـ Admin App تمر عبر هذه الـ API فقط (لا وصول مباشر لقاعدة البيانات من أي طبقة أخرى).

### 5.1 Catalog API
- `GET /products/{id}` — بيانات المنتج
- `GET /products/{id}/variants` — الألوان/المقاسات المتاحة
- `GET /variants/{id}/availability` — التحقق من توفر variant محدد في المخزون

### 5.2 Conversation & Context API
- `POST /conversations/{id}/context` — دمج (merge) تحديث على السياق الحالي
- `GET /conversations/{id}/context` — قراءة السياق الحالي
- `POST /conversations/{id}/escalate` — تحويل المحادثة لبشري (يغيّر status إلى escalated_to_human)

### 5.3 Orders API
- `POST /orders` — إنشاء طلب مرتبط بـ conversation/customer
- `PATCH /orders/{id}/customer-data` — تحديث الاسم/الهاتف/العنوان
- `GET /orders/{id}` — تفاصيل كاملة (لعرضها في الأدمن)
- `POST /orders/{id}/payment-proof` — رفع/ربط إثبات التحويل (Idempotent عبر file hash + order_id)
- `POST /orders/{id}/decision` — body: `{decision: approve|reject|out_of_stock, tracking_number?, carrier?}`
  يُنفَّذ هنا كل منطق القسم 6/7/8 (تحديث الحالة + حفظ رقم التتبع + إعداد رسالة الإشعار للعميل)

### 5.4 Payment Methods API
- `GET /payment-methods` — القائمة المفعّلة حالياً (لعرضها للعميل)
- `PATCH /payment-methods/{id}` — تفعيل/تعطيل/تعديل IBAN (إدارة من النظام)

### 5.5 Social Publishing API
- `POST /social-posts` — إنشاء منشور (draft)
- `POST /social-posts/{id}/generate-caption` — يستدعي AI مع بيانات المنتج الحقيقية من DB لصياغة الوصف
- `POST /social-posts/{id}/schedule` — جدولة (`scheduled_at`)
- `POST /social-posts/{id}/publish` — نشر فوري (لكل المنصات المختارة أو منصة محددة)

### 5.6 Facebook Comments / Messenger API
- `POST /facebook-comments` — تسجيل تعليق وارد (من n8n)
- `POST /facebook-comments/{id}/reply` — الرد العلني الثابت، مع فحص idempotency أولاً
- `POST /messenger/send-whatsapp-redirect` — إرسال رسالة Messenger + رابط WhatsApp، مع فحص idempotency لنفس `commenter_facebook_id` + `facebook_comment.social_post_id`

جميع نقاط النهاية الحساسة (`decision`, `reply`, `send-whatsapp-redirect`, `payment-proof`) تدعم **Idempotency Key** في الـ header لتفادي التكرار عند إعادة محاولة n8n.

---

## 6. تصميم Workflows في n8n

تقسيم منطقي حسب المتطلبات (بدون تجميع كل شيء في Workflow واحد):

| Workflow | المُطلِق (Trigger) | الوظيفة الأساسية |
|---|---|---|
| **WhatsApp Incoming Messages** | Webhook من WhatsApp Cloud API | استقبال الرسالة، تحديد/إنشاء conversation، تمرير للـ AI Conversation Workflow |
| **WhatsApp AI Conversation** | استدعاء داخلي من Workflow السابق | استدعاء AI لاستخراج Intent/Entities، دمج مع context عبر API، استعلام Catalog API عن السعر/الألوان/المقاسات الحقيقية، تركيب الرد، إرسال عبر WhatsApp API |
| **Order Creation** | حدث "تأكيد الشراء" ضمن المحادثة | إنشاء order + order_items عبر Orders API، الانتقال لحالة WAITING_FOR_CUSTOMER_DATA |
| **Payment Proof Processing** | استقبال ملف (صورة/PDF) على WhatsApp | رفع الملف لـ Object Storage، ربطه بالطلب عبر API، تشغيل تحليل AI اختياري، تحويل الحالة إلى PENDING_ADMIN_REVIEW |
| **Admin Notification** | تحديث حالة الطلب إلى PENDING_ADMIN_REVIEW | إرسال إشعار فوري لتطبيق الأدمن (Push Notification) بكل تفاصيل الطلب |
| **Order Status Updates** | قرار الأدمن (approve/reject/out_of_stock) من Admin App | استدعاء `POST /orders/{id}/decision`، ثم إرسال رسالة WhatsApp المناسبة للعميل حسب النتيجة |
| **Facebook Publishing** | ضغط "نشر الآن" من الأدمن | استدعاء Graph API للنشر على المنصة/المنصات المختارة، تحديث حالة social_post |
| **Scheduled Posts** | Cron/Scheduler دوري | فحص scheduled_posts المستحقة، تنفيذ النشر، تحديث الحالة |
| **Facebook Comments** | Webhook تعليقات Facebook | فحص idempotency عبر automation_state، إن لم يُعالَج من قبل: الرد العلني الثابت + تسجيل التعليق |
| **Messenger Automation** | بعد نجاح الرد على التعليق | إرسال Messenger DM لصاحب التعليق (مع رابط/زر WhatsApp) — بفحص idempotency مستقل بحيث لا يتكرر حتى لو تكررت التعليقات من نفس الشخص |

### 6.1 مبدأ الـ Idempotency في n8n
كل Workflow حساس (رد على تعليق، إرسال Messenger، تحويل حالة طلب) يبدأ بخطوة **"Check Idempotency"** تستعلم من `automation_state` عبر API قبل تنفيذ أي إجراء فعلي، ويُسجَّل الإجراء فور نجاحه — بحيث تكرار الحدث (تعليق ثانٍ من نفس الشخص، إعادة تشغيل Workflow بعد فشل) لا يُنتج رسائل أو طلبات مكررة.

---

## 7. تطبيق الأدمن (Admin App) — Mobile-first

### 7.1 المبادئ
- مصمَّم أساساً للهاتف، احترافي وسهل الاستخدام.
- يستهلك الـ Backend API فقط (لا اتصال مباشر بقاعدة البيانات).

### 7.2 شاشة الطلبات (Orders)
- قائمة الطلبات مع فلترة حسب الحالة (PENDING_ADMIN_REVIEW كافتراضي/أولوية).
- تفاصيل الطلب: معلومات العميل، الهاتف، العنوان، المنتج، اللون، المقاس، السعر، إثبات التحويل (عرض الصورة/PDF داخل التطبيق)، حالة الطلب الحالية.
- أزرار الإجراء:
  - **قبول الطلب** → يفتح حقل إدخال "رمز التتبع" (+ شركة الشحن اختيارياً) → تأكيد → استدعاء `/orders/{id}/decision`.
  - **رفض الطلب** → تأكيد → استدعاء API مباشرة.
  - **نفذت الكمية** → تأكيد → استدعاء API مباشرة.
- إشعارات Push فورية عند وصول طلب جديد بانتظار المراجعة.

### 7.3 شاشة "النشر على مواقع التواصل"
- إنشاء منشور جديد: رفع صورة/فيديو، اختيار منتج مرتبط (لجلب السعر/المواصفات الحقيقية)، إدخال معلومات تسويقية إضافية (منتج جديد/تنزيلات...).
- زر "توليد الوصف بالذكاء الاصطناعي" → يستدعي `generate-caption` ويعرض النتيجة القابلة للتعديل قبل النشر.
- خيار النشر:
  - **نشر الآن** أو **جدولة** (اختيار تاريخ/وقت).
  - **النشر على جميع المنصات المرتبطة** (Default) أو **اختيار منصة محددة** (Facebook حالياً، وبنية جاهزة لإضافة TikTok/Instagram لاحقاً).

### 7.4 شاشات مساندة
- سجل الطلبات المكتملة/المرفوضة (تتبّع تاريخي).
- إدارة طرق الدفع (تفعيل/تعطيل، تعديل IBAN).
- محادثات تم تصعيدها للبشري (Escalated Conversations) — للرد المباشر من الأدمن عند الحاجة.

---

## 8. التصعيد للبشر (Human Escalation)

يُنفَّذ كقاعدة عامة عبر `Conversation Context API`:
- عند طلب العميل صراحة التحدث مع شخص، أو فشل الـ AI في تصنيف النية (Intent) بثقة كافية، أو حدوث خطأ:
  يستدعي WhatsApp AI Conversation Workflow نقطة `POST /conversations/{id}/escalate`.
- بمجرد أن تصبح `conversation.status = escalated_to_human`:
  - يتوقف البوت عن الرد التلقائي على هذه المحادثة.
  - يصل إشعار فوري للأدمن عبر Admin Notification.
  - الأدمن يتابع المحادثة يدوياً (عبر واجهة مخصصة أو مباشرة WhatsApp حسب ما يوفره التكامل).

---

## 9. الأمان وسلامة العمليات

- **مصادقة**: كل استدعاء Admin App ↔ Backend API عبر JWT/OAuth، وكل webhook وارد (WhatsApp/Facebook) يُتحقق من توقيعه (signature verification).
- **تشفير**: بيانات العملاء (هاتف، عنوان) وتوكنات Facebook تُخزَّن بشكل آمن (encryption at rest / secret manager للتوكنات).
- **التسجيل (Logging)**: كل تغيير حالة طلب، كل إرسال رسالة، كل نشر منشور يُسجَّل مع timestamp ومصدر الإجراء لتتبّع كامل.
- **إعادة المحاولة (Retry)**: عمليات الشبكة الفاشلة (إرسال WhatsApp، Graph API) تُعاد تلقائياً مع backoff، مع الاعتماد على Idempotency لمنع التكرار الناتج عن الإعادة.

---

## 10. قابلية التوسع لاحقاً

- بنية `social_accounts` / `social_posts.target_platforms` مصممة لإضافة Instagram وTikTok دون تعديل جوهري في المخطط — فقط إضافة `platform` جديد وربط API الخاص بها ضمن نفس Workflow "Facebook Publishing" (يُعمَّم لاحقاً إلى "Social Publishing").
- طبقة القنوات (Channel Layer) قابلة لإضافة قنوات بيع جديدة بنفس نمط WhatsApp (webhook → n8n → AI → Backend API).

---

## ملاحظة ختامية

هذه الوثيقة تغطي حصراً المتطلبات المذكورة (WhatsApp + Facebook + n8n + تطبيق الأدمن)، دون إضافة قنوات أو ميزات غير مطلوبة. الخطوة التالية المنطقية بعد اعتماد هذا التصميم: بناء الـ Backend API service فعلياً (schema migration files)، ثم تصميم أول Workflow (WhatsApp Incoming Messages) في n8n كنقطة بداية قابلة للاختبار.


## 10. Security controls added before deployment

- The Backend issues short-lived access JWTs and rotating refresh tokens. Logout records the access-token `jti` in PostgreSQL so it cannot be reused.
- Login, order creation, and inbound comment ingestion have an in-process rate limiter. A shared Redis-backed limiter is required before running multiple API workers.
- The WhatsApp Cloud API and Facebook/Instagram comment POST workflows now begin with an HMAC-SHA256 signature verification node. Configure `META_APP_SECRET` in n8n and keep the webhook's raw request body available; do not treat a re-serialized JSON object as a production-grade raw-body substitute.
- The AI service fails closed when credentials are absent and is instructed to ground commercial claims only in Backend-provided data.
