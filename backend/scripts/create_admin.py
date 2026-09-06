#!/usr/bin/env python3
import getpass
import os

import psycopg
from pwdlib import PasswordHash

email = input("Admin email: ").strip().lower()
password = getpass.getpass("Admin password (min 8 chars): ")
if len(password) < 8:
    raise SystemExit("Password must be at least 8 characters")

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise SystemExit("DATABASE_URL is required")

hashed = PasswordHash.recommended().hash(password)
with psycopg.connect(database_url) as conn:
    conn.execute(
        """INSERT INTO admin_users (email, password_hash)
           VALUES (%s, %s)
           ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = TRUE""",
        (email, hashed),
    )
print(f"Admin user ready: {email}")
