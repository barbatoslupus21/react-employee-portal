"""
HR Dashboard View — /api/user-profile/hr-overview

Access guard: request.user.hr OR request.user.admin must be True.

Sections returned
-----------------
  stats                — six stat cards + 4-week sparklines
  user_pie             — active / inactive / locked
    password_chart       — changed vs default per month (fiscal year)
    leave_weekly_chart   — leave filings per week (current vs last month)
    leave_category_chart — leave type totals for fiscal year (horizontal bar)
    leave_fiscal_chart   — monthly leave total + per-category monthly counts
    leave_status_monthly_chart — monthly leave filings grouped by status
    prf_status_monthly_chart   — monthly PRF filings grouped by status
  cert_chart           — certificates issued per month (fiscal year)
  survey_pies          — per active survey: submitted vs not_submitted
  training_status_pie  — training submission status breakdown
    training_status_bar  — normalized training status counts for bar chart
    dept_profile_chart   — completed vs total employees per department
        profile_completion_fiscal_chart — monthly employee snapshot counts by employment type
  upcoming_birthdays   — employees with birthdays in next 7 days
  pending_leaves_count — total pending leave requests system-wide
  recent_prfs          — 5 most recent PRF requests
"""

from __future__ import annotations

import calendar
import datetime

from django.db.models import Count, Prefetch
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from userLogin.models import loginCredentials
from .admin_views import _fiscal_year_range, _week_of_month


# ── Role guard helper ─────────────────────────────────────────────────────────

def _require_hr(request) -> "Response | None":
    """Return 403 unless user has hr=True or admin=True."""
    u = request.user
    if not (getattr(u, 'hr', False) or getattr(u, 'admin', False)):
        return Response(
            {'detail': 'HR permission required.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


# ── HR Overview View ──────────────────────────────────────────────────────────

class HROverviewView(APIView):
    """
    GET /api/user-profile/hr-overview

    Aggregated HR dashboard data. Returns 403 unless request.user.hr or admin.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        guard = _require_hr(request)
        if guard is not None:
            return guard

        today  = timezone.localdate()
        tz_obj = timezone.get_current_timezone()

        # Month boundaries
        month_start = today.replace(day=1)
        prev_month_end   = month_start - datetime.timedelta(days=1)
        prev_month_start = prev_month_end.replace(day=1)

        # Lazy imports
        from certification.models import Certificate
        from leave.models import LeaveRequest, LeaveType
        from prForm.models import PRFRequest
        from survey.models import Survey, SurveyResponse
        from training.models import TrainingSubmission
        from userProfile.models import PersonalInformation, PresentAddress, EmergencyContact, workInformation
        from userLogin.models import EmployeeSnapshot

        all_active = loginCredentials.objects.filter(
            active=True,
            is_superuser=False,
            admin=False,
            hr=False,
            accounting=False,
        )

        # ── Stat card values ──────────────────────────────────────────────────
        total_employees = all_active.count()

        certs_this_month = Certificate.objects.filter(
            created_at__date__gte=month_start,
        ).count()

        prfs_this_month = PRFRequest.objects.filter(
            created_at__date__gte=month_start,
        ).count()

        active_surveys = Survey.objects.filter(status='active').count()

        leaves_this_month = LeaveRequest.objects.filter(
            created_at__date__gte=month_start,
        ).count()

        # Profile completion — prefetch in one query
        all_active_list = list(all_active)

        # Build lookup dicts for profile completion (4 queries total for all users)
        from userProfile.models import PersonalInformation, PresentAddress, EmergencyContact
        pi_map  = {pi.employee_id: pi  for pi in PersonalInformation.objects.filter(employee__in=all_active_list)}
        pa_map  = {pa.employee_id: pa  for pa in PresentAddress.objects.filter(employee__in=all_active_list)}
        ec_map  = {ec.employee_id: ec  for ec in EmergencyContact.objects.filter(employee__in=all_active_list)}

        def _is_complete(u) -> bool:
            pi = pi_map.get(u.pk)
            pa = pa_map.get(u.pk)
            ec = ec_map.get(u.pk)
            required = [
                (u.firstname or '').strip(),
                (u.lastname or '').strip(),
                getattr(pi, 'gender', ''),
                getattr(pi, 'birth_date', None),
                (getattr(pi, 'birth_place', '') or '').strip(),
                (getattr(pi, 'contact_number', '') or '').strip(),
                (getattr(pa, 'country', '') or '').strip(),
                (getattr(ec, 'name', '') or '').strip(),
                (getattr(ec, 'relationship', '') or '').strip(),
                (getattr(ec, 'contact_number', '') or '').strip(),
                (getattr(ec, 'address', '') or '').strip(),
            ]
            return sum(1 for f in required if f) == len(required)

        completed_profiles = sum(1 for u in all_active_list if _is_complete(u))

        # ── Weekly sparklines ─────────────────────────────────────────────────
        weeks = ['W1', 'W2', 'W3', 'W4']
        emp_weeks   = [total_employees] * 4  # static snapshot
        cert_weeks  = [0, 0, 0, 0]
        prf_weeks   = [0, 0, 0, 0]
        surv_weeks  = [0, 0, 0, 0]
        leave_weeks = [0, 0, 0, 0]
        prof_weeks  = [completed_profiles] * 4

        for ts in Certificate.objects.filter(
            created_at__date__gte=month_start,
            created_at__date__lte=today,
        ).values_list('created_at', flat=True):
            local_dt = ts.astimezone(tz_obj)
            cert_weeks[_week_of_month(local_dt.date())] += 1

        for ts in PRFRequest.objects.filter(
            created_at__date__gte=month_start,
            created_at__date__lte=today,
        ).values_list('created_at', flat=True):
            local_dt = ts.astimezone(tz_obj)
            prf_weeks[_week_of_month(local_dt.date())] += 1

        for ts in LeaveRequest.objects.filter(
            created_at__date__gte=month_start,
            created_at__date__lte=today,
        ).values_list('created_at', flat=True):
            local_dt = ts.astimezone(tz_obj)
            leave_weeks[_week_of_month(local_dt.date())] += 1

        # Surveys: active count per week (static, surveys don't change mid-week frequently)
        surv_weeks = [active_surveys] * 4

        # ── Fiscal year helpers ────────────────────────────────────────────────
        fy_start, fy_end, fy_labels, fy_month_keys = _fiscal_year_range(today)  # type: ignore[misc]
        fy_month_index = {(y, m): i for i, (y, m) in enumerate(fy_month_keys)}

        # ── User security pie ─────────────────────────────────────────────────
        all_users = loginCredentials.objects.filter(is_superuser=False)
        user_pie = {
            'active':   all_users.filter(active=True, locked=False).count(),
            'inactive': all_users.filter(active=False).count(),
            'locked':   all_users.filter(locked=True).count(),
        }

        # ── Password security chart ───────────────────────────────────────────
        from activityLog.models import ActivityLog
        pwd_changed_by_month = [0] * 12
        for ts in ActivityLog.objects.filter(
            endpoint__icontains='change-password',
            http_method='POST',
            timestamp__date__gte=fy_start,
            timestamp__date__lte=today,
        ).values_list('timestamp', flat=True):
            local_dt = ts.astimezone(tz_obj)
            idx = fy_month_index.get((local_dt.year, local_dt.month))
            if idx is not None:
                pwd_changed_by_month[idx] += 1

        default_pwd_by_month = [0] * 12
        curr_idx = fy_month_index.get((today.year, today.month))
        if curr_idx is not None:
            default_pwd_by_month[curr_idx] = loginCredentials.objects.filter(
                change_password=True, active=True
            ).count()

        # ── Leave weekly chart (current vs last month, by week) ────────────────
        curr_leave_weeks = [0, 0, 0, 0]
        prev_leave_weeks = [0, 0, 0, 0]

        for ts in LeaveRequest.objects.filter(
            created_at__date__gte=month_start,
            created_at__date__lte=today,
        ).values_list('created_at', flat=True):
            local_dt = ts.astimezone(tz_obj)
            curr_leave_weeks[_week_of_month(local_dt.date())] += 1

        for ts in LeaveRequest.objects.filter(
            created_at__date__gte=prev_month_start,
            created_at__date__lte=prev_month_end,
        ).values_list('created_at', flat=True):
            local_dt = ts.astimezone(tz_obj)
            prev_leave_weeks[_week_of_month(local_dt.date())] += 1

        # ── Leave category ranking (fiscal year) ──────────────────────────────
        leave_category_rows = (
            LeaveRequest.objects
            .filter(created_at__date__gte=fy_start, created_at__date__lte=today)
            .values('leave_type__name')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        leave_category_chart = [
            {'name': r['leave_type__name'], 'count': r['count']}
            for r in leave_category_rows
        ]

        # ── Leave fiscal combo chart (monthly totals + category lines) ─────────
        leave_total_by_month = [0] * 12
        leave_type_monthly_map: dict[str, list[int]] = {}
        leave_status_monthly_map = {
            'pending': [0] * 12,
            'approved': [0] * 12,
            'disapproved': [0] * 12,
            'cancelled': [0] * 12,
        }
        leave_rows = LeaveRequest.objects.filter(
            created_at__date__gte=fy_start,
            created_at__date__lte=today,
        ).values_list('created_at', 'leave_type__name', 'status')
        for ts, leave_type_name, leave_status in leave_rows:
            local_dt = ts.astimezone(tz_obj)
            idx = fy_month_index.get((local_dt.year, local_dt.month))
            if idx is None:
                continue

            leave_total_by_month[idx] += 1

            leave_type = leave_type_name or 'Unspecified'
            if leave_type not in leave_type_monthly_map:
                leave_type_monthly_map[leave_type] = [0] * 12
            leave_type_monthly_map[leave_type][idx] += 1

            status_key = (leave_status or '').lower()
            if status_key in leave_status_monthly_map:
                leave_status_monthly_map[status_key][idx] += 1

        leave_fiscal_chart = {
            'months': fy_labels,
            'total_filed': leave_total_by_month,
            'categories': [
                {'name': name, 'count': counts}
                for name, counts in sorted(
                    leave_type_monthly_map.items(),
                    key=lambda item: sum(item[1]),
                    reverse=True,
                )
            ],
        }

        leave_status_monthly_chart = {
            'months': fy_labels,
            'statuses': [
                {'status': 'pending', 'count': leave_status_monthly_map['pending']},
                {'status': 'approved', 'count': leave_status_monthly_map['approved']},
                {'status': 'disapproved', 'count': leave_status_monthly_map['disapproved']},
                {'status': 'cancelled', 'count': leave_status_monthly_map['cancelled']},
            ],
        }

        # ── Certificate chart (fiscal year) ───────────────────────────────────
        cert_by_month = [0] * 12
        for ts in Certificate.objects.filter(
            created_at__date__gte=fy_start,
            created_at__date__lte=today,
        ).values_list('created_at', flat=True):
            local_dt = ts.astimezone(tz_obj)
            idx = fy_month_index.get((local_dt.year, local_dt.month))
            if idx is not None:
                cert_by_month[idx] += 1

        # ── Survey submission pies ────────────────────────────────────────────
        active_survey_list = Survey.objects.filter(status='active').prefetch_related(
            Prefetch(
                'responses',
                queryset=SurveyResponse.objects.filter(is_complete=True),
                to_attr='completed_responses',
            )
        )
        survey_pies = []
        for s in active_survey_list:
            completed = len(s.completed_responses)
            # total eligible: if target_type=all_users use total active, else survey targets
            if s.target_type == 'all_users':
                total_eligible = all_active.count()
            else:
                total_eligible = s.target_users.count()
            not_submitted = max(0, total_eligible - completed)
            survey_pies.append({
                'survey_id':   s.pk,
                'title':       s.title,
                'submitted':   completed,
                'not_submitted': not_submitted,
            })

        # ── Training evaluation status pie ────────────────────────────────────
        training_statuses = (
            TrainingSubmission.objects
            .values('status')
            .annotate(count=Count('id'))
            .order_by('status')
        )
        training_status_pie = [
            {'status': r['status'], 'count': r['count']}
            for r in training_statuses
        ]

        # Normalize training statuses for dashboard bar categories.
        training_status_order = [
            ('pending', 'Pending'),
            ('supervisor_review', 'Supervisor Review'),
            ('user_confirmation', 'User Confirmation'),
            ('final_approval', 'Final Approval'),
            ('returned', 'Returned for Revision'),
            ('completed', 'Completed'),
        ]
        training_status_counts = {k: 0 for k, _ in training_status_order}
        for row in training_status_pie:
            status_key = (row.get('status') or '').lower()
            count = int(row.get('count') or 0)
            if status_key == 'second_final_approval':
                training_status_counts['final_approval'] += count
            elif status_key in training_status_counts:
                training_status_counts[status_key] += count

        training_status_bar = [
            {'status': key, 'label': label, 'count': training_status_counts[key]}
            for key, label in training_status_order
        ]

        # ── Profile completion by department ──────────────────────────────────
        dept_names: dict[str, dict] = {}
        for u in all_active_list:
            work = u.work_information.order_by('-created_at').first() if hasattr(u, 'work_information') else None
            dept = work.department.name if work and work.department else 'Unassigned'
            if dept not in dept_names:
                dept_names[dept] = {'total': 0, 'completed': 0}
            dept_names[dept]['total'] += 1
            if _is_complete(u):
                dept_names[dept]['completed'] += 1

        dept_profile_chart = [
            {
                'department': dept,
                'completed':  v['completed'],
                'total':      v['total'],
                'pct':        round(v['completed'] / v['total'] * 100) if v['total'] else 0,
            }
            for dept, v in sorted(dept_names.items())
        ]

        # ── Profile completion by employment type per fiscal-year month ───────
        # EmployeeSnapshot is the authoritative month-by-month source for the chart.
        snapshot_by_month: dict[tuple[int, int], EmployeeSnapshot] = {}
        for snap in EmployeeSnapshot.objects.filter(
            snapshot_date__gte=fy_start,
            snapshot_date__lte=today,
        ).order_by('snapshot_date'):
            snapshot_by_month[(snap.snapshot_date.year, snap.snapshot_date.month)] = snap

        def _snapshot_value(field: str) -> list[int]:
            values: list[int] = []
            for year, month in fy_month_keys:
                snap = snapshot_by_month.get((year, month))
                values.append(int(getattr(snap, field, 0) or 0) if snap else 0)
            return values

        profile_completion_fiscal_chart = {
            'months': fy_labels,
            'employment_types': [
                {
                    'name': 'Regular',
                    'count': _snapshot_value('regular'),
                },
                {
                    'name': 'Probationary',
                    'count': _snapshot_value('probationary'),
                },
                {
                    'name': 'OJT',
                    'count': _snapshot_value('ojt'),
                },
                {
                    'name': 'Total',
                    'count': _snapshot_value('total'),
                },
            ],
        }

        # ── Upcoming birthdays (next 7 days) ──────────────────────────────────
        from userProfile.models import PersonalInformation as PI
        upcoming_bdays = []
        for offset in range(1, 8):
            d = today + datetime.timedelta(days=offset)
            qs = PI.objects.filter(
                birth_date__month=d.month,
                birth_date__day=d.day,
                employee__active=True,
            ).select_related('employee')
            for pi_obj in qs:
                u = pi_obj.employee
                upcoming_bdays.append({
                    'id':        u.pk,
                    'idnumber':  u.idnumber,
                    'full_name': f'{u.firstname or ""} {u.lastname or ""}'.strip(),
                    'birth_date': pi_obj.birth_date.isoformat() if pi_obj.birth_date else None,
                    'days_away':  offset,
                })

        # ── Pending leave count ────────────────────────────────────────────────
        pending_leaves_count = LeaveRequest.objects.filter(status='pending').count()

        # ── PRF status monthly chart (fiscal year) ───────────────────────────
        prf_status_monthly_map = {
            'pending': [0] * 12,
            'approved': [0] * 12,
            'disapproved': [0] * 12,
            'cancelled': [0] * 12,
        }
        prf_rows = PRFRequest.objects.filter(
            created_at__date__gte=fy_start,
            created_at__date__lte=today,
        ).values_list('created_at', 'status')
        for ts, prf_status in prf_rows:
            local_dt = ts.astimezone(tz_obj)
            idx = fy_month_index.get((local_dt.year, local_dt.month))
            if idx is None:
                continue
            status_key = (prf_status or '').lower()
            if status_key in prf_status_monthly_map:
                prf_status_monthly_map[status_key][idx] += 1

        prf_status_monthly_chart = {
            'months': fy_labels,
            'statuses': [
                {'status': 'pending', 'count': prf_status_monthly_map['pending']},
                {'status': 'approved', 'count': prf_status_monthly_map['approved']},
                {'status': 'disapproved', 'count': prf_status_monthly_map['disapproved']},
                {'status': 'cancelled', 'count': prf_status_monthly_map['cancelled']},
            ],
        }

        return Response({
            'stats': {
                'total_employees':     {'current': total_employees},
                'certs_granted':       {'current': certs_this_month},
                'prf_this_month':      {'current': prfs_this_month},
                'active_surveys':      {'current': active_surveys},
                'leaves_filed':        {'current': leaves_this_month},
                'completed_profiles':  {'current': completed_profiles},
                'trends': {
                    'weeks':               weeks,
                    'total_employees':     emp_weeks,
                    'certs_granted':       cert_weeks,
                    'prf_this_month':      prf_weeks,
                    'active_surveys':      surv_weeks,
                    'leaves_filed':        leave_weeks,
                    'completed_profiles':  prof_weeks,
                },
            },
            'user_pie':    user_pie,
            'password_chart': {
                'months':           fy_labels,
                'changed_password': pwd_changed_by_month,
                'default_password': default_pwd_by_month,
            },
            'leave_weekly_chart': {
                'weeks':        weeks,
                'current_month': curr_leave_weeks,
                'last_month':    prev_leave_weeks,
            },
            'leave_category_chart': leave_category_chart,
            'leave_fiscal_chart': leave_fiscal_chart,
            'leave_status_monthly_chart': leave_status_monthly_chart,
            'cert_chart': {
                'months': fy_labels,
                'count':  cert_by_month,
            },
            'survey_pies':          survey_pies,
            'training_status_pie':  training_status_pie,
            'training_status_bar':  training_status_bar,
            'dept_profile_chart':   dept_profile_chart,
            'profile_completion_fiscal_chart': profile_completion_fiscal_chart,
            'upcoming_birthdays':   upcoming_bdays,
            'pending_leaves_count': pending_leaves_count,
            'prf_status_monthly_chart': prf_status_monthly_chart,
        })
