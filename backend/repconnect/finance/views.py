"""Finance module views.

All admin endpoints require ``admin=True AND accounting=True`` on the user.

Endpoints
---------
GET  admin/types       — all 4 type lists
GET  admin/chart       — record-count chart aggregates
GET  admin/employees   — paginated, annotated employee list
POST admin/import      — xlsx import (record_type param)
GET  admin/export      — xlsx export (record_type + date range)
"""
from __future__ import annotations

import base64
import calendar
import datetime
import io
from decimal import Decimal, InvalidOperation

from django.conf import settings as django_settings
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Prefetch, Q, Sum
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Allowance, AllowanceType,
    Deduction,
    Loan, LoanType,
    OfficeFinanceRate,
    Payslip, PayslipType,
    Savings, SavingsType,
)
from .serializers import (
    AllowanceSerializer,
    AllowanceTypeSerializer,
    FinanceEmployeeRowSerializer,
    LoanSerializer,
    LoanTypeSerializer,
    OfficeFinanceRateSerializer,
    PayslipSerializer,
    PayslipTypeSerializer,
    SavingsSerializer,
    SavingsTypeSerializer,
)


# ── Auth helper ───────────────────────────────────────────────────────────────

def _require_accounting_admin(request) -> Response | None:
    """Return 403 unless user has both admin=True AND accounting=True."""
    u = request.user
    if not (getattr(u, 'admin', False) and getattr(u, 'accounting', False)):
        return Response(
            {'detail': 'Admin and Accounting permission required.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


# ── Error-report builder ──────────────────────────────────────────────────────

def _build_error_excel(failures: list[dict]) -> str:
    """Build an error-report xlsx and return base64-encoded bytes."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = 'Import Errors'

    def _side():
        return Side(style='thin', color='FF000000')

    thin = Border(left=_side(), right=_side(), top=_side(), bottom=_side())
    hdr_fill = PatternFill(start_color='FFCC0000', end_color='FFCC0000', fill_type='solid')

    headers = ['Row', 'Field / Column', 'Reason']
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = Font(bold=True, color='FFFFFFFF')
        cell.fill = hdr_fill
        cell.border = thin
        cell.alignment = Alignment(horizontal='center')

    for row_num, item in enumerate(failures, 2):
        ws.cell(row=row_num, column=1, value=item.get('row', '')).border = thin
        ws.cell(row=row_num, column=2, value=item.get('field', '')).border = thin
        ws.cell(row=row_num, column=3, value=item.get('reason', '')).border = thin

    ws.column_dimensions['A'].width = 8
    ws.column_dimensions['B'].width = 30
    ws.column_dimensions['C'].width = 60

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _parse_decimal(value, field: str, row: int) -> tuple[Decimal | None, dict | None]:
    """Parse a cell value as a positive Decimal. Returns (decimal, None) or (None, error_dict)."""
    try:
        d = Decimal(str(value)).quantize(Decimal('0.01'))
        if d <= 0:
            return None, {'row': row, 'field': field, 'reason': f'{field} must be greater than 0.'}
        return d, None
    except (InvalidOperation, TypeError, ValueError):
        return None, {'row': row, 'field': field, 'reason': f'{field} is not a valid number.'}


def _parse_non_negative_decimal(value, field: str, row: int) -> tuple[Decimal | None, dict | None]:
    """Parse a cell value as a non-negative Decimal (>=0)."""
    try:
        d = Decimal(str(value)).quantize(Decimal('0.01'))
        if d < 0:
            return None, {'row': row, 'field': field, 'reason': f'{field} must be 0 or greater.'}
        return d, None
    except (InvalidOperation, TypeError, ValueError):
        return None, {'row': row, 'field': field, 'reason': f'{field} is not a valid number.'}


def _lookup_employee(idnumber: str, row: int):
    """Return (employee, None) or (None, error_dict). Rejects privileged users."""
    from userLogin.models import loginCredentials
    try:
        emp = loginCredentials.objects.get(idnumber=idnumber)
    except loginCredentials.DoesNotExist:
        return None, {'row': row, 'field': 'idnumber', 'reason': f'No employee found with ID "{idnumber}".'}
    if emp.admin or emp.accounting or emp.hr:
        return None, {'row': row, 'field': 'idnumber', 'reason': f'Employee "{idnumber}" is a privileged user (admin/accounting/hr) and cannot have finance records.'}
    return emp, None


def _read_xlsx(file_obj) -> tuple[list[list], str | None]:
    """Open an uploaded xlsx file and return (rows_of_values, error_message_or_None)."""
    try:
        from openpyxl import load_workbook
        wb = load_workbook(file_obj, read_only=True, data_only=True)
        ws = wb.active
        rows = []
        for row in ws.iter_rows(values_only=True):
            rows.append(list(row))
        return rows, None
    except Exception as exc:
        return [], f'Could not read xlsx file: {exc}'


# ── Views ─────────────────────────────────────────────────────────────────────

class FinanceTypeListView(APIView):
    """GET /api/finance/admin/types — all 4 type lists."""
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        err = _require_accounting_admin(request)
        if err:
            return err
        return Response({
            'allowance_types': AllowanceTypeSerializer(AllowanceType.objects.all(), many=True).data,
            'loan_types':      LoanTypeSerializer(LoanType.objects.all(), many=True).data,
            'savings_types':   SavingsTypeSerializer(SavingsType.objects.all(), many=True).data,
            'payslip_types':   PayslipTypeSerializer(PayslipType.objects.all(), many=True).data,
        })


class FinanceChartView(APIView):
    """
    GET /api/finance/admin/chart
    Params: view (fiscal|monthly|weekly), year, month, week_start (ISO date)
    Returns counts of Loan, Allowance, Savings records per time bucket.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        err = _require_accounting_admin(request)
        if err:
            return err

        view_mode = request.GET.get('view', 'monthly')
        today = datetime.date.today()

        if view_mode == 'fiscal':
            year = int(request.GET.get('year', today.year))
            # Fiscal year: July → June
            fy_start = datetime.date(year, 7, 1)
            months = []
            for i in range(12):
                m = (fy_start.month - 1 + i) % 12 + 1
                y = fy_start.year + ((fy_start.month - 1 + i) // 12)
                months.append((y, m))
            data = []
            for (y, m) in months:
                label = datetime.date(y, m, 1).strftime('%b %Y')
                loans_c = Loan.objects.filter(created_at__year=y, created_at__month=m).count()
                allow_c = Allowance.objects.filter(created_at__year=y, created_at__month=m).count()
                sav_c   = Savings.objects.filter(created_at__year=y, created_at__month=m).count()
                data.append({'label': label, 'loans': loans_c, 'allowances': allow_c, 'savings': sav_c})
            return Response({'view': view_mode, 'fy_start': str(fy_start), 'data': data})

        elif view_mode == 'weekly':
            try:
                week_start = datetime.date.fromisoformat(request.GET.get('week_start', str(today)))
            except (ValueError, TypeError):
                week_start = today
            # Align to Monday of the given week
            week_start = week_start - datetime.timedelta(days=week_start.weekday())
            data = []
            for i in range(7):
                day = week_start + datetime.timedelta(days=i)
                label = day.strftime('%a %d')
                loans_c = Loan.objects.filter(created_at__date=day).count()
                allow_c = Allowance.objects.filter(created_at__date=day).count()
                sav_c   = Savings.objects.filter(created_at__date=day).count()
                data.append({'label': label, 'loans': loans_c, 'allowances': allow_c, 'savings': sav_c})
            return Response({'view': view_mode, 'week_start': str(week_start), 'data': data})

        else:  # monthly (default)
            year = int(request.GET.get('year', today.year))
            month = int(request.GET.get('month', today.month))
            _, days_in_month = calendar.monthrange(year, month)
            data = []
            for day_num in range(1, days_in_month + 1):
                day = datetime.date(year, month, day_num)
                label = str(day_num)
                loans_c = Loan.objects.filter(created_at__date=day).count()
                allow_c = Allowance.objects.filter(created_at__date=day).count()
                sav_c   = Savings.objects.filter(created_at__date=day).count()
                data.append({'label': label, 'loans': loans_c, 'allowances': allow_c, 'savings': sav_c})
            return Response({'view': view_mode, 'year': year, 'month': month, 'data': data})


class FinanceEmployeeListView(APIView):
    """
    GET /api/finance/admin/employees
    Paginated list of non-privileged employees annotated with finance counts/totals.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        err = _require_accounting_admin(request)
        if err:
            return err

        from userLogin.models import loginCredentials
        from userProfile.models import workInformation

        qs = loginCredentials.objects.filter(
            admin=False, accounting=False, hr=False,
        ).prefetch_related(
            Prefetch(
                'workinformation_set',
                queryset=workInformation.objects.select_related('department', 'line').order_by('-created_at'),
            )
        )

        # Annotate with finance counts and totals
        qs = qs.annotate(
            loans_count=Count('loans', distinct=True),
            loans_total=Sum('loans__principal_amount'),
            loans_balance=Sum('loans__current_balance'),
            allowances_count=Count('allowances', distinct=True),
            allowances_total=Sum('allowances__amount'),
            savings_count=Count('savings', distinct=True),
            savings_total=Sum('savings__amount'),
            deductions_count=Count('deductions', distinct=True),
            deductions_total=Sum('deductions__amount'),
            payslips_count=Count('payslips', distinct=True),
        )

        # Search
        search_q = request.GET.get('search', '').strip()
        if search_q:
            qs = qs.filter(
                Q(idnumber__icontains=search_q) |
                Q(firstname__icontains=search_q) |
                Q(lastname__icontains=search_q)
            )

        # Column filters (single-select for dept/line, multi for idnumbers)
        department_id_raw = request.GET.get('department_id', '').strip()
        if department_id_raw and department_id_raw.isdigit():
            qs = qs.filter(Exists(
                workInformation.objects.filter(employee=OuterRef('pk'), department_id=int(department_id_raw))
            ))

        line_id_raw = request.GET.get('line_id', '').strip()
        if line_id_raw and line_id_raw.isdigit():
            qs = qs.filter(Exists(
                workInformation.objects.filter(employee=OuterRef('pk'), line_id=int(line_id_raw))
            ))

        idnumbers_raw = request.GET.get('idnumbers', '').strip()
        if idnumbers_raw:
            idnumber_list = [x.strip() for x in idnumbers_raw.split(',') if x.strip()]
            if idnumber_list:
                qs = qs.filter(idnumber__in=idnumber_list)

        # Sort
        sort_by  = request.GET.get('sort_by',  'lastname')
        sort_dir = request.GET.get('sort_dir', 'asc')
        allowed_sorts = {
            'idnumber', 'firstname', 'lastname',
            'department', 'line',
            'loans_count', 'loans_total', 'loans_balance',
            'allowances_count', 'allowances_total',
            'savings_count', 'savings_total',
            'deductions_count', 'deductions_total',
            'payslips_count',
        }
        if sort_by not in allowed_sorts:
            sort_by = 'lastname'
        order_prefix = '' if sort_dir == 'asc' else '-'
        if sort_by == 'department':
            qs = qs.order_by(f'{order_prefix}workinformation__department__name')
        elif sort_by == 'line':
            qs = qs.order_by(f'{order_prefix}workinformation__line__name')
        else:
            qs = qs.order_by(f'{order_prefix}{sort_by}')

        # Pagination
        try:
            page = max(1, int(request.GET.get('page', 1)))
        except (ValueError, TypeError):
            page = 1
        page_size = 10
        total = qs.count()
        start = (page - 1) * page_size
        qs_page = list(qs[start: start + page_size])

        serializer = FinanceEmployeeRowSerializer(qs_page, many=True)
        return Response({
            'results':     serializer.data,
            'count':       total,
            'page':        page,
            'page_size':   page_size,
            'total_pages': max(1, -(-total // page_size)),
        })


class FinanceEmployeeDetailView(APIView):
    """
    GET /api/finance/admin/employees/<idnumber>/records
    Returns all finance records (loans, allowances, savings, payslips) for a
    specific non-privileged employee.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, idnumber: str) -> Response:
        err = _require_accounting_admin(request)
        if err:
            return err

        from userLogin.models import loginCredentials
        try:
            emp = loginCredentials.objects.get(idnumber=idnumber)
        except loginCredentials.DoesNotExist:
            return Response({'detail': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)

        if emp.admin or emp.accounting or emp.hr:
            return Response({'detail': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)

        loans      = Loan.objects.filter(employee=emp).order_by('-created_at')
        allowances = Allowance.objects.filter(employee=emp).order_by('-created_at')
        savings    = Savings.objects.filter(employee=emp).order_by('-created_at')
        payslips   = Payslip.objects.filter(employee=emp).order_by('-created_at')

        return Response({
            'loans':      LoanSerializer(loans, many=True).data,
            'allowances': AllowanceSerializer(allowances, many=True).data,
            'savings':    SavingsSerializer(savings, many=True).data,
            'payslips':   PayslipSerializer(payslips, many=True, context={'request': request}).data,
        })


class FinanceImportView(APIView):
    """
    POST /api/finance/admin/import?record_type=<type>
    Accepts multipart xlsx upload and imports records per record_type.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        err = _require_accounting_admin(request)
        if err:
            return err

        record_type = request.GET.get('record_type', '').strip().lower()
        valid_types = {'allowance', 'loan', 'deduction', 'savings'}
        if record_type not in valid_types:
            return Response(
                {'detail': f'record_type must be one of: {", ".join(sorted(valid_types))}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'detail': 'No file uploaded.'}, status=status.HTTP_400_BAD_REQUEST)

        rows, read_err = _read_xlsx(file_obj)
        if read_err:
            return Response({'detail': read_err}, status=status.HTTP_400_BAD_REQUEST)

        if len(rows) < 2:
            return Response({'detail': 'File has no data rows (need at least one header + one data row).'}, status=status.HTTP_400_BAD_REQUEST)

        handler = {
            'allowance':  self._import_allowances,
            'loan':       self._import_loans,
            'deduction':  self._import_deductions,
            'savings':    self._import_savings,
        }[record_type]

        imported, failures = handler(rows)
        error_b64 = _build_error_excel(failures) if failures else None
        return Response({
            'imported':         imported,
            'failed':           len(failures),
            'error_report_b64': error_b64,
        })

    # ── Allowance import ──────────────────────────────────────────────────────
    # Columns: idnumber*, allowance_type*(name), amount*, description

    def _import_allowances(self, rows) -> tuple[int, list[dict]]:
        # rows[0] = header
        imported = 0
        failures = []

        # Pre-cache type map
        type_map = {t.name.lower(): t for t in AllowanceType.objects.all()}

        for row_idx, row in enumerate(rows[1:], start=2):
            # Pad short rows
            while len(row) < 4:
                row.append(None)

            idnumber     = str(row[0]).strip() if row[0] is not None else ''
            type_name    = str(row[1]).strip() if row[1] is not None else ''
            amount_raw   = row[2]
            description  = str(row[3]).strip() if row[3] is not None else ''

            if not idnumber:
                failures.append({'row': row_idx, 'field': 'idnumber', 'reason': 'idnumber is required.'})
                continue

            employee, emp_err = _lookup_employee(idnumber, row_idx)
            if emp_err:
                failures.append(emp_err)
                continue

            a_type = type_map.get(type_name.lower())
            if not a_type:
                failures.append({'row': row_idx, 'field': 'allowance_type', 'reason': f'Allowance type "{type_name}" not found.'})
                continue

            amount, amt_err = _parse_decimal(amount_raw, 'amount', row_idx)
            if amt_err:
                failures.append(amt_err)
                continue

            with transaction.atomic():
                if a_type.replace_on_upload:
                    Allowance.objects.filter(employee=employee, allowance_type=a_type).delete()
                Allowance.objects.create(
                    employee=employee,
                    allowance_type=a_type,
                    amount=amount,
                    description=description,
                )
            imported += 1

        return imported, failures

    # ── Loan import ───────────────────────────────────────────────────────────
    # Columns: idnumber*, loan_type*(name), principal_amount*, description, reference_number

    def _import_loans(self, rows) -> tuple[int, list[dict]]:
        imported = 0
        failures = []
        type_map = {t.name.lower(): t for t in LoanType.objects.all()}

        for row_idx, row in enumerate(rows[1:], start=2):
            while len(row) < 5:
                row.append(None)

            idnumber    = str(row[0]).strip() if row[0] is not None else ''
            type_name   = str(row[1]).strip() if row[1] is not None else ''
            amount_raw  = row[2]
            description = str(row[3]).strip() if row[3] is not None else ''
            ref_number  = str(row[4]).strip() if row[4] is not None else ''

            if not idnumber:
                failures.append({'row': row_idx, 'field': 'idnumber', 'reason': 'idnumber is required.'})
                continue

            employee, emp_err = _lookup_employee(idnumber, row_idx)
            if emp_err:
                failures.append(emp_err)
                continue

            l_type = type_map.get(type_name.lower())
            if not l_type:
                failures.append({'row': row_idx, 'field': 'loan_type', 'reason': f'Loan type "{type_name}" not found.'})
                continue

            principal, amt_err = _parse_decimal(amount_raw, 'principal_amount', row_idx)
            if amt_err:
                failures.append(amt_err)
                continue

            # Stackable check
            if not l_type.stackable:
                active_exists = Loan.objects.filter(
                    employee=employee, loan_type=l_type, current_balance__gt=Decimal('0')
                ).exists()
                if active_exists:
                    failures.append({
                        'row': row_idx,
                        'field': 'loan_type',
                        'reason': (
                            f'Employee "{idnumber}" already has an active loan of type '
                            f'"{l_type.name}" (stackable=False). Settle the balance first.'
                        ),
                    })
                    continue

            with transaction.atomic():
                Loan.objects.create(
                    employee=employee,
                    loan_type=l_type,
                    principal_amount=principal,
                    current_balance=principal,
                    description=description,
                    reference_number=ref_number,
                )
            imported += 1

        return imported, failures

    # ── Deduction import ──────────────────────────────────────────────────────
    # Columns: idnumber*, loan_id*(PK), amount*, description

    def _import_deductions(self, rows) -> tuple[int, list[dict]]:
        imported = 0
        failures = []

        for row_idx, row in enumerate(rows[1:], start=2):
            while len(row) < 4:
                row.append(None)

            idnumber    = str(row[0]).strip() if row[0] is not None else ''
            loan_id_raw = row[1]
            amount_raw  = row[2]
            description = str(row[3]).strip() if row[3] is not None else ''

            if not idnumber:
                failures.append({'row': row_idx, 'field': 'idnumber', 'reason': 'idnumber is required.'})
                continue

            employee, emp_err = _lookup_employee(idnumber, row_idx)
            if emp_err:
                failures.append(emp_err)
                continue

            try:
                loan_id = int(loan_id_raw)
            except (TypeError, ValueError):
                failures.append({'row': row_idx, 'field': 'loan_id', 'reason': 'loan_id must be a valid integer (Loan PK).'})
                continue

            amount, amt_err = _parse_decimal(amount_raw, 'amount', row_idx)
            if amt_err:
                failures.append(amt_err)
                continue

            with transaction.atomic():
                try:
                    loan = Loan.objects.select_for_update().get(pk=loan_id, employee=employee)
                except Loan.DoesNotExist:
                    failures.append({'row': row_idx, 'field': 'loan_id', 'reason': f'Loan #{loan_id} not found for employee "{idnumber}".'})
                    continue

                new_balance = loan.current_balance - amount
                if new_balance < Decimal('0'):
                    failures.append({
                        'row': row_idx,
                        'field': 'amount',
                        'reason': (
                            f'Deduction of {amount} would make Loan #{loan_id} balance negative '
                            f'(current balance: {loan.current_balance}).'
                        ),
                    })
                    continue

                loan.current_balance = new_balance
                loan.save(update_fields=['current_balance', 'updated_at'])
                Deduction.objects.create(
                    employee=employee,
                    loan=loan,
                    amount=amount,
                    description=description,
                )
            imported += 1

        return imported, failures

    # ── Savings import ────────────────────────────────────────────────────────
    # Columns: idnumber*, savings_type*(name), amount*, description

    def _import_savings(self, rows) -> tuple[int, list[dict]]:
        imported = 0
        failures = []
        type_map = {t.name.lower(): t for t in SavingsType.objects.all()}

        for row_idx, row in enumerate(rows[1:], start=2):
            while len(row) < 4:
                row.append(None)

            idnumber    = str(row[0]).strip() if row[0] is not None else ''
            type_name   = str(row[1]).strip() if row[1] is not None else ''
            amount_raw  = row[2]
            description = str(row[3]).strip() if row[3] is not None else ''

            if not idnumber:
                failures.append({'row': row_idx, 'field': 'idnumber', 'reason': 'idnumber is required.'})
                continue

            employee, emp_err = _lookup_employee(idnumber, row_idx)
            if emp_err:
                failures.append(emp_err)
                continue

            s_type = type_map.get(type_name.lower())
            if not s_type:
                failures.append({'row': row_idx, 'field': 'savings_type', 'reason': f'Savings type "{type_name}" not found.'})
                continue

            amount, amt_err = _parse_decimal(amount_raw, 'amount', row_idx)
            if amt_err:
                failures.append(amt_err)
                continue

            with transaction.atomic():
                Savings.objects.create(
                    employee=employee,
                    savings_type=s_type,
                    amount=amount,
                    description=description,
                )
            imported += 1

        return imported, failures



class FinancePayslipUploadView(APIView):
    """
    POST /api/finance/admin/payslip-upload
    Multipart fields: idnumber, payslip_type (name), period_start (ISO),
    period_end (ISO), description (optional), file (PDF ≤ 5 MB).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        err = _require_accounting_admin(request)
        if err:
            return err

        idnumber    = request.data.get('idnumber', '').strip()
        type_name   = request.data.get('payslip_type', '').strip()
        start_raw   = request.data.get('period_start', '').strip()
        end_raw     = request.data.get('period_end', '').strip()
        description = request.data.get('description', '').strip()
        file_obj    = request.FILES.get('file')

        errors: dict[str, str] = {}
        if not idnumber:
            errors['idnumber'] = 'idnumber is required.'
        if not type_name:
            errors['payslip_type'] = 'payslip_type is required.'
        if not start_raw:
            errors['period_start'] = 'period_start is required.'
        if not end_raw:
            errors['period_end'] = 'period_end is required.'
        if not file_obj:
            errors['file'] = 'A PDF file is required.'
        elif not file_obj.name.lower().endswith('.pdf'):
            errors['file'] = 'Only PDF files are accepted.'
        elif file_obj.size > 5 * 1024 * 1024:
            errors['file'] = 'File must not exceed 5 MB.'

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        employee, emp_err = _lookup_employee(idnumber, 0)
        if emp_err:
            return Response({'idnumber': emp_err['reason']}, status=status.HTTP_400_BAD_REQUEST)

        try:
            p_type = PayslipType.objects.get(name__iexact=type_name)
        except PayslipType.DoesNotExist:
            return Response(
                {'payslip_type': f'Payslip type "{type_name}" not found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            period_start = datetime.date.fromisoformat(start_raw)
        except ValueError:
            return Response({'period_start': f'Invalid date: "{start_raw}".'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            period_end = datetime.date.fromisoformat(end_raw)
        except ValueError:
            return Response({'period_end': f'Invalid date: "{end_raw}".'}, status=status.HTTP_400_BAD_REQUEST)

        if period_end < period_start:
            return Response(
                {'period_end': 'period_end must not be before period_start.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payslip = Payslip.objects.create(
            employee=employee,
            payslip_type=p_type,
            period_start=period_start,
            period_end=period_end,
            file=file_obj,
            description=description,
        )
        from .serializers import PayslipSerializer
        return Response(
            PayslipSerializer(payslip, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class OfficeFinanceRateView(APIView):
    """
    GET  /api/finance/admin/office-rates      — list all offices with rates.
    GET  /api/finance/admin/office-rates/<pk> — rates for one office (by office pk).
    PUT  /api/finance/admin/office-rates/<pk> — create-or-update rates.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int | None = None) -> Response:
        err = _require_accounting_admin(request)
        if err:
            return err

        if pk is not None:
            try:
                rate = OfficeFinanceRate.objects.select_related('office').get(office_id=pk)
            except OfficeFinanceRate.DoesNotExist:
                return Response({'detail': 'No rate record for this office.'}, status=status.HTTP_404_NOT_FOUND)
            return Response(OfficeFinanceRateSerializer(rate).data)

        rates = OfficeFinanceRate.objects.select_related('office').all()
        return Response(OfficeFinanceRateSerializer(rates, many=True).data)

    def put(self, request, pk: int | None = None) -> Response:
        err = _require_accounting_admin(request)
        if err:
            return err

        if pk is None:
            return Response({'detail': 'Office pk is required for PUT.'}, status=status.HTTP_400_BAD_REQUEST)

        from generalsettings.models import Office
        try:
            office = Office.objects.get(pk=pk)
        except Office.DoesNotExist:
            return Response({'detail': 'Office not found.'}, status=status.HTTP_404_NOT_FOUND)

        rate, _ = OfficeFinanceRate.objects.get_or_create(office=office)
        serializer = OfficeFinanceRateSerializer(rate, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class FinanceExportView(APIView):
    """
    GET /api/finance/admin/export
    Params: record_type (allowance|loan|deduction|savings|payslip|all), date_from, date_to
    Returns an xlsx file.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request) -> HttpResponse:
        err = _require_accounting_admin(request)
        if err:
            return err

        record_type = request.GET.get('record_type', 'all').strip().lower()
        valid_types = {'allowance', 'loan', 'deduction', 'savings', 'payslip', 'all'}
        if record_type not in valid_types:
            return Response(
                {'detail': f'record_type must be one of: {", ".join(sorted(valid_types))}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        today = datetime.date.today()
        try:
            date_from = datetime.date.fromisoformat(request.GET.get('date_from', str(today)))
        except (ValueError, TypeError):
            date_from = today
        try:
            date_to = datetime.date.fromisoformat(request.GET.get('date_to', str(today)))
        except (ValueError, TypeError):
            date_to = today
        if date_to < date_from:
            date_from, date_to = date_to, date_from

        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
        from openpyxl.utils import get_column_letter

        def _side():
            return Side(style='thin', color='FF000000')

        thin = Border(left=_side(), right=_side(), top=_side(), bottom=_side())
        hdr_fill = PatternFill(start_color='FF1E3A5F', end_color='FF1E3A5F', fill_type='solid')

        def _hdr_cell(ws, row, col, value):
            cell = ws.cell(row=row, column=col, value=value)
            cell.font = Font(bold=True, color='FFFFFFFF')
            cell.fill = hdr_fill
            cell.border = thin
            cell.alignment = Alignment(horizontal='center')
            return cell

        def _data_cell(ws, row, col, value):
            cell = ws.cell(row=row, column=col, value=value)
            cell.border = thin
            return cell

        wb = Workbook()
        wb.remove(wb.active)  # remove default empty sheet

        # Non-privileged employee IDs
        from userLogin.models import loginCredentials
        non_priv_ids = loginCredentials.objects.filter(
            admin=False, accounting=False, hr=False
        ).values_list('pk', flat=True)

        def _filter_date(qs, date_field='created_at'):
            return qs.filter(
                **{f'{date_field}__date__gte': date_from, f'{date_field}__date__lte': date_to}
            )

        sheets_to_build = (
            ['allowance', 'loan', 'deduction', 'savings', 'payslip']
            if record_type == 'all'
            else [record_type]
        )

        for sheet_type in sheets_to_build:
            ws = wb.create_sheet(title=sheet_type.capitalize())

            if sheet_type == 'allowance':
                headers = ['ID', 'Employee ID', 'First Name', 'Last Name', 'Allowance Type', 'Amount', 'Description', 'Created At']
                for col, h in enumerate(headers, 1):
                    _hdr_cell(ws, 1, col, h)
                qs = _filter_date(
                    Allowance.objects.select_related('employee', 'allowance_type')
                    .filter(employee_id__in=non_priv_ids).order_by('created_at')
                )
                for r, obj in enumerate(qs, 2):
                    _data_cell(ws, r, 1, obj.pk)
                    _data_cell(ws, r, 2, obj.employee.idnumber)
                    _data_cell(ws, r, 3, obj.employee.firstname)
                    _data_cell(ws, r, 4, obj.employee.lastname)
                    _data_cell(ws, r, 5, obj.allowance_type.name)
                    _data_cell(ws, r, 6, float(obj.amount))
                    _data_cell(ws, r, 7, obj.description)
                    _data_cell(ws, r, 8, obj.created_at.strftime('%Y-%m-%d %H:%M'))
                col_widths = [8, 14, 16, 16, 22, 14, 30, 18]

            elif sheet_type == 'loan':
                headers = ['ID', 'Employee ID', 'First Name', 'Last Name', 'Loan Type', 'Principal', 'Balance', 'Description', 'Reference No.', 'Created At']
                for col, h in enumerate(headers, 1):
                    _hdr_cell(ws, 1, col, h)
                qs = _filter_date(
                    Loan.objects.select_related('employee', 'loan_type')
                    .filter(employee_id__in=non_priv_ids).order_by('created_at')
                )
                for r, obj in enumerate(qs, 2):
                    _data_cell(ws, r, 1, obj.pk)
                    _data_cell(ws, r, 2, obj.employee.idnumber)
                    _data_cell(ws, r, 3, obj.employee.firstname)
                    _data_cell(ws, r, 4, obj.employee.lastname)
                    _data_cell(ws, r, 5, obj.loan_type.name)
                    _data_cell(ws, r, 6, float(obj.principal_amount))
                    _data_cell(ws, r, 7, float(obj.current_balance))
                    _data_cell(ws, r, 8, obj.description)
                    _data_cell(ws, r, 9, obj.reference_number)
                    _data_cell(ws, r, 10, obj.created_at.strftime('%Y-%m-%d %H:%M'))
                col_widths = [8, 14, 16, 16, 22, 14, 14, 30, 18, 18]

            elif sheet_type == 'deduction':
                headers = ['ID', 'Employee ID', 'First Name', 'Last Name', 'Loan ID', 'Amount', 'Description', 'Created At']
                for col, h in enumerate(headers, 1):
                    _hdr_cell(ws, 1, col, h)
                qs = _filter_date(
                    Deduction.objects.select_related('employee', 'loan')
                    .filter(employee_id__in=non_priv_ids).order_by('created_at')
                )
                for r, obj in enumerate(qs, 2):
                    _data_cell(ws, r, 1, obj.pk)
                    _data_cell(ws, r, 2, obj.employee.idnumber)
                    _data_cell(ws, r, 3, obj.employee.firstname)
                    _data_cell(ws, r, 4, obj.employee.lastname)
                    _data_cell(ws, r, 5, obj.loan_id)
                    _data_cell(ws, r, 6, float(obj.amount))
                    _data_cell(ws, r, 7, obj.description)
                    _data_cell(ws, r, 8, obj.created_at.strftime('%Y-%m-%d %H:%M'))
                col_widths = [8, 14, 16, 16, 10, 14, 30, 18]

            elif sheet_type == 'savings':
                headers = ['ID', 'Employee ID', 'First Name', 'Last Name', 'Savings Type', 'Amount', 'Description', 'Created At']
                for col, h in enumerate(headers, 1):
                    _hdr_cell(ws, 1, col, h)
                qs = _filter_date(
                    Savings.objects.select_related('employee', 'savings_type')
                    .filter(employee_id__in=non_priv_ids).order_by('created_at')
                )
                for r, obj in enumerate(qs, 2):
                    _data_cell(ws, r, 1, obj.pk)
                    _data_cell(ws, r, 2, obj.employee.idnumber)
                    _data_cell(ws, r, 3, obj.employee.firstname)
                    _data_cell(ws, r, 4, obj.employee.lastname)
                    _data_cell(ws, r, 5, obj.savings_type.name)
                    _data_cell(ws, r, 6, float(obj.amount))
                    _data_cell(ws, r, 7, obj.description)
                    _data_cell(ws, r, 8, obj.created_at.strftime('%Y-%m-%d %H:%M'))
                col_widths = [8, 14, 16, 16, 22, 14, 30, 18]

            else:  # payslip
                headers = ['ID', 'Employee ID', 'First Name', 'Last Name', 'Payslip Type', 'Period Start', 'Period End', 'File URL', 'Description', 'Created At']
                for col, h in enumerate(headers, 1):
                    _hdr_cell(ws, 1, col, h)
                qs = _filter_date(
                    Payslip.objects.select_related('employee', 'payslip_type')
                    .filter(employee_id__in=non_priv_ids).order_by('period_start'),
                    date_field='period_start',
                )
                base_url = request.build_absolute_uri('/')[:-1]
                for r, obj in enumerate(qs, 2):
                    file_url = f'{base_url}{obj.file.url}' if obj.file else ''
                    _data_cell(ws, r, 1, obj.pk)
                    _data_cell(ws, r, 2, obj.employee.idnumber)
                    _data_cell(ws, r, 3, obj.employee.firstname)
                    _data_cell(ws, r, 4, obj.employee.lastname)
                    _data_cell(ws, r, 5, obj.payslip_type.name)
                    _data_cell(ws, r, 6, str(obj.period_start))
                    _data_cell(ws, r, 7, str(obj.period_end))
                    _data_cell(ws, r, 8, file_url)
                    _data_cell(ws, r, 9, obj.description)
                    _data_cell(ws, r, 10, obj.created_at.strftime('%Y-%m-%d %H:%M'))
                col_widths = [8, 14, 16, 16, 22, 14, 14, 50, 30, 18]

            for col_idx, width in enumerate(col_widths, 1):
                ws.column_dimensions[get_column_letter(col_idx)].width = width

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        filename = f'finance_{record_type}_{date_from}_{date_to}.xlsx'
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class FinanceEmployeeFilterOptionsView(APIView):
    """
    GET /api/finance/admin/employee-filters
    Returns departments, lines, and idnumbers available for column-level
    filtering of the employee list.  Only reflects non-privileged employees
    (admin=False, accounting=False, hr=False).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        err = _require_accounting_admin(request)
        if err:
            return err

        from userLogin.models import loginCredentials
        from generalsettings.models import Department, Line

        qs = loginCredentials.objects.filter(admin=False, accounting=False, hr=False)

        dept_ids = (
            qs.filter(workinformation__department__isnull=False)
            .values_list('workinformation__department_id', flat=True)
            .distinct()
        )
        line_ids = (
            qs.filter(workinformation__line__isnull=False)
            .values_list('workinformation__line_id', flat=True)
            .distinct()
        )

        departments = list(
            Department.objects.filter(id__in=dept_ids).order_by('name').values('id', 'name')
        )
        lines = list(
            Line.objects.filter(id__in=line_ids).order_by('name').values('id', 'name')
        )
        idnumbers = list(qs.order_by('idnumber').values_list('idnumber', flat=True))

        return Response({'departments': departments, 'lines': lines, 'idnumbers': idnumbers})
