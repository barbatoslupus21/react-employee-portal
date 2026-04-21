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
    etype_map: dict[int, str] = {}
    seen: set[int] = set()
    for wi in (
        workInformation.objects
        .filter(
            employee_id__in=employee_ids,
            date_hired__lte=target_date,
        )
        .select_related('employment_type')
        .order_by('employee_id', '-created_at')
    ):
        if wi.employee_id not in seen:
            etype_map[wi.employee_id] = (
                wi.employment_type.name.lower() if wi.employment_type else ''
            )
            seen.add(wi.employee_id)

    ojt          = sum(1 for v in etype_map.values() if 'ojt'          in v)
    regular      = sum(1 for v in etype_map.values() if 'regular'      in v)
    probationary = sum(1 for v in etype_map.values() if 'probationary' in v)

    return {
        'total':        max(0, total),
        'regular':      max(0, min(regular,      total)),
        'probationary': max(0, min(probationary, total)),
        'ojt':          max(0, min(ojt,          total)),
        'male':         max(0, min(male,         total)),
        'female':       max(0, min(female,       total)),
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
