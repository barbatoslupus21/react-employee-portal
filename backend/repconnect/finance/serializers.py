"""Finance module serializers."""
from __future__ import annotations

from rest_framework import serializers

from .models import (
    Allowance,
    AllowanceType,
    Deduction,
    Loan,
    LoanSettings,
    LoanType,
    OfficeFinanceRate,
    Payslip,
    PayslipType,
    Savings,
    SavingsType,
)


# ── Type serializers ──────────────────────────────────────────────────────────

class AllowanceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = AllowanceType
        fields = ('id', 'name', 'color', 'replace_on_upload', 'percentage', 'created_at')


class LoanTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanType
        fields = ('id', 'name', 'color', 'stackable', 'created_at')


class SavingsTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavingsType
        fields = ('id', 'name', 'color', 'created_at')


class PayslipTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayslipType
        fields = ('id', 'name', 'color', 'created_at')


# ── Office rate serializer ────────────────────────────────────────────────────

class OfficeFinanceRateSerializer(serializers.ModelSerializer):
    office_name = serializers.CharField(source='office.name', read_only=True)

    class Meta:
        model = OfficeFinanceRate
        fields = (
            'id', 'office', 'office_name',
            'ojt_rate', 'allowance_day',
            'nd_rate', 'nd_ot_rate', 'regular_ot_rate',
            'rest_day_ot_rate', 'legal_holiday_rate', 'saturday_off_rate',
        )


# ── Loan settings serializer ──────────────────────────────────────────────────

class LoanSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanSettings
        fields = ('deduction_frequency', 'updated_at')


# ── Transaction serializers ───────────────────────────────────────────────────

class AllowanceSerializer(serializers.ModelSerializer):
    employee_idnumber  = serializers.CharField(source='employee.idnumber',  read_only=True)
    employee_firstname = serializers.CharField(source='employee.firstname', read_only=True)
    employee_lastname  = serializers.CharField(source='employee.lastname',  read_only=True)
    allowance_type_name = serializers.CharField(source='allowance_type.name', read_only=True)
    is_percentage = serializers.BooleanField(source='allowance_type.percentage', read_only=True)

    class Meta:
        model = Allowance
        fields = (
            'id', 'employee_idnumber', 'employee_firstname', 'employee_lastname',
            'allowance_type', 'allowance_type_name', 'is_percentage',
            'amount', 'deposited_date', 'covered_period', 'description', 'created_at',
        )


class LoanSerializer(serializers.ModelSerializer):
    employee_idnumber  = serializers.CharField(source='employee.idnumber',  read_only=True)
    employee_firstname = serializers.CharField(source='employee.firstname', read_only=True)
    employee_lastname  = serializers.CharField(source='employee.lastname',  read_only=True)
    loan_type_name  = serializers.CharField(source='loan_type.name',  read_only=True)
    loan_type_color = serializers.CharField(source='loan_type.color', read_only=True)

    class Meta:
        model = Loan
        fields = (
            'id', 'employee_idnumber', 'employee_firstname', 'employee_lastname',
            'loan_type', 'loan_type_name', 'loan_type_color',
            'principal_amount', 'current_balance',
            'monthly_deduction',
            'description', 'reference_number',
            'created_at', 'updated_at',
        )


class DeductionSerializer(serializers.ModelSerializer):
    employee_idnumber  = serializers.CharField(source='employee.idnumber',  read_only=True)
    employee_firstname = serializers.CharField(source='employee.firstname', read_only=True)
    employee_lastname  = serializers.CharField(source='employee.lastname',  read_only=True)

    class Meta:
        model = Deduction
        fields = (
            'id', 'employee_idnumber', 'employee_firstname', 'employee_lastname',
            'loan', 'amount', 'description', 'created_at',
        )


class SavingsSerializer(serializers.ModelSerializer):
    employee_idnumber  = serializers.CharField(source='employee.idnumber',  read_only=True)
    employee_firstname = serializers.CharField(source='employee.firstname', read_only=True)
    employee_lastname  = serializers.CharField(source='employee.lastname',  read_only=True)
    savings_type_name = serializers.CharField(source='savings_type.name', read_only=True)

    class Meta:
        model = Savings
        fields = (
            'id', 'employee_idnumber', 'employee_firstname', 'employee_lastname',
            'savings_type', 'savings_type_name', 'amount', 'withdraw', 'description', 'created_at',
        )


class PayslipSerializer(serializers.ModelSerializer):
    employee_idnumber  = serializers.CharField(source='employee.idnumber',  read_only=True)
    employee_firstname = serializers.CharField(source='employee.firstname', read_only=True)
    employee_lastname  = serializers.CharField(source='employee.lastname',  read_only=True)
    payslip_type_name  = serializers.CharField(source='payslip_type.name', read_only=True)
    file_url           = serializers.SerializerMethodField()
    file_name          = serializers.SerializerMethodField()

    class Meta:
        model = Payslip
        fields = (
            'id', 'employee_idnumber', 'employee_firstname', 'employee_lastname',
            'payslip_type', 'payslip_type_name',
            'period_start', 'period_end',
            'file', 'file_url', 'file_name',
            'sent', 'description', 'created_at',
        )
        extra_kwargs = {'file': {'write_only': True}}

    def get_file_url(self, obj: Payslip) -> str | None:
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url if obj.file else None

    def get_file_name(self, obj: Payslip) -> str | None:
        if obj.file and obj.file.name:
            return obj.file.name
        return None


# ── Annotated employee-row serializer ─────────────────────────────────────────

class FinanceEmployeeRowSerializer(serializers.Serializer):
    """Serializes an annotated loginCredentials queryset row for the employee table."""

    idnumber   = serializers.CharField()
    firstname  = serializers.CharField(allow_null=True)
    lastname   = serializers.CharField(allow_null=True)
    department = serializers.SerializerMethodField()
    line       = serializers.SerializerMethodField()

    loans_count    = serializers.IntegerField(default=0)
    loans_total    = serializers.DecimalField(max_digits=14, decimal_places=2, default=0)
    loans_balance  = serializers.DecimalField(max_digits=14, decimal_places=2, default=0)

    allowances_count = serializers.IntegerField(default=0)
    allowances_total = serializers.DecimalField(max_digits=14, decimal_places=2, default=0)

    savings_count = serializers.IntegerField(default=0)
    savings_total = serializers.DecimalField(max_digits=14, decimal_places=2, default=0)

    deductions_count = serializers.IntegerField(default=0)
    deductions_total = serializers.DecimalField(max_digits=14, decimal_places=2, default=0)

    payslips_count = serializers.IntegerField(default=0)

    def get_department(self, obj) -> str:
        try:
            wi_list = obj.workinformation_set.all()  # uses prefetch cache
            wi = wi_list[0] if wi_list else None
            return wi.department.name if wi and wi.department else ''
        except Exception:
            return ''

    def get_line(self, obj) -> str:
        try:
            wi_list = obj.workinformation_set.all()  # uses prefetch cache
            wi = wi_list[0] if wi_list else None
            return wi.line.name if wi and wi.line else ''
        except Exception:
            return ''
