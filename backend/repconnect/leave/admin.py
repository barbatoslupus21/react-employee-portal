from django.contrib import admin
from django.core.exceptions import ValidationError
from django.utils.html import format_html

from .models import (
    LeaveApprovalStep,
    LeaveBalance,
    LeaveReason,
    LeaveRequest,
    LeaveRoutingRule,
    LeaveRoutingStep,
    LeaveSubreason,
    LeaveType,
    SundayExemption,
)


@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'has_balance', 'deductible', 'requires_clinic_approval', 'is_active')
    list_filter = ('is_active', 'has_balance', 'deductible', 'requires_clinic_approval')
    search_fields = ('name',)


class LeaveSubreasonInline(admin.TabularInline):
    model = LeaveSubreason
    extra = 0


@admin.register(LeaveReason)
class LeaveReasonAdmin(admin.ModelAdmin):
    list_display = ('title', 'leave_type_names')
    list_filter = ('leave_types',)
    search_fields = ('title',)
    inlines = [LeaveSubreasonInline]

    def leave_type_names(self, obj):
        return ', '.join(obj.leave_types.values_list('name', flat=True))
    leave_type_names.short_description = 'Leave Types'


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = ('employee', 'leave_type', 'period_start', 'period_end', 'entitled_leave', 'used_leave')
    list_filter = ('leave_type',)
    search_fields = ('employee__idnumber', 'employee__firstname', 'employee__lastname')


class LeaveApprovalStepInline(admin.TabularInline):
    model = LeaveApprovalStep
    extra = 0
    readonly_fields = ('sequence', 'role_group', 'approver')

    def get_readonly_fields(self, request, obj=None):
        readonly = ['sequence', 'role_group', 'approver']
        if not request.user.is_superuser:
            readonly.extend(['status', 'remarks', 'acted_by', 'acted_at'])
        return readonly


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ('control_number', 'employee', 'leave_type', 'date_start', 'date_end', 'status', 'created_at')
    list_filter = ('status', 'leave_type')
    search_fields = ('control_number', 'employee__idnumber', 'employee__firstname', 'employee__lastname')
    readonly_fields = ('control_number', 'date_prepared', 'manager_disapproved', 'hr_approved_at', 'created_at', 'updated_at')
    inlines = [LeaveApprovalStepInline]


@admin.register(SundayExemption)
class SundayExemptionAdmin(admin.ModelAdmin):
    list_display = ('date', 'reason')
    list_filter = ('date',)
    search_fields = ('reason',)
    ordering = ('date',)


# ── Leave Routing Rules ───────────────────────────────────────────────────────

class LeaveRoutingStepInline(admin.StackedInline):
    """
    Inline editor for the middle steps of a LeaveRoutingRule.

    Uses StackedInline (not TabularInline) so filter_horizontal renders
    properly for the target_positions M2M widget.
    """

    model = LeaveRoutingStep
    extra = 1
    fields = ('step_order', 'target_positions')
    filter_horizontal = ('target_positions',)
    ordering = ('step_order',)
    verbose_name = 'Middle Step'
    verbose_name_plural = 'Middle Steps (executed after Clinic/IAD, before HR)'
    min_num = 1  # Django admin minimum inline rows (UX hint — logic enforced below)


@admin.register(LeaveRoutingRule)
class LeaveRoutingRuleAdmin(admin.ModelAdmin):
    list_display = ('description', 'position_names', 'department_names', 'step_count', 'is_active', 'updated_at')
    list_filter = ('is_active', 'departments')
    search_fields = ('description', 'positions__name', 'departments__name')
    filter_horizontal = ('positions', 'departments')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [LeaveRoutingStepInline]
    fieldsets = (
        (None, {
            'fields': ('description', 'positions', 'departments', 'is_active'),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    # ── list display helpers ──────────────────────────────────────────────────

    def position_names(self, obj):
        names = list(obj.positions.values_list('name', flat=True))
        if not names:
            return format_html('<span style="color:red;">— none —</span>')
        return ', '.join(names)
    position_names.short_description = 'Applies to Positions'

    def department_names(self, obj):
        names = list(obj.departments.values_list('name', flat=True))
        if not names:
            return format_html('<span style="color:gray;">All departments</span>')
        return ', '.join(names)
    department_names.short_description = 'Applies to Departments'

    def step_count(self, obj):
        count = obj.steps.count()
        color = 'red' if count == 0 else 'inherit'
        return format_html('<span style="color:{};">{}</span>', color, count)
    step_count.short_description = '# Steps'

    # ── validation ────────────────────────────────────────────────────────────

    def _check_position_department_overlap(self, request, obj):
        """
        Ensure no other active rule creates an ambiguous (position, department)
        match with this rule.

        Overlap exists when:
          • Rules share at least one position, AND
          • Either rule has no departments (applies to all departments) OR they
            share at least one department.
        """
        my_position_ids = set(obj.positions.values_list('id', flat=True))
        if not my_position_ids:
            return []

        my_dept_ids = set(obj.departments.values_list('id', flat=True))

        other_active = (
            LeaveRoutingRule.objects
            .filter(is_active=True)
            .exclude(pk=obj.pk)
            .prefetch_related('positions', 'departments')
        )
        conflicts = []
        for other in other_active:
            overlap_positions = my_position_ids & set(
                other.positions.values_list('id', flat=True)
            )
            if not overlap_positions:
                continue

            other_dept_ids = set(other.departments.values_list('id', flat=True))
            either_is_global = (not my_dept_ids) or (not other_dept_ids)
            shared_depts = my_dept_ids & other_dept_ids

            if either_is_global or shared_depts:
                pos_names = ', '.join(
                    obj.positions.filter(id__in=overlap_positions)
                    .values_list('name', flat=True)
                )
                conflicts.append(
                    f'Position(s) "{pos_names}" already covered by active rule '
                    f'"{other.description}" with overlapping department scope.'
                )
        return conflicts

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)

    def save_related(self, request, form, formsets, change):
        """
        Called after M2M and inline formsets are saved.
        Validate position/department overlap and step integrity here.
        """
        super().save_related(request, form, formsets, change)
        obj = form.instance

        errors = []

        # 1. Position + department overlap check (only for active rules)
        if obj.is_active:
            errors.extend(self._check_position_department_overlap(request, obj))

        # 2. At least 1 position must be assigned
        if not obj.positions.exists():
            errors.append('At least one requestor position must be assigned to this rule.')

        # 3. At least 1 step must exist with at least 1 target position each
        steps = list(obj.steps.prefetch_related('target_positions').order_by('step_order'))
        if len(steps) < 1:
            errors.append(
                'A routing rule must have at least 1 middle step. '
                'Add a step with one or more target positions.'
            )
        else:
            for step in steps:
                if not step.target_positions.exists():
                    errors.append(
                        f'Step {step.step_order} has no target positions. '
                        'Each step must target at least one position.'
                    )

        if errors:
            # Surface errors to the admin UI and roll back the save via a flag.
            # Django admin does not support post-save rollback directly, so we
            # display the errors as messages so the admin can correct them.
            from django.contrib import messages
            for error in errors:
                messages.error(request, error)

    # ── queryset optimisation ─────────────────────────────────────────────────

    def get_queryset(self, request):
        return (
            super()
            .get_queryset(request)
            .prefetch_related('positions', 'departments', 'steps')
        )



