-- =====================================================================
-- 001_init_schema.sql
-- منصة الأتمتة والمبيعات متعددة القنوات (WhatsApp + Facebook)
-- Initial database schema — PostgreSQL
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------

CREATE TYPE order_status AS ENUM (
    'NEW',
    'PRODUCT_SELECTED',
    'WAITING_FOR_CUSTOMER_DATA',
    'WAITING_FOR_PAYMENT',
    'WAITING_FOR_PAYMENT_PROOF',
    'PENDING_ADMIN_REVIEW',
    'APPROVED',
    'REJECTED',
    'OUT_OF_STOCK',
    'SHIPPED'
);

CREATE TYPE channel_type AS ENUM ('whatsapp', 'messenger');

CREATE TYPE conversation_status AS ENUM ('active', 'escalated_to_human', 'closed');

CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

CREATE TYPE message_sender AS ENUM ('customer', 'bot', 'admin');

CREATE TYPE message_type AS ENUM ('text', 'image', 'document');

CREATE TYPE payment_method_type AS ENUM ('bank_transfer', 'cash_on_delivery');

CREATE TYPE proof_file_type AS ENUM ('pdf', 'image');

CREATE TYPE social_platform AS ENUM ('facebook', 'instagram', 'tiktok');

CREATE TYPE social_post_status AS ENUM ('draft', 'scheduled', 'published', 'failed');

CREATE TYPE scheduled_post_status AS ENUM ('pending', 'executed', 'failed');

CREATE TYPE messenger_conv_status AS ENUM ('sent', 'customer_replied');

CREATE TYPE changed_by_type AS ENUM ('system', 'bot', 'admin');

-- ---------------------------------------------------------------------
-- 2.1 PRODUCTS & CATALOG
-- ---------------------------------------------------------------------

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT,
    base_price      NUMERIC(12,2),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku             TEXT NOT NULL UNIQUE,
    color           TEXT,
    size            TEXT,
    price           NUMERIC(12,2) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_variants_product_id ON product_variants(product_id);

CREATE TABLE inventory (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id          UUID NOT NULL UNIQUE REFERENCES product_variants(id) ON DELETE CASCADE,
    quantity_available  INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
    reserved_quantity   INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2.2 CUSTOMERS & CONVERSATIONS
-- ---------------------------------------------------------------------

CREATE TABLE customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name   TEXT,
    phone       TEXT UNIQUE,
    address     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_channel_identities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel             channel_type NOT NULL,
    channel_user_id     TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel, channel_user_id)
);
CREATE INDEX idx_cci_customer_id ON customer_channel_identities(customer_id);

CREATE TABLE conversations (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_channel_identity_id    UUID NOT NULL REFERENCES customer_channel_identities(id) ON DELETE CASCADE,
    channel                         channel_type NOT NULL,
    status                          conversation_status NOT NULL DEFAULT 'active',
    current_context                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_identity ON conversations(customer_channel_identity_id);
CREATE INDEX idx_conversations_status ON conversations(status);

CREATE TABLE messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction           message_direction NOT NULL,
    sender              message_sender NOT NULL,
    content             TEXT,
    message_type        message_type NOT NULL DEFAULT 'text',
    media_url           TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ---------------------------------------------------------------------
-- 2.4 PAYMENTS (يُعرَّف قبل orders لوجود FK)
-- ---------------------------------------------------------------------

CREATE TABLE payment_methods (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        payment_method_type NOT NULL,
    is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    details     JSONB NOT NULL DEFAULT '{}'::jsonb, -- مثال: {"iban": "..."}
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2.3 ORDERS
-- ---------------------------------------------------------------------

CREATE TABLE orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number        TEXT NOT NULL UNIQUE,
    customer_id         UUID NOT NULL REFERENCES customers(id),
    conversation_id     UUID REFERENCES conversations(id),
    status              order_status NOT NULL DEFAULT 'NEW',
    payment_method_id   UUID REFERENCES payment_methods(id),
    total_amount        NUMERIC(12,2),
    shipping_address    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_conversation_id ON orders(conversation_id);

CREATE TABLE order_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id  UUID NOT NULL REFERENCES product_variants(id),
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(12,2) NOT NULL
);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);

CREATE TABLE order_status_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status order_status,
    to_status   order_status NOT NULL,
    changed_by  changed_by_type NOT NULL,
    changed_by_id UUID, -- admin id عند changed_by = admin
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_osh_order_id ON order_status_history(order_id);

CREATE TABLE tracking_numbers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    tracking_number     TEXT NOT NULL,
    carrier             TEXT,
    entered_by_admin_id UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_proofs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    file_url                TEXT NOT NULL,
    file_type               proof_file_type NOT NULL,
    file_hash               TEXT, -- لدعم idempotency عند إعادة رفع نفس الملف
    ai_verification_result  JSONB,
    reviewed_by_admin_id    UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_proofs_order_id ON payment_proofs(order_id);
CREATE UNIQUE INDEX uq_payment_proofs_order_hash ON payment_proofs(order_id, file_hash) WHERE file_hash IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2.5 SOCIAL / FACEBOOK
-- ---------------------------------------------------------------------

CREATE TABLE social_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform            social_platform NOT NULL,
    page_id             TEXT NOT NULL,
    access_token_ref    TEXT NOT NULL, -- مرجع إلى Secret Manager، وليس التوكن نفسه
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (platform, page_id)
);

CREATE TABLE social_posts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id              UUID REFERENCES products(id),
    created_by_admin_id     UUID,
    media_urls              JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_generated_caption    TEXT,
    final_caption           TEXT,
    target_platforms        JSONB NOT NULL DEFAULT '["facebook"]'::jsonb,
    status                  social_post_status NOT NULL DEFAULT 'draft',
    published_post_id       TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_social_posts_status ON social_posts(status);

CREATE TABLE scheduled_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    social_post_id  UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    status          scheduled_post_status NOT NULL DEFAULT 'pending',
    executed_at     TIMESTAMPTZ
);
CREATE INDEX idx_scheduled_posts_due ON scheduled_posts(status, scheduled_at);

CREATE TABLE facebook_comments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facebook_comment_id     TEXT NOT NULL UNIQUE,
    platform                social_platform NOT NULL DEFAULT 'facebook',
    social_post_id          UUID REFERENCES social_posts(id),
    commenter_facebook_id   TEXT NOT NULL,
    comment_text            TEXT,
    replied                 BOOLEAN NOT NULL DEFAULT FALSE,
    messenger_sent          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fb_comments_post_id ON facebook_comments(social_post_id);
CREATE INDEX idx_fb_comments_commenter ON facebook_comments(commenter_facebook_id);

CREATE TABLE messenger_conversations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commenter_facebook_id   TEXT NOT NULL,
    facebook_comment_id     UUID REFERENCES facebook_comments(id),
    status                  messenger_conv_status NOT NULL DEFAULT 'sent',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messenger_conv_commenter ON messenger_conversations(commenter_facebook_id);

-- ---------------------------------------------------------------------
-- 2.6 AUTOMATION STATE / IDEMPOTENCY
-- ---------------------------------------------------------------------

CREATE TABLE automation_state (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     TEXT NOT NULL,   -- 'facebook_comment_reply' | 'messenger_dm' | 'order_decision' | ...
    entity_key      TEXT NOT NULL,   -- مفتاح فريد للحدث (مثال: commenter_facebook_id + ':' + post_id)
    status          TEXT NOT NULL DEFAULT 'processed',
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_type, entity_key)
);
CREATE INDEX idx_automation_state_lookup ON automation_state(entity_type, entity_key);

-- =====================================================================
-- TRIGGERS: تحديث updated_at تلقائياً
-- =====================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_variants_updated_at BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_social_posts_updated_at BEFORE UPDATE ON social_posts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- END OF 001_init_schema.sql
-- =====================================================================
