"""Management command: create_evaluation_period

Creates a single EvaluationPeriod for the current or specified fiscal year.
Idempotent — skips creation if a period for that fiscal year already exists.

Fiscal year: May 1 (start_year) → April 30 (start_year + 1)
Title format: "Performance Evaluation FY{year}-{year+1}"

Usage:
    python manage.py create_evaluation_period
    python manage.py create_evaluation_period --fiscal-year 2025
    python manage.py create_evaluation_period --dry-run

Scheduling (cron example — runs every May 1 at 00:05):
    5 0 1 5 * python manage.py create_evaluation_period
"""
from __future__ import annotations

from datetime import date

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Create a single EvaluationPeriod for the current fiscal year (idempotent).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fiscal-year',
            type=int,
            default=None,
            help='Starting year of the fiscal year (e.g. 2025 for FY 2025/2026). Defaults to current fiscal year.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Print what would be created without writing to the database.',
        )

    def handle(self, *args, **options):
        from employee_evaluation.models import EvaluationSettings, EvaluationPeriod

        # ── Get settings ──────────────────────────────────────────────────────
        try:
            settings_obj = EvaluationSettings.objects.get()
        except EvaluationSettings.DoesNotExist:
            raise CommandError(
                'No EvaluationSettings record found. '
                'Please create one in the Django admin before running this command.'
            )

        frequency = settings_obj.frequency

        # ── Determine fiscal year ─────────────────────────────────────────────
        today = date.today()
        if options['fiscal_year']:
            fy_start = options['fiscal_year']
        else:
            # Fiscal year starts May 1; if today is before May 1 we're in the prior FY.
            fy_start = today.year if today.month >= 5 else today.year - 1

        fy_end = fy_start + 1
        title = f'Performance Evaluation FY{fy_start}-{fy_end}'
        start_date = date(fy_start, 5, 1)
        end_date = date(fy_end, 4, 30)

        if options['dry_run']:
            exists = EvaluationPeriod.objects.filter(fiscal_year=fy_start).exists()
            if exists:
                self.stdout.write(self.style.WARNING(
                    f'DRY RUN — period for FY {fy_start}/{fy_end} already exists. Would skip.'
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    f'DRY RUN — would create: "{title}" ({start_date} → {end_date})'
                ))
            return

        # ── Idempotent create ─────────────────────────────────────────────────
        period, created = EvaluationPeriod.objects.get_or_create(
            fiscal_year=fy_start,
            defaults={
                'title':      title,
                'start_date': start_date,
                'end_date':   end_date,
                'status':     'active',
                'frequency':  frequency,
            },
        )
        if created:
            self.stdout.write(self.style.SUCCESS(
                f'Created: "{period.title}" ({start_date} → {end_date})'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'Skipped — period for FY {fy_start}/{fy_end} already exists: "{period.title}"'
            ))


