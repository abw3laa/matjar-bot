-- Expo push tokens registered by authenticated admin devices.
CREATE TABLE IF NOT EXISTS admin_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_admin_devices_updated_at ON admin_devices;
CREATE TRIGGER trg_admin_devices_updated_at BEFORE UPDATE ON admin_devices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
