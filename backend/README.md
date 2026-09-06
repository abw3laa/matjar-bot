# Matjar Bot Backend

FastAPI service implementing the database-backed contract in [`../api/openapi.yaml`](../api/openapi.yaml). It is designed to be the only application layer between PostgreSQL, n8n, and the admin app.

## Local setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

The health endpoint is available at `http://localhost:8000/health`; the API contract is exposed at `/docs`.

## Database setup

Apply migrations in order:

```bash
psql "$DATABASE_URL" -f ../database/migrations/001_init_schema.sql
psql "$DATABASE_URL" -f ../database/migrations/002_admin_users.sql
```

Create the first admin without putting a password in the shell history:

```bash
DATABASE_URL="$DATABASE_URL" python scripts/create_admin.py
```

## Configuration

Copy `.env.example` to `.env` and set a long random `JWT_SECRET`, a separate `INTERNAL_API_TOKEN`, and the PostgreSQL URL. Do not commit `.env` or production credentials.

## Current scope

The first implementation covers health/readiness, authentication, catalog, conversation/context/message flows, orders and decisions, payment methods, upload configuration guard, social post drafts/captions/scheduling, and due scheduled posts. Social publishing, object storage presigning, and AI generation remain explicit integration points and return a clear `501` until their credentials/services are configured; they are not silently mocked.
