-- Durable idempotency records for externally-triggered and state-changing API calls.
CREATE TABLE IF NOT EXISTS api_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (scope, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_api_idempotency_created_at ON api_idempotency(created_at);

-- Retain records long enough to cover n8n retries while allowing maintenance cleanup.
COMMENT ON TABLE api_idempotency IS 'Clean completed records older than the configured retention window during routine maintenance.';
