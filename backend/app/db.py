from collections.abc import Generator
from contextlib import contextmanager
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import get_settings


_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=get_settings().database_url,
            kwargs={"row_factory": dict_row},
            min_size=1,
            max_size=5,
            open=False,
        )
        _pool.open(wait=False)
    return _pool


@contextmanager
def connection() -> Generator:
    with get_pool().connection() as conn:
        yield conn


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
