#!/usr/bin/env bash
set -euo pipefail

# This invokes the checked-in bootstrap script, which uses the same Argon2
# password hashing implementation as the API. It prompts without exposing the
# password in shell history or process arguments.
docker compose run --rm backend python scripts/create_admin.py
