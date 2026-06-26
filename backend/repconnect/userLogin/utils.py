"""
userLogin.utils
===============
Shared utility functions for computing and persisting EmployeeSnapshot records.
Used by both management commands and API views.
"""
import datetime
import logging

from django.db import transaction
from django.db.models import Q

logger = logging.getLogger(__name__)


def compute_snapshot_counts(target_date: datetime.date) -> dict:
    """
    Query the current employee dataset and return count metrics as of
    ``target_date``.

    Returns a dict with keys:
        total, regular, probationary, ojt, male, female

    Logic
    -----
    *Total* – all non-privileged employees whose date_hired is null or <=
    target_date, plus those with no workInformation record at all.
    *Gender* – from PersonalInformation.gender ('male' | 'female').
    *Employment type* – from the most-recent workInformation per employee
    whose date_hired <= target_date.  Matched by case-insensitive substring:
    'ojt', 'regular', 'probationary'.
    """
    from django.contrib.auth import get_user_model
    from userProfile.models import PersonalInformation, workInformation

    User = get_user_model()

    # Employees with a recorded hire date on or before target_date
    with_wi = (
        User.objects
        .filter(admin=False, hr=False, accounting=False)
        .filter(
            Q(workinformation__date_hired__isnull=True) |
            Q(workinformation__date_hired__lte=target_date)
        )
        .values_list('pk', flat=True)
        .distinct()
    )

    # Employees who have no workInformation row at all
    without_wi = (
        User.objects
        .filter(admin=False, hr=False, accounting=False,
                workinformation__isnull=True)
        .values_list('pk', flat=True)
    )

    employee_ids: set[int] = set(with_wi) | set(without_wi)
    total = len(employee_ids)

    if not employee_ids:
        return {'total': 0, 'regular': 0, 'probationary': 0, 'ojt': 0, 'male': 0, 'female': 0}

    # ── Gender ────────────────────────────────────────────────────────────────
    gender_rows = PersonalInformation.objects.filter(
        employee_id__in=employee_ids,
    ).values_list('employee_id', 'gender')
    gender_map: dict[int, str] = {eid: g for eid, g in gender_rows}
    male   = sum(1 for g in gender_map.values() if g == 'male')
    female = sum(1 for g in gender_map.values() if g == 'female')

    # ── Employment type (most-recent WI per employee up to target_date) ──────
    # Cross-DB safe: iterate sorted by (employee_id, -created_at); first
    # occurrence per employee is the most recent record.
    # Include records where date_hired is NULL so that OJT/probationary
    # employees who haven't had a formal hire date set are still classified.
    etype_map: dict[int, str] = {}
    seen: set[int] = set()
    for wi in (
        workInformation.objects
        .filter(employee_id__in=employee_ids)
        .filter(
            Q(date_hired__isnull=True) | Q(date_hired__lte=target_date)
        )
        .select_related('employment_type')
        .order_by('employee_id', '-created_at')
    ):
        if wi.employee_id not in seen:
            etype_map[wi.employee_id] = (
                wi.employment_type.name.lower() if wi.employment_type else ''
            )
            seen.add(wi.employee_id)

    def _is_ojt(name: str) -> bool:
        # Matches "OJT", "On Job Training", "On-Job Training", and similar.
        return 'ojt' in name or 'on job training' in name.replace('-', ' ')

    ojt          = sum(1 for v in etype_map.values() if _is_ojt(v))
    regular      = sum(1 for v in etype_map.values() if 'regular'      in v)
    probationary = sum(1 for v in etype_map.values() if 'probationary' in v)

    # Total = only the three core employment-type groups.
    core_total = regular + probationary + ojt

    return {
        'total':        max(0, core_total),
        'regular':      max(0, regular),
        'probationary': max(0, probationary),
        'ojt':          max(0, ojt),
        'male':         max(0, male),
        'female':       max(0, female),
    }


def take_snapshot(target_date: datetime.date):
    """
    Compute and persist an EmployeeSnapshot for ``target_date``.

    Returns ``(snapshot_instance, created)`` — same contract as
    ``update_or_create``.  The DB write is wrapped in an atomic block.
    """
    from .models import EmployeeSnapshot

    counts = compute_snapshot_counts(target_date)
    with transaction.atomic():
        snap, created = EmployeeSnapshot.objects.update_or_create(
            snapshot_date=target_date,
            defaults=counts,
        )
    return snap, created
