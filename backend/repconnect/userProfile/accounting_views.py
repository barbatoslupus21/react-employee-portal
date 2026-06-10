"""
Accounting Dashboard View — /api/user-profile/accounting-overview

Access guard: request.user.accounting OR request.user.admin must be True.

Sections returned
-----------------
  stats                   — six stat cards + 4-week sparklines
  employment_type_chart   — employee count per employment type
  dept_pie                — employee distribution per department
  loan_chart              — active loans per loan type (bar)
  finance_monthly_chart   — allowances / savings / payslips per month (fiscal year)
  prf_status_pie          — PRF requests by status
  prf_type_chart          — PRF requests per type (fiscal year)
  loan_portfolio          — total outstanding loan balance
  savings_total           — total savings balance
"""

from __future__ import annotations

import calendar
import datetime
from collections.abc import Mapping
from decimal import Decimal

from django.db.models import Count, Max, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from userLogin.models import loginCredentials
from .admin_views import _fiscal_year_range, _week_of_month


# ── Role guard helper ─────────────────────────────────────────────────────────

def _require_accounting(request) -> Response | None:
    """Return 403 unless user has accounting=True or admin=True."""
    u = request.user
    if not (getattr(u, 'accounting', False) or getattr(u, 'admin', False)):
        return Response(
            {'detail': 'Accounting permission required.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _period_range(today: datetime.date, fy_start: datetime.date, period: str) -> tuple[datetime.date, datetime.date]:
    """Return inclusive date range for the requested period key."""
    p = (period or '1FY').upper()
    if p == '1W':
        start = today - datetime.timedelta(days=today.weekday())
        return start, today
    if p == '1M':
        return today.replace(day=1), today
    if p == '3M':
        # Current month + previous 2 months
        month_start = today.replace(day=1)
        for _ in range(2):
            month_start = (month_start - datetime.timedelta(days=1)).replace(day=1)
        return month_start, today
    return fy_start, today


def _previous_period_range(start: datetime.date, end: datetime.date) -> tuple[datetime.date, datetime.date]:
    span_days = (end - start).days
    prev_end = start - datetime.timedelta(days=1)
    prev_start = prev_end - datetime.timedelta(days=span_days)
    return prev_start, prev_end


# ── Accounting Overview View ──────────────────────────────────────────────────

class AccountingOverviewView(APIView):
    """
    GET /api/user-profile/accounting-overview

    Aggregated financial and headcount dashboard for accounting users.
    Returns 403 unless request.user.accounting or admin.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        guard = _require_accounting(request)
        if guard is not None:
            return guard

        today  = timezone.localdate()
        tz_obj = timezone.get_current_timezone()

        month_start = today.replace(day=1)

        # Lazy imports
        from finance.models import Allowance, Loan, LoanType, Payslip, Savings
        from prForm.models import PRFRequest
        from userProfile.models import workInformation

        # Employees: active, non-admin, non-hr, non-accounting
        regular_employees = loginCredentials.objects.filter(
            active=True,
            is_superuser=False,
            admin=False,
            hr=False,
            accounting=False,
        )
        total_employees = regular_employees.count()

        # ── Stat card: users with active loans (current_balance > 0) ──────────
        users_with_loans = (
            Loan.objects
            .filter(current_balance__gt=0)
            .values('employee')
            .distinct()
            .count()
        )

        # ── Stat card: users with allowances ─────────────────────────────────
        users_with_allowances = (
            Allowance.objects
            .values('employee')
            .distinct()
            .count()
        )

        # ── Stat card: users with savings ─────────────────────────────────────
        users_with_savings = (
            Savings.objects
            .filter(withdraw=False)
            .values('employee')
            .distinct()
            .count()
        )

        # ── Stat card: users with payslips (most recent batch = latest period_end) ──
        latest_period_end = Payslip.objects.aggregate(m=Max('period_end'))['m']
        users_with_payslips = 0
        if latest_period_end:
            users_with_payslips = (
                Payslip.objects
                .filter(period_end=latest_period_end)
                .values('employee')
                .distinct()
                .count()
            )

        # ── Stat card: active PRF requests ─────────────────────────────────────
        active_prfs = PRFRequest.objects.filter(status='pending').count()

        # ── Weekly sparklines ─────────────────────────────────────────────────
        weeks = ['W1', 'W2', 'W3', 'W4']

        # Static current-value sparklines for headcount metrics
        emp_weeks        = [total_employees]      * 4
        loan_weeks       = [users_with_loans]     * 4
        allowance_weeks  = [users_with_allowances] * 4
        savings_weeks    = [users_with_savings]   * 4
        payslip_weeks    = [users_with_payslips]  * 4
        prf_weeks        = [0, 0, 0, 0]

        for ts in PRFRequest.objects.filter(
            status='pending',
            created_at__date__gte=month_start,
            created_at__date__lte=today,
        ).values_list('created_at', flat=True):
            local_dt = ts.astimezone(tz_obj)
            prf_weeks[_week_of_month(local_dt.date())] += 1

        # ── Fiscal year helpers ────────────────────────────────────────────────
        fy_start, fy_end, fy_labels, fy_month_keys = _fiscal_year_range(today)  # type: ignore[misc]
        fy_month_index = {(y, m): i for i, (y, m) in enumerate(fy_month_keys)}

        selected_period = (request.query_params.get('period') or '1FY').upper()
        if selected_period not in {'1W', '1M', '3M', '1FY'}:
            selected_period = '1FY'
        period_start, period_end = _period_range(today, fy_start, selected_period)
        prev_period_start, prev_period_end = _previous_period_range(period_start, period_end)

        if selected_period == '1FY':
            range_labels = fy_labels
            month_keys = fy_month_keys
        elif selected_period == '3M':
            range_labels = []
            month_keys = []
            cur = period_start
            while cur <= period_end:
                month_keys.append((cur.year, cur.month))
                range_labels.append(calendar.month_abbr[cur.month])
                cur = (cur.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
        elif selected_period == '1M':
            days = (period_end - period_start).days + 1
            range_labels = [str((period_start + datetime.timedelta(days=i)).day) for i in range(days)]
            month_keys = []
        else:  # 1W
            days = 7
            range_labels = [
                (period_start + datetime.timedelta(days=i)).strftime('%a')
                for i in range(days)
            ]
            month_keys = []

        # ── Employment type bar chart ─────────────────────────────────────────
        # One work record per employee (distinct by employee, use most recent)
        # Aggregate by employment_type name
        emp_type_rows = (
            workInformation.objects
            .filter(employee__active=True, employee__is_superuser=False)
            .exclude(employment_type=None)
            .values('employment_type__name')
            .annotate(count=Count('employee', distinct=True))
            .order_by('employment_type__name')
        )
        employment_type_chart = [
            {'name': r['employment_type__name'], 'count': r['count']}
            for r in emp_type_rows
        ]

        # Add "Unassigned" bucket
        assigned_ids = (
            workInformation.objects
            .filter(employee__active=True, employee__is_superuser=False)
            .exclude(employment_type=None)
            .values_list('employee_id', flat=True)
            .distinct()
        )
        unassigned = regular_employees.exclude(pk__in=assigned_ids).count()
        if unassigned:
            employment_type_chart.append({'name': 'Unassigned', 'count': unassigned})

        # ── Department distribution pie ────────────────────────────────────────
        dept_rows = (
            workInformation.objects
            .filter(employee__active=True, employee__is_superuser=False)
            .exclude(department=None)
            .values('department__name')
            .annotate(count=Count('employee', distinct=True))
            .order_by('-count')
        )
        dept_pie = [
            {'name': r['department__name'], 'count': r['count']}
            for r in dept_rows
        ]

        # ── Loan distribution bar chart (active loans by type) ─────────────────
        loan_type_rows = (
            Loan.objects
            .filter(current_balance__gt=0)
            .values('loan_type__name')
            .annotate(count=Count('employee', distinct=True))
            .order_by('-count')
        )
        loan_chart = [
            {'name': r['loan_type__name'], 'count': r['count']}
            for r in loan_type_rows
        ]

        # ── Finance monthly chart (allowances / savings / payslips per month) ───
        allow_by_month   = [0] * 12
        savings_by_month = [0] * 12
        payslip_by_month = [0] * 12

        # Amount-focused series for selected period cards (loan/savings/allowance + PRF).
        trend_length = len(range_labels)
        loan_amounts_by_period = [0.0] * trend_length
        allowance_amounts_by_period = [0.0] * trend_length
        savings_amounts_by_period = [0.0] * trend_length
        prf_count_by_period = [0] * trend_length

        day_index = {
            (period_start + datetime.timedelta(days=i)): i
            for i in range((period_end - period_start).days + 1)
        }
        month_index = {(y, m): i for i, (y, m) in enumerate(month_keys)} if month_keys else {}

        def _index_for_day(d: datetime.date) -> int | None:
            if selected_period in {'1FY', '3M'}:
                return month_index.get((d.year, d.month))
            return day_index.get(d)

        for ts in Allowance.objects.filter(
            created_at__date__gte=fy_start,
            created_at__date__lte=today,
        ).values('created_at__year', 'created_at__month').annotate(n=Count('employee', distinct=True)):
            idx = fy_month_index.get((ts['created_at__year'], ts['created_at__month']))
            if idx is not None:
                allow_by_month[idx] += ts['n']

        for ts in Savings.objects.filter(
            withdraw=False,
            created_at__date__gte=fy_start,
            created_at__date__lte=today,
        ).values('created_at__year', 'created_at__month').annotate(n=Count('employee', distinct=True)):
            idx = fy_month_index.get((ts['created_at__year'], ts['created_at__month']))
            if idx is not None:
                savings_by_month[idx] += ts['n']

        for ts in Payslip.objects.filter(
            created_at__date__gte=fy_start,
            created_at__date__lte=today,
        ).values('created_at__year', 'created_at__month').annotate(n=Count('employee', distinct=True)):
            idx = fy_month_index.get((ts['created_at__year'], ts['created_at__month']))
            if idx is not None:
                payslip_by_month[idx] += ts['n']

        for row in Loan.objects.filter(
            current_balance__gt=0,
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        ).values('created_at__date').annotate(total=Sum('current_balance')):
            idx = _index_for_day(row['created_at__date'])
            if idx is not None:
                loan_amounts_by_period[idx] += float(row['total'] or 0)

        for row in Allowance.objects.filter(
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        ).values('created_at__date').annotate(total=Sum('amount')):
            idx = _index_for_day(row['created_at__date'])
            if idx is not None:
                allowance_amounts_by_period[idx] += float(row['total'] or 0)

        for row in Savings.objects.filter(
            withdraw=False,
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        ).values('created_at__date').annotate(total=Sum('amount')):
            idx = _index_for_day(row['created_at__date'])
            if idx is not None:
                savings_amounts_by_period[idx] += float(row['total'] or 0)

        for row in PRFRequest.objects.filter(
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        ).values('created_at__date').annotate(total=Count('id')):
            idx = _index_for_day(row['created_at__date'])
            if idx is not None:
                prf_count_by_period[idx] += row['total']

        def _pct_change(current: Decimal | float | int, previous: Decimal | float | int) -> float:
            cur = Decimal(str(current or 0))
            prev = Decimal(str(previous or 0))
            if prev == 0:
                return 100.0 if cur > 0 else 0.0
            return float((cur - prev) / prev * Decimal('100'))

        # Card-level totals and percentages vs previous equivalent period.
        loan_fy_total = float(
            Loan.objects.filter(
                current_balance__gt=0,
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            ).aggregate(total=Sum('current_balance'))['total'] or 0
        )
        loan_prev_fy_total = float(
            Loan.objects.filter(
                current_balance__gt=0,
                created_at__date__gte=prev_period_start,
                created_at__date__lte=prev_period_end,
            ).aggregate(total=Sum('current_balance'))['total'] or 0
        )

        savings_fy_total = float(
            Savings.objects.filter(withdraw=False, created_at__date__gte=period_start, created_at__date__lte=period_end)
            .aggregate(total=Sum('amount'))['total'] or 0
        )
        savings_prev_fy_total = float(
            Savings.objects.filter(withdraw=False, created_at__date__gte=prev_period_start, created_at__date__lte=prev_period_end)
            .aggregate(total=Sum('amount'))['total'] or 0
        )

        allowance_fy_total = float(
            Allowance.objects.filter(created_at__date__gte=period_start, created_at__date__lte=period_end)
            .aggregate(total=Sum('amount'))['total'] or 0
        )
        allowance_prev_fy_total = float(
            Allowance.objects.filter(created_at__date__gte=prev_period_start, created_at__date__lte=prev_period_end)
            .aggregate(total=Sum('amount'))['total'] or 0
        )

        prf_total = PRFRequest.objects.filter(
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        ).count()
        prf_prev_total = PRFRequest.objects.filter(
            created_at__date__gte=prev_period_start,
            created_at__date__lte=prev_period_end,
        ).count()

        # Type-level lists with amount + YoY percentage.
        current_loan_types = {
            row['loan_type__name']: float(row['amount'] or 0)
            for row in Loan.objects.filter(
                current_balance__gt=0,
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            ).values('loan_type__name').annotate(amount=Sum('current_balance'))
        }
        prev_loan_types = {
            row['loan_type__name']: float(row['amount'] or 0)
            for row in Loan.objects.filter(
                current_balance__gt=0,
                created_at__date__gte=prev_period_start,
                created_at__date__lte=prev_period_end,
            ).values('loan_type__name').annotate(amount=Sum('current_balance'))
        }

        current_savings_types = {
            row['savings_type__name']: float(row['amount'] or 0)
            for row in Savings.objects.filter(
                withdraw=False,
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            ).values('savings_type__name').annotate(amount=Sum('amount'))
        }
        prev_savings_types = {
            row['savings_type__name']: float(row['amount'] or 0)
            for row in Savings.objects.filter(
                withdraw=False,
                created_at__date__gte=prev_period_start,
                created_at__date__lte=prev_period_end,
            ).values('savings_type__name').annotate(amount=Sum('amount'))
        }

        current_allowance_types = {
            row['allowance_type__name']: float(row['amount'] or 0)
            for row in Allowance.objects.filter(
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            ).values('allowance_type__name').annotate(amount=Sum('amount'))
        }
        prev_allowance_types = {
            row['allowance_type__name']: float(row['amount'] or 0)
            for row in Allowance.objects.filter(
                created_at__date__gte=prev_period_start,
                created_at__date__lte=prev_period_end,
            ).values('allowance_type__name').annotate(amount=Sum('amount'))
        }

        current_prf_types = {
            row['prf_type']: int(row['count'] or 0)
            for row in PRFRequest.objects.filter(
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            ).values('prf_type').annotate(count=Count('id'))
        }
        prev_prf_types = {
            row['prf_type']: int(row['count'] or 0)
            for row in PRFRequest.objects.filter(
                created_at__date__gte=prev_period_start,
                created_at__date__lte=prev_period_end,
            ).values('prf_type').annotate(count=Count('id'))
        }

        def _build_type_breakdown(current_map: Mapping[str, float], previous_map: Mapping[str, float]) -> list[dict]:
            rows: list[dict] = []
            for name, amount in current_map.items():
                if amount <= 0:
                    continue
                prev_amount = previous_map.get(name, 0.0)
                rows.append({
                    'name': name,
                    'amount': amount,
                    'change_pct': round(_pct_change(amount, prev_amount), 2),
                })
            rows.sort(key=lambda row: row['amount'], reverse=True)
            return rows

        loan_type_amounts = _build_type_breakdown(current_loan_types, prev_loan_types)
        savings_type_amounts = _build_type_breakdown(current_savings_types, prev_savings_types)
        allowance_type_amounts = _build_type_breakdown(current_allowance_types, prev_allowance_types)
        prf_type_amounts = _build_type_breakdown(current_prf_types, prev_prf_types)

        # ── PRF status pie ─────────────────────────────────────────────────────
        prf_status_rows = (
            PRFRequest.objects
            .values('status')
            .annotate(count=Count('id'))
            .order_by('status')
        )
        prf_status_pie = [
            {'status': r['status'], 'count': r['count']}
            for r in prf_status_rows
        ]

        # ── PRF type bar chart (fiscal year) ───────────────────────────────────
        prf_type_rows = (
            PRFRequest.objects
            .filter(created_at__date__gte=period_start, created_at__date__lte=period_end)
            .values('prf_type')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        prf_type_chart = [
            {'name': r['prf_type'], 'count': r['count']}
            for r in prf_type_rows
        ]

        # ── Portfolio aggregates ───────────────────────────────────────────────
        loan_portfolio = float(
            Loan.objects.filter(
                current_balance__gt=0,
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            )
            .aggregate(total=Sum('current_balance'))['total'] or 0
        )
        savings_total = float(
            Savings.objects.filter(
                withdraw=False,
                created_at__date__gte=period_start,
                created_at__date__lte=period_end,
            )
            .aggregate(total=Sum('amount'))['total'] or 0
        )

        return Response({
            'stats': {
                'total_employees':     {'current': total_employees},
                'users_with_loans':    {'current': users_with_loans},
                'users_with_allowances': {'current': users_with_allowances},
                'users_with_savings':  {'current': users_with_savings},
                'users_with_payslips': {'current': users_with_payslips},
                'active_prfs':         {'current': active_prfs},
                'trends': {
                    'weeks':                weeks,
                    'total_employees':      emp_weeks,
                    'users_with_loans':     loan_weeks,
                    'users_with_allowances': allowance_weeks,
                    'users_with_savings':   savings_weeks,
                    'users_with_payslips':  payslip_weeks,
                    'active_prfs':          prf_weeks,
                },
            },
            'employment_type_chart': employment_type_chart,
            'dept_pie':              dept_pie,
            'loan_chart':            loan_chart,
            'finance_monthly_chart': {
                'months':     fy_labels,
                'allowances': allow_by_month,
                'savings':    savings_by_month,
                'payslips':   payslip_by_month,
            },
            'finance_monthly_amount_chart': {
                'months': range_labels,
                'loans': loan_amounts_by_period,
                'allowances': allowance_amounts_by_period,
                'savings': savings_amounts_by_period,
                'prf_requests': prf_count_by_period,
            },
            'prf_status_pie':  prf_status_pie,
            'prf_type_chart':  prf_type_chart,
            'loan_portfolio':  loan_portfolio,
            'savings_total':   savings_total,
            'loan_portfolio_change_pct': round(_pct_change(loan_fy_total, loan_prev_fy_total), 2),
            'savings_total_change_pct': round(_pct_change(savings_fy_total, savings_prev_fy_total), 2),
            'allowance_total': allowance_fy_total,
            'allowance_total_change_pct': round(_pct_change(allowance_fy_total, allowance_prev_fy_total), 2),
            'loan_type_amounts': loan_type_amounts,
            'savings_type_amounts': savings_type_amounts,
            'allowance_type_amounts': allowance_type_amounts,
            'prf_request_total': prf_total,
            'prf_request_change_pct': round(_pct_change(prf_total, prf_prev_total), 2),
            'prf_type_amounts': prf_type_amounts,
            'selected_period': selected_period,
            'selected_range': {
                'start': period_start.isoformat(),
                'end': period_end.isoformat(),
            },
            'latest_payslip_period': latest_period_end.isoformat() if latest_period_end else None,
        })
