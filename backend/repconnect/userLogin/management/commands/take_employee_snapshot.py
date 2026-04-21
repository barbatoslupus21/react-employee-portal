"""
take_employee_snapshot
======================
Management command that computes and stores a daily Employee Snapshot.

Usage
-----
# Snapshot for today (idempotent – safe to run more than once)
python manage.py take_employee_snapshot

# Snapshot for a specific date
python manage.py take_employee_snapshot --date 2026-04-01

# Backfill missing snapshots for the last N days (default: 90)
python manage.py take_employee_snapshot --backfill
python manage.py take_employee_snapshot --backfill --days 365

Behaviour
---------
* Uses `update_or_create` so re-running for the same date is safe.
* Computes counts based on the current employee state for today, or for
  a past date it uses the employees who have a `date_hired` <= that date
  (best approximation when historical data is available).  When no
  `date_hired` exists for an employee the employee is always included in
  the ``total`` count (conservative approach).
* All subgroup counts are clamped to 0 to prevent negative values.
"""
import datetime
import logging

from django.core.management.base import BaseCommand

from userLogin.utils import compute_snapshot_counts, take_snapshot  # noqa: F401 – re-exported

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        'Compute and store a daily EmployeeSnapshot. '
        'Pass --backfill to populate missing past records.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--date',
            type=lambda s: datetime.date.fromisoformat(s),
            default=None,
            help='Target date (YYYY-MM-DD).  Defaults to today.',
        )
        parser.add_argument(
            '--backfill',
            action='store_true',
            default=False,
            help='Fill every missing date from --days ago up to yesterday.',
        )
        parser.add_argument(
            '--days',
            type=int,
            default=90,
            help='How many past days to consider when --backfill is set (default: 90).',
        )

    def handle(self, *args, **options):
        today      = datetime.date.today()
        backfill   = options['backfill']
        days       = options['days']
        target     = options['date']

        if backfill:
            from userLogin.models import EmployeeSnapshot
            start = today - datetime.timedelta(days=days)
            existing = set(
                EmployeeSnapshot.objects
                .filter(snapshot_date__gte=start, snapshot_date__lt=today)
                .values_list('snapshot_date', flat=True)
            )
            missing = [
                start + datetime.timedelta(days=i)
                for i in range((today - start).days)
                if (start + datetime.timedelta(days=i)) not in existing
            ]
            if not missing:
                self.stdout.write(self.style.SUCCESS('No missing snapshots to backfill.'))
                return
            self.stdout.write(f'Backfilling {len(missing)} missing snapshot(s)…')
            created_count = 0
            for d in missing:
                try:
                    _, created = take_snapshot(d)
                    if created:
                        created_count += 1
                except Exception as exc:
                    logger.error('Snapshot backfill failed for %s: %s', d, exc)
                    self.stderr.write(self.style.ERROR(f'  FAILED {d}: {exc}'))
            self.stdout.write(self.style.SUCCESS(
                f'Backfill complete. Created {created_count} new snapshot(s).'
            ))
        else:
            if target is None:
                target = today
            try:
                snap, created = take_snapshot(target)
                verb = 'Created' if created else 'Updated'
                self.stdout.write(self.style.SUCCESS(
                    f'{verb} snapshot for {target}: total={snap.total}, '
                    f'regular={snap.regular}, probationary={snap.probationary}, '
                    f'ojt={snap.ojt}, male={snap.male}, female={snap.female}'
                ))
            except Exception as exc:
                logger.error('Snapshot command failed for %s: %s', target, exc)
                self.stderr.write(self.style.ERROR(f'Snapshot failed: {exc}'))
                raise SystemExit(1)
