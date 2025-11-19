"""Utility helpers for PostgreSQL connection pooling via psycopg2."""

import os
from contextlib import contextmanager
from typing import Any, Generator

import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse

# Optional: auto-load .env for local dev if python-dotenv is available
try:
    from pathlib import Path
    from dotenv import load_dotenv  # type: ignore

    def _try_load_env() -> None:
        # Search for a .env file starting from CWD and walking up a few levels
        candidates: list[Path] = []
        try:
            here = Path(__file__).resolve()
            # Walk up to repo root (heuristic up to 6 levels)
            for p in [Path.cwd(), *here.parents[:6]]:
                candidates.append(p / ".env")
        except Exception:
            candidates.append(Path.cwd() / ".env")

        for env_path in candidates:
            if env_path.exists():
                load_dotenv(env_path)
                break

    _try_load_env()
except Exception:
    # If python-dotenv is not installed or any error occurs, skip silently
    pass

from .logger import get_logger

logger = get_logger(__name__)

# Connection pool instance
_connection_pool: pool.SimpleConnectionPool | None = None

DEFAULT_MIN_CONN = int(os.environ.get("DB_POOL_MIN", "1"))
DEFAULT_MAX_CONN = int(os.environ.get("DB_POOL_MAX", "5"))
DEFAULT_CONN_TIMEOUT = int(os.environ.get("DB_CONN_TIMEOUT", "5"))


def initialize_pool(
    minconn: int | None = None,
    maxconn: int | None = None,
    database_url: str | None = None,
    connect_timeout: int | None = None,
) -> None:
    """Initialize the PostgreSQL connection pool lazily."""
    global _connection_pool

    if _connection_pool is not None:
        logger.warning("Connection pool already initialized")
        return

    db_url = database_url or os.environ.get("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL environment variable is required")

    min_size = minconn or DEFAULT_MIN_CONN
    max_size = maxconn or DEFAULT_MAX_CONN
    timeout = connect_timeout or DEFAULT_CONN_TIMEOUT

    if min_size > max_size:
        raise ValueError("minconn cannot be larger than maxconn")

    # Normalize Prisma-style URL (strip unsupported `schema` param for psycopg2)
    def _normalize_db_url(url: str) -> tuple[str, str | None]:
        parsed = urlparse(url)
        params = dict(parse_qsl(parsed.query, keep_blank_values=True))
        schema = params.pop("schema", None)
        new_query = urlencode(params, doseq=True)
        normalized = urlunparse(parsed._replace(query=new_query))
        options_val = f"-c search_path={schema}" if schema else None
        return normalized, options_val

    normalized_url, options_val = _normalize_db_url(db_url)

    logger.info(
        "Initializing connection pool",
        minconn=min_size,
        maxconn=max_size,
        timeout=timeout,
    )

    extra_kwargs: dict[str, Any] = {"connect_timeout": timeout}
    sslmode = os.environ.get("DB_SSL_MODE")
    if sslmode:
        extra_kwargs["sslmode"] = sslmode
    if options_val:
        extra_kwargs["options"] = options_val

    _connection_pool = psycopg2.pool.SimpleConnectionPool(
        min_size,
        max_size,
        normalized_url,
        **extra_kwargs,
    )


def close_pool() -> None:
    """
    Close all connections in the pool
    """
    global _connection_pool

    if _connection_pool is not None:
        logger.info("Closing connection pool")
        _connection_pool.closeall()
        _connection_pool = None


def get_pool_status() -> dict[str, int] | None:
    """Return basic metrics about the current pool (or None if uninitialized)."""

    if _connection_pool is None:
        return None

    return {
        "minconn": _connection_pool.minconn,
        "maxconn": _connection_pool.maxconn,
        "used": _connection_pool._used,  # type: ignore[attr-defined]
        "available": len(_connection_pool._pool),  # type: ignore[attr-defined]
    }


@contextmanager
def get_connection() -> Generator[Any, None, None]:
    """
    Get a connection from the pool
    Returns a context manager that automatically returns the connection to the pool
    """
    if _connection_pool is None:
        raise RuntimeError("Connection pool not initialized. Call initialize_pool() first.")

    conn = _connection_pool.getconn()
    try:
        yield conn
    finally:
        _connection_pool.putconn(conn)


@contextmanager
def get_cursor(cursor_factory=RealDictCursor) -> Generator[Any, None, None]:
    """
    Get a cursor from the pool
    Returns a context manager that automatically commits and closes the cursor
    """
    with get_connection() as conn:
        cursor = conn.cursor(cursor_factory=cursor_factory)
        try:
            yield cursor
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()


def execute_query(
    query: str,
    params: tuple | None = None,
    fetch_one: bool = False,
) -> Any:
    """
    Execute a query and return results
    """
    with get_cursor() as cursor:
        cursor.execute(query, params)

        if fetch_one:
            return cursor.fetchone()
        return cursor.fetchall()


def execute_update(
    query: str,
    params: tuple | None = None,
) -> int:
    """
    Execute an UPDATE/INSERT/DELETE query
    Returns the number of affected rows
    """
    with get_cursor() as cursor:
        cursor.execute(query, params)
        return cursor.rowcount


def health_check() -> bool:
    """Run a lightweight health check against the database."""

    try:
        result = execute_query("SELECT 1", fetch_one=True)
        return bool(result)
    except Exception as exc:  # pragma: no cover - used for ops visibility
        logger.error("Database health check failed", error=str(exc))
        return False


__all__ = [
    "initialize_pool",
    "close_pool",
    "get_connection",
    "get_cursor",
    "execute_query",
    "execute_update",
    "health_check",
    "get_pool_status",
]
