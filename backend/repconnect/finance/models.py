"""Finance module models.

Type-definition tables (AllowanceType, LoanType, SavingsType, PayslipType) hold
admin-configurable categories.  Transaction tables (Allowance, Loan, Deduction,
Savings, Payslip) store per-employee financial records with distinct upload
behaviors.  OfficeFinanceRate stores per-office financial rate configuration.
"""
from __future__ import annotations

import os
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models


# ── Type-definition tables ────────────────────────────────────────────────────

class AllowanceType(models.Model):
    """Configurable allowance category.

    ``replace_on_upload=True`` → importing data for this type atomically
    replaces all existing Allowance rows for the (employee, type) pair.
    ``replace_on_upload=False`` → values are accumulated cumulatively.
    """

    name = models.CharField(max_length=100, unique=True)
    replace_on_upload = models.BooleanField(
        default=False,
        help_text=(
            'When enabled, uploading data for this type replaces all existing '
            'allowance records for the employee. When disabled, values are added '
            'cumulatively.'
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'finance_allowance_types'
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class LoanType(models.Model):
    """Configurable loan category.

    ``stackable=True`` → new loans of this type are accepted even when an
    active (current_balance > 0) loan already exists for the employee.
    ``stackable=False`` → upload is rejected if the employee already has an
    active loan of this type.
    """

    name = models.CharField(max_length=100, unique=True)
    stackable = models.BooleanField(
        default=False,
        help_text=(
            'When enabled, new loan uploads are added cumulatively on top of '
            'existing active balances. When disabled, upload is rejected if the '
            'employee already has an active (current_balance > 0) loan of this type.'
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'finance_loan_types'
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class SavingsType(models.Model):
    """Configurable savings category (always cumulative)."""

    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'finance_savings_types'
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


class PayslipType(models.Model):
    """Configurable payslip category."""

    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'finance_payslip_types'
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


# ── Office financial rate configuration ───────────────────────────────────────

_RATE_FIELD_KWARGS: dict = dict(
    max_digits=7,
    decimal_places=4,
    default=Decimal('0.0000'),
    null=True,
    blank=True,
    validators=[MinValueValidator(Decimal('0'))],
)


class OfficeFinanceRate(models.Model):
    """Per-office financial rate configuration.

    Exactly one rate record may exist per office (OneToOneField).  All rate
    fields are optional; null means "not configured".
    """

    office = models.OneToOneField(
        'generalsettings.Office',
        on_delete=models.CASCADE,
        related_name='finance_rate',
    )
    ojt_rate = models.DecimalField(
        **_RATE_FIELD_KWARGS,
        help_text='On-the-job training hourly rate.',
    )
    allowance_day = models.DecimalField(
        **_RATE_FIELD_KWARGS,
        help_text='Daily allowance rate.',
    )
    nd_rate = models.DecimalField(
        **_RATE_FIELD_KWARGS,
        help_text='Regular night-differential rate.',
    )
    nd_ot_rate = models.DecimalField(
        **_RATE_FIELD_KWARGS,
        help_text='Night-differential overtime rate.',
    )
    regular_ot_rate = models.DecimalField(
        **_RATE_FIELD_KWARGS,
        help_text='Regular overtime rate.',
    )
    rest_day_ot_rate = models.DecimalField(
        **_RATE_FIELD_KWARGS,
        help_text='Rest-day overtime rate.',
    )
    legal_holiday_rate = models.DecimalField(
        **_RATE_FIELD_KWARGS,
        help_text='Legal holiday rate.',
    )
    saturday_off_rate = models.DecimalField(
        **_RATE_FIELD_KWARGS,
        help_text='Saturday-off rate.',
    )

    class Meta:
        db_table = 'finance_office_rates'
        ordering = ['office']

    def __str__(self) -> str:
        return f'Rates — {self.office}'


# ── Transaction / record tables ───────────────────────────────────────────────

class Allowance(models.Model):
    """A single allowance transaction for an employee.

    Upload behaviour is controlled by ``AllowanceType.replace_on_upload``.
    """

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='allowances',
    )
    allowance_type = models.ForeignKey(
        AllowanceType,
        on_delete=models.CASCADE,
        related_name='allowances',
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'finance_allowances'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.employee} — {self.allowance_type} — {self.amount}'


class Loan(models.Model):
    """A loan record tracking principal and remaining balance.

    ``current_balance`` starts equal to ``principal_amount`` and is reduced
    by each linked Deduction record.
    """

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='loans',
    )
    loan_type = models.ForeignKey(
        LoanType,
        on_delete=models.CASCADE,
        related_name='loans',
    )
    principal_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    current_balance = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0'))],
    )
    description = models.CharField(max_length=255, blank=True)
    reference_number = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'finance_loans'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.employee} — {self.loan_type} — balance {self.current_balance}'


class Deduction(models.Model):
    """A deduction applied against a specific Loan.

    The import process uses ``select_for_update()`` on the target Loan inside
    ``transaction.atomic()`` to atomically reduce ``current_balance``.  Rows
    that would make the balance negative are rejected at import time.
    """

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='deductions',
    )
    loan = models.ForeignKey(
        Loan,
        on_delete=models.CASCADE,
        related_name='deductions',
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'finance_deductions'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.employee} — loan#{self.loan_id} — {self.amount}'  # type: ignore[attr-defined]


class Savings(models.Model):
    """A single savings deposit for an employee (always cumulative).

    The employee's total savings for a type equals the SUM of all Savings rows
    for (employee, savings_type).
    """

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='savings',
    )
    savings_type = models.ForeignKey(
        SavingsType,
        on_delete=models.CASCADE,
        related_name='savings',
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'finance_savings'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.employee} — {self.savings_type} — {self.amount}'


def _validate_payslip_pdf(file) -> None:
    """Validate that the uploaded payslip file is a PDF ≤ 5 MB."""
    if file.size > 5 * 1024 * 1024:
        raise ValidationError('Payslip file must not exceed 5 MB.')
    name: str = getattr(file, 'name', '') or ''
    if os.path.splitext(name)[1].lower() != '.pdf':
        raise ValidationError('Only PDF files are accepted for payslips.')


class Payslip(models.Model):
    """A payslip file record for a given pay period.

    Payslips are uploaded as externally generated PDF documents; gross/net values
    are encoded within the PDF rather than stored as separate database fields.
    """

    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='payslips',
    )
    payslip_type = models.ForeignKey(
        PayslipType,
        on_delete=models.CASCADE,
        related_name='payslips',
    )
    period_start = models.DateField(db_index=True)
    period_end = models.DateField()
    file = models.FileField(
        upload_to='payslips/',
        null=True,
        blank=True,
        validators=[
            FileExtensionValidator(allowed_extensions=['pdf']),
            _validate_payslip_pdf,
        ],
    )
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'finance_payslips'
        ordering = ['-period_start']

    def __str__(self) -> str:
        return f'{self.employee} — {self.payslip_type} — {self.period_start}/{self.period_end}'
