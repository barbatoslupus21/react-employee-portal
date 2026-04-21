from django.contrib import admin
from .models import PRFRequest, EmergencyLoan, MedicineAllowance


class EmergencyLoanInline(admin.StackedInline):
    model = EmergencyLoan
    extra = 0
    readonly_fields = ('deduction_per_cutoff', 'formatted_starting_date', 'created_at', 'updated_at')
    fields = (
        'amount', 'number_of_cutoff', 'starting_date',
        'deduction_per_cutoff', 'employee_full_name',
        'created_at', 'updated_at',
    )
    can_delete = False


class MedicineAllowanceInline(admin.StackedInline):
    model = MedicineAllowance
    extra = 0
    readonly_fields = ('coverage_period', 'formatted_amount', 'created_at', 'updated_at')
    fields = (
        'start_date', 'end_date', 'amount',
        'coverage_period',
        'created_at', 'updated_at',
    )
    can_delete = False


@admin.register(PRFRequest)
class PRFRequestAdmin(admin.ModelAdmin):
    list_display = (
        'prf_control_number', 'employee', 'prf_category',
        'prf_type', 'status', 'created_at',
    )
    list_filter = ('status', 'prf_category', 'prf_type')
    search_fields = ('prf_control_number', 'employee__username', 'purpose', 'control_number')
    ordering = ('-created_at',)
    readonly_fields = ('prf_control_number', 'created_at', 'updated_at')
    list_select_related = ('employee', 'processed_by')
    date_hierarchy = 'created_at'
    inlines = [EmergencyLoanInline, MedicineAllowanceInline]

    fieldsets = (
        ('Request Info', {
            'fields': (
                'prf_control_number', 'employee',
                'prf_category', 'prf_type',
                'purpose', 'control_number',
            ),
        }),
        ('Status', {
            'fields': ('status', 'admin_remarks', 'processed_by'),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )


@admin.register(EmergencyLoan)
class EmergencyLoanAdmin(admin.ModelAdmin):
    list_display = (
        'prf_request', 'amount', 'number_of_cutoff',
        'deduction_per_cutoff', 'starting_date', 'employee_full_name', 'created_at',
    )
    list_filter = ('amount',)
    search_fields = (
        'prf_request__prf_control_number',
        'prf_request__employee__username',
        'employee_full_name',
    )
    ordering = ('-created_at',)
    readonly_fields = ('deduction_per_cutoff', 'formatted_starting_date', 'created_at', 'updated_at')
    list_select_related = ('prf_request', 'prf_request__employee')
    date_hierarchy = 'created_at'


@admin.register(MedicineAllowance)
class MedicineAllowanceAdmin(admin.ModelAdmin):
    list_display = (
        'prf_request', 'amount', 'coverage_period', 'start_date', 'end_date', 'created_at',
    )
    list_filter = ('start_date', 'end_date')
    search_fields = (
        'prf_request__prf_control_number',
        'prf_request__employee__username',
    )
    ordering = ('-created_at',)
    readonly_fields = ('coverage_period', 'formatted_amount', 'created_at', 'updated_at')
    list_select_related = ('prf_request', 'prf_request__employee')
    date_hierarchy = 'created_at'
