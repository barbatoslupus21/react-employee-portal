"""
Admin Dashboard Views — /api/user-profile/admin-overview
                         /api/user-profile/system-errors

Access guard: request.user.admin must be True.

Sections returned by admin-overview
-------------------------------------
  stats          — six stat card values + 4-week sparklines
  login_chart    — failed vs successful logins per month (fiscal year)
  lock_chart     — lock events per month (fiscal year) from locked_at
  user_pie       — active vs inactive user counts
  password_chart — changed_password vs default_password vs locked per month
  admin_users    — list of users with admin=True
  recent_errors  — 10 most recent unresolved SystemErrorLog entries
"""

from __future__ import annotations

import calendar
import datetime
import re

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from activityLog.models import ActivityLog, SystemErrorLog
from userLogin.models import LoginAttempt, loginCredentials


# ── Role guard helper ─────────────────────────────────────────────────────────

def _require_admin(request) -> Response | None:
    """Return 403 Response unless the authenticated user has admin=True."""
    if not getattr(request.user, 'admin', False):
        return Response(
            {'detail': 'Admin permission required.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


# ── Fiscal year helper ────────────────────────────────────────────────────────

def _fiscal_year_range(today: datetime.date) -> tuple[datetime.date, datetime.date, list[str]]:
    """Return (fy_start, fy_end, month_labels) for the fiscal year containing today.

    The fiscal year runs May 1 → April 30.
    Labels are short month abbreviations: ['May', 'Jun', ..., 'Apr'].
    """
    if today.month >= 5:
        fy_start = today.replace(year=today.year, month=5, day=1)
        fy_end   = today.replace(year=today.year + 1, month=4, day=30)
    else:
        fy_start = today.replace(year=today.year - 1, month=5, day=1)
        fy_end   = today.replace(year=today.year, month=4, day=30)

    labels: list[str] = []
    month_keys: list[tuple[int, int]] = []  # (year, month)
    m, y = fy_start.month, fy_start.year
    for _ in range(12):
        labels.append(calendar.month_abbr[m])
        month_keys.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1

    return fy_start, fy_end, labels, month_keys  # type: ignore[return-value]


# ── Week-of-month helper ──────────────────────────────────────────────────────

def _week_of_month(d: datetime.date) -> int:
    """Return 0-based week index (0–3) for a date within its month."""
    return min((d.day - 1) // 7, 3)


# ── Admin Overview ─────────────────────────────────────────────────────────────

class AdminOverviewView(APIView):
    """
    GET /api/user-profile/admin-overview

    Aggregated security and user management dashboard for admin users.
    Returns 403 if request.user.admin is not True.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        guard = _require_admin(request)
        if guard is not None:
            return guard

        today = timezone.localdate()
        now   = timezone.now()
        tz_obj = timezone.get_current_timezone()

        # ── Month boundaries ──────────────────────────────────────────────────
        month_start  = today.replace(day=1)
        prev_month_end = month_start - datetime.timedelta(days=1)
        prev_month_start = prev_month_end.replace(day=1)

        # ── All users (excluding superusers) ───────────────────────────────────
        all_users = loginCredentials.objects.filter(is_superuser=False)

        # ── Stat card values ──────────────────────────────────────────────────
        # 1. Failed Logins this month
        failed_this_month = LoginAttempt.objects.filter(
            was_successful=False,
            created_at__date__gte=month_start,
        ).count()

        # 2. Locked Accounts currently
        locked_count = all_users.filter(locked=True).count()

        # 3. Active Users
        active_count = all_users.filter(active=True, locked=False).count()

        # 4. Inactive Users (active=False)
        inactive_count = all_users.filter(active=False).count()

        # 5. Password Changes this month — use ActivityLog as proxy
        #    (ActivityLogMiddleware records every POST /api/user-profile/change-password)
        from activityLog.models import ActivityLog
        pwd_changes_month = ActivityLog.objects.filter(
            endpoint__icontains='change-password',
            http_method='POST',
            timestamp__date__gte=month_start,
        ).count()

        # 6. Default Password Users (change_password=True means forced to change)
        default_pwd_count = all_users.filter(change_password=True, active=True).count()

        # ── Weekly sparklines for current month ───────────────────────────────
        weeks = ['W1', 'W2', 'W3', 'W4']
        failed_weeks  = [0, 0, 0, 0]
        lock_weeks    = [0, 0, 0, 0]
        active_weeks  = [0, 0, 0, 0]
        inactive_weeks = [0, 0, 0, 0]
        pwd_change_weeks = [0, 0, 0, 0]
        default_pwd_weeks = [0, 0, 0, 0]

        # Failed logins per week this month
        for attempt in LoginAttempt.objects.filter(
            was_successful=False,
            created_at__date__gte=month_start,
            created_at__date__lte=today,
        ).values_list('created_at', flat=True):
            local_dt = attempt.astimezone(tz_obj)
            if local_dt.date().month == today.month:
                w = _week_of_month(local_dt.date())
                failed_weeks[w] += 1

        # Lock events per week this month (from ActivityLog lock/lockout actions)
        lock_activity_month = ActivityLog.objects.filter(
            timestamp__date__gte=month_start,
            timestamp__date__lte=today,
        ).filter(
            Q(action__icontains='lock') |
            Q(action__icontains='lockout') |
            Q(endpoint__icontains='lock')
        )
        for ts in lock_activity_month.values_list('timestamp', flat=True):
            local_dt = ts.astimezone(tz_obj)
            if local_dt.date().month == today.month:
                w = _week_of_month(local_dt.date())
                lock_weeks[w] += 1

        # Active/Inactive: distribute snapshot counts by week (use current count for all weeks)
        # For trend accuracy: use EmployeeSnapshot if available, else flat current values
        from userLogin.models import EmployeeSnapshot
        snapshots = {
            s.snapshot_date: s
            for s in EmployeeSnapshot.objects.filter(
                snapshot_date__gte=month_start,
                snapshot_date__lte=today,
            )
        }
        for day_offset in range((today - month_start).days + 1):
            d = month_start + datetime.timedelta(days=day_offset)
            w = _week_of_month(d)
            if d in snapshots:
                active_weeks[w]   = max(active_weeks[w],   snapshots[d].total)
                inactive_weeks[w] = max(inactive_weeks[w], max(0, all_users.count() - snapshots[d].total))
            else:
                active_weeks[w]   = max(active_weeks[w],   active_count)
                inactive_weeks[w] = max(inactive_weeks[w], inactive_count)

        # Password change trend per week
        for ts in ActivityLog.objects.filter(
            endpoint__icontains='change-password',
            http_method='POST',
            timestamp__date__gte=month_start,
            timestamp__date__lte=today,
        ).values_list('timestamp', flat=True):
            local_dt = ts.astimezone(tz_obj)
            if local_dt.date().month == today.month:
                w = _week_of_month(local_dt.date())
                pwd_change_weeks[w] += 1

        # Default pwd count per week — static (use current count across all weeks)
        for w in range(4):
            default_pwd_weeks[w] = default_pwd_count

        # ── Fiscal year login chart ────────────────────────────────────────────
        fy_start, fy_end, fy_labels, fy_month_keys = _fiscal_year_range(today)  # type: ignore[misc]

        failed_by_month  = [0] * 12
        success_by_month = [0] * 12
        lock_by_month    = [0] * 12

        attempts_fy = LoginAttempt.objects.filter(
            created_at__date__gte=fy_start,
            created_at__date__lte=today,
        ).values('was_successful', 'created_at__year', 'created_at__month').annotate(n=Count('id'))

        fy_month_index = {(y, m): i for i, (y, m) in enumerate(fy_month_keys)}
        for row in attempts_fy:
            key = (row['created_at__year'], row['created_at__month'])
            idx = fy_month_index.get(key)
            if idx is None:
                continue
            if row['was_successful']:
                success_by_month[idx] += row['n']
            else:
                failed_by_month[idx]  += row['n']

        # Lock events per month (from ActivityLog lock/lockout actions)
        lock_activity_fy = ActivityLog.objects.filter(
            timestamp__date__gte=fy_start,
            timestamp__date__lte=today,
        ).filter(
            Q(action__icontains='lock') |
            Q(action__icontains='lockout') |
            Q(endpoint__icontains='lock')
        )
        for ts in lock_activity_fy.values_list('timestamp', flat=True):
            local_dt = ts.astimezone(tz_obj)
            key = (local_dt.year, local_dt.month)
            idx = fy_month_index.get(key)
            if idx is not None:
                lock_by_month[idx] += 1

        # ── Password security chart (per month, fiscal year) ──────────────────
        pwd_changed_by_month = [0] * 12
        for ts in ActivityLog.objects.filter(
            endpoint__icontains='change-password',
            http_method='POST',
            timestamp__date__gte=fy_start,
            timestamp__date__lte=today,
        ).values_list('timestamp', flat=True):
            local_dt = ts.astimezone(tz_obj)
            key = (local_dt.year, local_dt.month)
            idx = fy_month_index.get(key)
            if idx is not None:
                pwd_changed_by_month[idx] += 1

        # Default pwd shown as current snapshot; locked series sourced from ActivityLog lock events
        pwd_default_by_month = [0] * 12
        curr_key = (today.year, today.month)
        curr_idx = fy_month_index.get(curr_key)
        if curr_idx is not None:
            pwd_default_by_month[curr_idx] = default_pwd_count

        # ── User pie ──────────────────────────────────────────────────────────
        user_pie = {
            'active':   active_count,
            'inactive': inactive_count,
            'locked':   locked_count,
        }

        # ── Admin user list ───────────────────────────────────────────────────
        admin_users_qs = loginCredentials.objects.filter(
            is_superuser=False,
        ).filter(
            Q(admin=True)
            | Q(hr=True)
            | Q(accounting=True)
            | Q(mis=True)
            | Q(clinic=True)
            | Q(iad=True)
            | Q(hr_manager=True)
        ).select_related().order_by('lastname', 'firstname')

        admin_user_list = []
        for u in admin_users_qs:
            avatar_url = None
            if u.avatar:
                avatar_url = f'/media/{u.avatar}'
            # Get department via workInformation
            work = u.work_information.order_by('-created_at').first() if hasattr(u, 'work_information') else None
            dept = work.department.name if work and work.department else None
            admin_user_list.append({
                'id':         u.pk,
                'idnumber':   u.idnumber,
                'full_name':  f'{u.firstname or ""} {u.lastname or ""}'.strip(),
                'department': dept,
                'avatar':     avatar_url,
                'last_login': u.last_login.isoformat() if u.last_login else None,
                'locked':     u.locked,
                'active':     u.active,
                'roles': [
                    role for role, enabled in [
                        ('Admin', u.admin),
                        ('HR', u.hr),
                        ('Accounting', u.accounting),
                        ('MIS', u.mis),
                        ('Clinic', u.clinic),
                        ('IAD', u.iad),
                        ('HR Manager', u.hr_manager),
                    ] if enabled
                ],
            })

        # ── Recent unresolved system errors ────────────────────────────────────
        recent_errors = []
        for err in SystemErrorLog.objects.filter(resolved=False).order_by('-timestamp')[:10]:
            triggered_by = None
            if err.user:
                triggered_by = {
                    'id':       err.user.pk,
                    'idnumber': err.user.idnumber,
                    'name':     f'{err.user.firstname or ""} {err.user.lastname or ""}'.strip(),
                }
            recent_errors.append({
                'id':          err.pk,
                'timestamp':   err.timestamp.isoformat(),
                'error_type':  err.error_type,
                'module':      err.module,
                'message':     err.message,
                'resolved':    err.resolved,
                'triggered_by': triggered_by,
            })

        return Response({
            'stats': {
                'failed_logins':      {'current': failed_this_month},
                'locked_accounts':    {'current': locked_count},
                'active_users':       {'current': active_count},
                'inactive_users':     {'current': inactive_count},
                'password_changes':   {'current': pwd_changes_month},
                'default_pwd_users':  {'current': default_pwd_count},
                'trends': {
                    'weeks':            weeks,
                    'failed_logins':    failed_weeks,
                    'locked_accounts':  lock_weeks,
                    'active_users':     active_weeks,
                    'inactive_users':   inactive_weeks,
                    'password_changes': pwd_change_weeks,
                    'default_pwd_users': default_pwd_weeks,
                },
            },
            'login_chart': {
                'months':    fy_labels,
                'failed':    failed_by_month,
                'successful': success_by_month,
            },
            'lock_chart': {
                'months': fy_labels,
                'locked': lock_by_month,
            },
            'password_chart': {
                'months':          fy_labels,
                'changed_password': pwd_changed_by_month,
                'default_password': pwd_default_by_month,
                'locked_accounts':  lock_by_month,
            },
            'user_pie': user_pie,
            'admin_users':    admin_user_list,
            'recent_errors':  recent_errors,
        })


# ── System Error Log (paginated list + resolve toggle) ────────────────────────

class SystemErrorLogListView(APIView):
    """
    GET /api/user-profile/system-errors
        ?module=<str>&error_type=<str>&resolved=<bool>&page=<int>

    Returns paginated system error log. Admin only.
    stack_trace is NEVER returned in list responses.

    PATCH /api/user-profile/system-errors/<pk>/resolve
    Toggles resolved flag. Admin only.
    """

    permission_classes = [IsAuthenticated]
    PAGE_SIZE = 10

    def get(self, request):
        guard = _require_admin(request)
        if guard is not None:
            return guard

        # ── Query params (sanitised) ──────────────────────────────────────────
        raw_search     = (request.query_params.get('search', '') or '').strip()[:120]
        raw_module     = (request.query_params.get('module', '') or '').strip()[:100]
        raw_error_type = (request.query_params.get('error_type', '') or '').strip()[:50]
        raw_resolved   = request.query_params.get('resolved', '').lower()
        raw_sort_by    = (request.query_params.get('sort_by', 'timestamp') or 'timestamp').strip()
        raw_sort_dir   = (request.query_params.get('sort_dir', 'desc') or 'desc').strip().lower()

        qs = SystemErrorLog.objects.all()

        if raw_search:
            qs = qs.filter(
                Q(module__icontains=raw_search)
                | Q(error_type__icontains=raw_search)
                | Q(message__icontains=raw_search)
                | Q(user__firstname__icontains=raw_search)
                | Q(user__lastname__icontains=raw_search)
                | Q(user__idnumber__icontains=raw_search)
            )

        # Filter-option pools are computed from the searched queryset (before column filters)
        available_modules = list(
            qs.exclude(module='')
            .values_list('module', flat=True)
            .distinct()
            .order_by('module')
        )
        available_error_types = list(
            qs.values_list('error_type', flat=True)
            .distinct()
            .order_by('error_type')
        )

        if raw_module:
            qs = qs.filter(module__icontains=raw_module)
        if raw_error_type:
            qs = qs.filter(error_type__icontains=raw_error_type)
        if raw_resolved == 'true':
            qs = qs.filter(resolved=True)
        elif raw_resolved == 'false':
            qs = qs.filter(resolved=False)

        sort_map = {
            'timestamp': 'timestamp',
            'error_type': 'error_type',
            'module': 'module',
            'message': 'message',
            'status': 'resolved',
            'triggered_by': 'user__lastname',
        }
        sort_field = sort_map.get(raw_sort_by, 'timestamp')
        order_prefix = '' if raw_sort_dir == 'asc' else '-'
        if sort_field == 'user__lastname':
            qs = qs.order_by(f'{order_prefix}user__lastname', f'{order_prefix}user__firstname', '-timestamp')
        else:
            qs = qs.order_by(f'{order_prefix}{sort_field}', '-timestamp')

        # ── Pagination ────────────────────────────────────────────────────────
        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except (ValueError, TypeError):
            page = 1

        total   = qs.count()
        offset  = (page - 1) * self.PAGE_SIZE
        records = qs.select_related('user')[offset: offset + self.PAGE_SIZE]

        results = []
        for err in records:
            triggered_by = None
            if err.user:
                triggered_by = {
                    'id':       err.user.pk,
                    'idnumber': err.user.idnumber,
                    'name':     f'{err.user.firstname or ""} {err.user.lastname or ""}'.strip(),
                }
            results.append({
                'id':           err.pk,
                'timestamp':    err.timestamp.isoformat(),
                'error_type':   err.error_type,
                'module':       err.module,
                'message':      err.message[:300],   # truncated in list
                'resolved':     err.resolved,
                'triggered_by': triggered_by,
            })

        return Response({
            'total':    total,
            'page':     page,
            'per_page': self.PAGE_SIZE,
            'results':  results,
            'available_modules': available_modules,
            'available_error_types': available_error_types,
        })


class SystemErrorLogResolveView(APIView):
    """
    PATCH /api/user-profile/system-errors/<pk>/resolve
    Toggles the resolved flag on a SystemErrorLog entry. Admin only.
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk: int):
        guard = _require_admin(request)
        if guard is not None:
            return guard

        try:
            err = SystemErrorLog.objects.get(pk=pk)
        except SystemErrorLog.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        err.resolved = not err.resolved
        err.save(update_fields=['resolved'])
        return Response({'id': err.pk, 'resolved': err.resolved})
