# Oracle deployment

This Compose project is deliberately separate from the existing n8n container. It creates a private `matjar-net` network and binds Backend and AI Service only to `127.0.0.1`; it does not publish another public HTTP service and does not modify Caddy.

Copy `.env.example` to `.env`, replace every placeholder, and keep the file private. Apply migrations from the host after PostgreSQL is healthy:

```bash
for migration in ../database/migrations/*.sql; do
  docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$migration"
done
```

Because the existing n8n container is on Docker's default `bridge` network, it cannot resolve `backend` or `ai-service` until it is deliberately connected to `matjar-net`. Do not connect it or restart it until the n8n backup is verified and the Caddy routing plan is approved. During the first deployment, use host-local checks (`curl http://127.0.0.1:8000/health` and `curl http://127.0.0.1:8010/health`) before changing any network topology.

The current rate limiter is process-local. Keep the Backend at one worker initially; add Redis before scaling horizontally.
