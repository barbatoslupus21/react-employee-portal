"""Simple project logging setup.

Provides a convenience `setup_logging()` to configure console + rotating
file handlers and `get_logger()` for quick logger access.

Configuration via environment variables:
- LOG_LEVEL: default "INFO"
- LOG_DIR: directory to write log files (defaults to ../logs next to this file)
"""
from __future__ import annotations

import logging
import logging.config
import os
from pathlib import Path
from typing import Optional


def setup_logging(level: Optional[str] = None) -> None:
    """Configure root logger with console and rotating file handlers.

    This function is idempotent and safe to call multiple times.
    """
    level = level or os.environ.get('LOG_LEVEL', 'INFO')

    base_dir = Path(__file__).resolve().parent
    # default log dir: repository/repconnect/logs (one level up from this package)
    log_dir = Path(os.environ.get('LOG_DIR', str(base_dir / '..' / 'logs'))).resolve()
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        # best-effort: if we can't create the dir, continue and rely on console logging
        pass

    file_path = log_dir / 'repconnect.log'

    config = {
        'version': 1,
        'disable_existing_loggers': False,
        'formatters': {
            'default': {
                'format': '%(asctime)s %(levelname)s %(name)s: %(message)s',
            },
        },
        'handlers': {
            'console': {
                'class': 'logging.StreamHandler',
                'formatter': 'default',
                'level': level,
            },
            'file': {
                'class': 'logging.handlers.RotatingFileHandler',
                'formatter': 'default',
                'level': level,
                'filename': str(file_path),
                'maxBytes': 10 * 1024 * 1024,
                'backupCount': 5,
                'encoding': 'utf-8',
            },
        },
        'root': {
            'handlers': ['console', 'file'],
            'level': level,
        },
    }

    logging.config.dictConfig(config)


def get_logger(name: str) -> logging.Logger:
    """Return a configured logger for `name`."""
    return logging.getLogger(name)


__all__ = ['setup_logging', 'get_logger']
