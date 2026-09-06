# API Contract Audit

## Summary

The OpenAPI contract contains **35 operations** across the documented business paths. The FastAPI implementation now exposes **38 operations**, including all **35 documented operations** plus three operational endpoints: `/health`, `/ready`, and `/auth/login`.

Path parameters were compared independently of naming style (`{productId}` versus `{product_id}`). The contract audit now reports **zero missing documented operations**.

## Newly implemented operations

| Method | Path | Implementation status |
|---|---|---|
| PATCH | `/scheduled-posts/{id}` | Persists `executed`/`failed`, sets `executed_at`, and synchronizes the social post status. |
| POST | `/admin/devices` | Persists Expo push tokens per authenticated admin device. |
| POST | `/admin/notifications` | Sends notifications through Expo Push API when active devices exist. |
| POST | `/facebook-comments` | Idempotently upserts inbound Facebook/Instagram comments. |
| POST | `/facebook-comments/{id}/reply` | Idempotency-aware guard; returns `501` until the Meta Graph adapter is configured. |
| POST | `/messenger/send-whatsapp-redirect` | Idempotency-aware guard; returns `501` until Messenger/WhatsApp credentials and adapter are configured. |
| POST | `/social-posts/{id}/publish` | Returns `501` until a platform adapter and credentials are configured; never reports a false publish success. |

## Important integration limits

The routes now exist and validate their inputs, but three operations intentionally do not claim external success without credentials:

- Social publishing requires platform-specific Facebook/Instagram/TikTok adapters and credentials.
- Public comment replies require Meta Graph API credentials and signature-safe integration.
- Messenger-to-WhatsApp redirects require the relevant Meta and WhatsApp configuration.

These are explicit `501 Not Implemented` integration boundaries rather than silent mocks.

## Additional changes

- Added `database/migrations/003_admin_devices.sql` for Expo device tokens.
- Added `EXPO_ACCESS_TOKEN` and `SOCIAL_PUBLISH_ENABLED` to the backend environment example.
- Updated backend setup documentation with the new migration.

## Verification

- Python compilation: passed.
- API contract audit: **35 documented operations, 0 missing**.
- n8n workflow JSON parsing: passed in the previous audit.
- `git diff --check`: passed.

## Remaining production hardening

Route coverage is not the same as production readiness. Database integration tests, durable idempotency response storage, webhook signature verification, rate limiting, token refresh/revocation, object storage presigning, and the external platform adapters still need to be completed before handling real customer or payment data.
