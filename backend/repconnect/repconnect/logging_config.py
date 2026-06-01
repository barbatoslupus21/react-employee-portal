"""Structured JSON logging setup (Finding #18).

Outputs every log record as a single-line JSON object so that log
aggregators (Graylog, Loki, Splunk, Elasticsearch) can parse and
index fields without brittle regex.

Configuration via environment variables:
- LOG_LEVEL: default "INFO"
- LOG_DIR:   directory to write log files (defaults to ../logs next to this file)
"""
from __future__ import annotations

import logging
import logging.config
import os
from pathlib import Path
from typing import Optional


def setup_logging(level: Optional[str] = None) -> None:
    """Configure root logger with JSON console and rotating file handlers."""
    level = level or os.environ.get('LOG_LEVEL', 'INFO')

    base_dir = Path(__file__).resolve().parent
    log_dir = Path(os.environ.get('LOG_DIR', str(base_dir / '..' / 'logs'))).resolve()
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    file_path = log_dir / 'repconnect.log'

    config = {
        'version': 1,
        'disable_existing_loggers': False,
        'formatters': {
            'json': {
                '()': 'pythonjsonlogger.jsonlogger.JsonFormatter',
                'format': '%(asctime)s %(levelname)s %(name)s %(message)s',
            },
        },
        'handlers': {
            'console': {
                'class': 'logging.StreamHandler',
                'formatter': 'json',
                'level': level,
            },
            'file': {
                'class': 'logging.handlers.RotatingFileHandler',
                'formatter': 'json',
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
    return logging.getLogger(name)


__all__ = ['setup_logging', 'get_logger']
