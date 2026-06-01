"""Management command to delete old LoginAttempt records.

Run daily via cron or scheduled task to prevent unbounded table growth.
Defaults to purging records older than 30 days.

Usage:
    python manage.py purge_login_attempts
    python manage.py purge_login_attempts --days 60
"""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = 'Delete LoginAttempt records older than N days (default 30).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Retain records newer than this many days (default: 30).',
        )

    def handle(self, *args, **options):
        from userLogin.models import LoginAttempt

        days = options['days']
        cutoff = timezone.now() - timedelta(days=days)
        deleted, _ = LoginAttempt.objects.filter(created_at__lt=cutoff).delete()
        self.stdout.write(
            self.style.SUCCESS(
                f'Purged {deleted} LoginAttempt records older than {days} days.'
            )
        )
