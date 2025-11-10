"""
PostgreSQL Connection Pool
Provides database connectivity for Python workers
"""

import os
from contextlib import contextmanager
from typing import Any, Generator

import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

from .logger import get_logger

logger = get_logger(__name__)

# Connection pool instance
_connection_pool: pool.SimpleConnectionPool | None = None


def initialize_pool(
    minconn: int = 1,
    maxconn: int = 10,
    database_url: str | None = None,
) -> None:
    """
    Initialize the PostgreSQL connection pool
    """
    global _connection_pool

    if _connection_pool is not None:
        logger.warning("Connection pool already initialized")
        return

    db_url = database_url or os.environ.get("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL environment variable is required")

    logger.info(
        "Initializing connection pool",
        minconn=minconn,
        maxconn=maxconn,
    )

    _connection_pool = psycopg2.pool.SimpleConnectionPool(
        minconn,
        maxconn,
        db_url,
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
