"""
Structured Logger using structlog
Supports correlation IDs, log levels, and JSON output
"""

import logging
import sys
from typing import Any

import structlog

# Determine if in development mode
is_development = sys.stderr.isatty()


def setup_logging(level: str = "INFO") -> None:
    """
    Setup structlog with appropriate processors and renderers
    """
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, level.upper()),
    )

    # Shared processors
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if is_development:
        # Development: colorized console output
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True)
        ]
    else:
        # Production: JSON output
        processors = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ]

    # Configure structlog
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    """
    Get a logger instance with the given name
    """
    return structlog.get_logger(name)


def with_correlation_id(correlation_id: str) -> structlog.stdlib.BoundLogger:
    """
    Get a logger with correlation ID bound to context
    """
    return structlog.get_logger().bind(correlation_id=correlation_id)


def log_with_context(
    level: str,
    message: str,
    **context: Any,
) -> None:
    """
    Log a message with additional context
    """
    logger = structlog.get_logger()
    log_method = getattr(logger, level.lower())
    log_method(message, **context)


# Convenience functions
def log_info(message: str, **context: Any) -> None:
    """Log info level message"""
    log_with_context("info", message, **context)


def log_warn(message: str, **context: Any) -> None:
    """Log warning level message"""
    log_with_context("warning", message, **context)


def log_error(message: str, exc_info: bool = False, **context: Any) -> None:
    """Log error level message"""
    logger = structlog.get_logger()
    logger.error(message, exc_info=exc_info, **context)


def log_debug(message: str, **context: Any) -> None:
    """Log debug level message"""
    log_with_context("debug", message, **context)


# Initialize logging on module import
setup_logging()
