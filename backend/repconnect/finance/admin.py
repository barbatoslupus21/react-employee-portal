from django.contrib import admin

from .models import (
    Allowance,
    AllowanceType,
    Deduction,
    Loan,
    LoanType,
    OfficeFinanceRate,
    Payslip,
    PayslipType,
    Savings,
    SavingsType,
)


@admin.register(AllowanceType)
class AllowanceTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'replace_on_upload', 'percentage', 'created_at')
    list_filter = ('replace_on_upload', 'percentage')
    search_fields = ('name',)
    ordering = ('name',)


@admin.register(LoanType)
class LoanTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'stackable', 'created_at')
    list_filter = ('stackable',)
    search_fields = ('name',)
    ordering = ('name',)


@admin.register(SavingsType)
class SavingsTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)
    ordering = ('name',)


@admin.register(PayslipType)
class PayslipTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)
    ordering = ('name',)


@admin.register(OfficeFinanceRate)
class OfficeFinanceRateAdmin(admin.ModelAdmin):
    list_display = (
        'office',
        'ojt_rate',
        'allowance_day',
        'nd_rate',
        'nd_ot_rate',
        'regular_ot_rate',
        'rest_day_ot_rate',
        'legal_holiday_rate',
        'saturday_off_rate',
    )
    search_fields = ('office__name',)
    list_select_related = ('office',)


@admin.register(Allowance)
class AllowanceAdmin(admin.ModelAdmin):
    list_display = ('employee', 'allowance_type', 'amount', 'deposited_date', 'covered_period')
    list_filter = ('allowance_type', 'created_at')
    search_fields = ('employee__username', 'employee__first_name', 'employee__last_name', 'description')
    date_hierarchy = 'created_at'
    raw_id_fields = ('employee', 'allowance_type')


@admin.register(Loan)
class LoanAdmin(admin.ModelAdmin):

    class DeductionInline(admin.TabularInline):
        model = Deduction
        extra = 0
        can_delete = False
        fields = ('cutoff_date', 'amount', 'description', 'created_at')
        readonly_fields = ('cutoff_date', 'amount', 'description', 'created_at')
        ordering = ('-cutoff_date', '-created_at')
        verbose_name = 'Deduction'
        verbose_name_plural = 'Deductions'

        def has_add_permission(self, request, obj=None):
            return False

    inlines = [DeductionInline]
    list_display = ('employee', 'loan_type', 'principal_amount', 'current_balance', 'reference_number', 'created_at', 'updated_at')
    list_filter = ('loan_type', 'created_at', 'updated_at')
    search_fields = (
        'employee__username',
        'employee__first_name',
        'employee__last_name',
        'reference_number',
        'description',
    )
    date_hierarchy = 'created_at'
    raw_id_fields = ('employee', 'loan_type')


@admin.register(Savings)
class SavingsAdmin(admin.ModelAdmin):
    list_display = ('employee', 'savings_type', 'amount', 'withdraw', 'description', 'created_at')
    list_filter = ('savings_type', 'withdraw', 'created_at')
    search_fields = ('employee__username', 'employee__first_name', 'employee__last_name', 'description')
    date_hierarchy = 'created_at'
    raw_id_fields = ('employee', 'savings_type')


@admin.register(Payslip)
class PayslipAdmin(admin.ModelAdmin):
    list_display = ('employee', 'payslip_type', 'period_start', 'period_end', 'description', 'created_at')
    list_filter = ('payslip_type', 'period_start', 'period_end', 'created_at')
    search_fields = ('employee__username', 'employee__first_name', 'employee__last_name', 'description')
    date_hierarchy = 'created_at'
    raw_id_fields = ('employee', 'payslip_type')

