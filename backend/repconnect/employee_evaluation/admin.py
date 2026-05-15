from django.contrib import admin
from django.utils.html import format_html, mark_safe, conditional_escape

from employee_evaluation.models import (
    EvaluationSettings,
    EvaluationPeriod,
    EmployeeTasklist,
    EmployeeTask,
    EvaluationEntry,
    EvaluationScore,
    EvaluationApprovalStep,
    SupervisorEvaluationEE,
)


# ── EvaluationSettings (singleton) ────────────────────────────────────────────

@admin.register(EvaluationSettings)
class EvaluationSettingsAdmin(admin.ModelAdmin):
    """Only one EvaluationSettings row is allowed (singleton pattern)."""

    fields = ('frequency',)

    def has_add_permission(self, request):
        return not EvaluationSettings.objects.exists()


# ── EvaluationPeriod ──────────────────────────────────────────────────────────

@admin.register(EvaluationPeriod)
class EvaluationPeriodAdmin(admin.ModelAdmin):
    list_display  = ('title', 'fiscal_year', 'start_date', 'end_date', 'frequency', 'status_badge', 'created_at')
    list_filter   = ('status', 'frequency', 'fiscal_year')
    search_fields = ('title',)
    readonly_fields = ('title', 'fiscal_year', 'start_date', 'frequency', 'created_at')
    fields = ('title', 'fiscal_year', 'frequency', 'start_date', 'end_date', 'status', 'created_at')
    actions = ['mark_closed', 'mark_active']

    @admin.display(description='Status')
    def status_badge(self, obj):
        color = '#22c55e' if obj.status == 'active' else '#ef4444'
        return format_html(
            '<span style="color:{};font-weight:600">{}</span>',
            color, obj.get_status_display(),
        )

    def get_readonly_fields(self, request, obj=None):
        if obj is not None:
            return ('title', 'fiscal_year', 'start_date', 'frequency', 'created_at')
        return ('frequency', 'created_at')

    def get_changeform_initial_data(self, request):
        initial = super().get_changeform_initial_data(request)
        settings_obj = EvaluationSettings.objects.first()
        if settings_obj:
            initial['frequency'] = settings_obj.frequency
        return initial

    def save_model(self, request, obj, form, change):
        if not change:
            settings_obj = EvaluationSettings.objects.first()
            if settings_obj:
                obj.frequency = settings_obj.frequency
        super().save_model(request, obj, form, change)

    @admin.action(description='Mark selected periods as Closed')
    def mark_closed(self, request, queryset):
        queryset.update(status='closed')

    @admin.action(description='Mark selected periods as Active')
    def mark_active(self, request, queryset):
        queryset.update(status='active')


# ── EmployeeTasklist ───────────────────────────────────────────────────────────

class EmployeeTaskInline(admin.TabularInline):
    model    = EmployeeTask
    extra    = 1
    fields   = ('name', 'order')
    ordering = ('order',)


@admin.register(EmployeeTasklist)
class EmployeeTasklistAdmin(admin.ModelAdmin):
    list_display  = ('employee', 'task_count', 'updated_at')
    search_fields = ('employee__first_name', 'employee__last_name', 'employee__username')
    raw_id_fields = ('employee',)
    inlines       = [EmployeeTaskInline]

    @admin.display(description='Tasks')
    def task_count(self, obj):
        return obj.tasks.count()


# ── EvaluationScore inline ────────────────────────────────────────────────────

class EvaluationScoreInline(admin.TabularInline):
    model          = EvaluationScore
    extra          = 0
    fields         = ('task_name', 'period_label', 'score', 'task')
    readonly_fields = ('task',)
    ordering       = ('task_name', 'period_label')
    can_delete     = True

    def has_add_permission(self, request, obj=None):
        return False


# ── Approval-step inline (includes supervisor evaluation fields) ───────────────

class EvaluationApprovalStepInline(admin.StackedInline):
    model          = EvaluationApprovalStep
    extra          = 0
    can_delete     = True
    show_change_link = False
    readonly_fields = (
        'approver', 'sequence', 'status', 'acted_at', 'activated_at',
        'final_action', 'final_remarks',
        # Supervisor evaluation (displayed as read-only computed fields)
        'sv_strengths', 'sv_weaknesses', 'sv_training_required',
        'sv_supervisor_comments', 'sv_employee_comments',
        'sv_cost_consciousness', 'sv_cost_consciousness_comment',
        'sv_dependability', 'sv_dependability_comment',
        'sv_communication', 'sv_communication_comment',
        'sv_work_ethics', 'sv_work_ethics_comment',
        'sv_attendance', 'sv_attendance_comment',
        'sv_is_complete', 'sv_submitted_at',
    )

    # ── Helper ──────────────────────────────────────────────────────────────
    def _sv(self, obj):
        try:
            return obj.supervisor_evaluation
        except SupervisorEvaluationEE.DoesNotExist:
            return None

    # ── Supervisor evaluation field proxies ─────────────────────────────────
    @admin.display(description='Strengths')
    def sv_strengths(self, obj):
        sv = self._sv(obj)
        return sv.strengths if sv else '—'

    @admin.display(description='Weaknesses')
    def sv_weaknesses(self, obj):
        sv = self._sv(obj)
        return sv.weaknesses if sv else '—'

    @admin.display(description='Training Required')
    def sv_training_required(self, obj):
        sv = self._sv(obj)
        return sv.training_required if sv else '—'

    @admin.display(description='Supervisor Comments')
    def sv_supervisor_comments(self, obj):
        sv = self._sv(obj)
        return sv.supervisor_comments if sv else '—'

    @admin.display(description='Employee Comments')
    def sv_employee_comments(self, obj):
        sv = self._sv(obj)
        return sv.employee_comments if sv else '—'

    @admin.display(description='Cost Consciousness (1–5)')
    def sv_cost_consciousness(self, obj):
        sv = self._sv(obj)
        return sv.cost_consciousness if sv else '—'

    @admin.display(description='Cost Consciousness Comment')
    def sv_cost_consciousness_comment(self, obj):
        sv = self._sv(obj)
        return sv.cost_consciousness_comment if sv else '—'

    @admin.display(description='Dependability (1–5)')
    def sv_dependability(self, obj):
        sv = self._sv(obj)
        return sv.dependability if sv else '—'

    @admin.display(description='Dependability Comment')
    def sv_dependability_comment(self, obj):
        sv = self._sv(obj)
        return sv.dependability_comment if sv else '—'

    @admin.display(description='Communication (1–5)')
    def sv_communication(self, obj):
        sv = self._sv(obj)
        return sv.communication if sv else '—'

    @admin.display(description='Communication Comment')
    def sv_communication_comment(self, obj):
        sv = self._sv(obj)
        return sv.communication_comment if sv else '—'

    @admin.display(description='Work Ethics (1–5)')
    def sv_work_ethics(self, obj):
        sv = self._sv(obj)
        return sv.work_ethics if sv else '—'

    @admin.display(description='Work Ethics Comment')
    def sv_work_ethics_comment(self, obj):
        sv = self._sv(obj)
        return sv.work_ethics_comment if sv else '—'

    @admin.display(description='Attendance (1–5)')
    def sv_attendance(self, obj):
        sv = self._sv(obj)
        return sv.attendance if sv else '—'

    @admin.display(description='Attendance Comment')
    def sv_attendance_comment(self, obj):
        sv = self._sv(obj)
        return sv.attendance_comment if sv else '—'

    @admin.display(description='Supervisor Eval Complete?', boolean=True)
    def sv_is_complete(self, obj):
        sv = self._sv(obj)
        return sv.is_complete if sv else False

    @admin.display(description='Supervisor Eval Submitted At')
    def sv_submitted_at(self, obj):
        sv = self._sv(obj)
        return sv.submitted_at if sv else '—'


# ── EvaluationEntry (combined: scores + approval steps + supervisor eval) ──────

@admin.register(EvaluationEntry)
class EvaluationEntryAdmin(admin.ModelAdmin):
    list_display  = ('employee', 'evaluation_period', 'status', 'submitted_at', 'created_at')
    list_filter   = ('status', 'evaluation_period')
    search_fields = ('employee__first_name', 'employee__last_name', 'employee__username')
    readonly_fields = (
        'employee', 'evaluation_period', 'status', 'submitted_at',
        'confirmed_at', 'confirmed_by', 'created_at', 'updated_at',
        'score_table_display',
    )
    inlines = [EvaluationApprovalStepInline]

    def has_add_permission(self, request):
        return False

    @admin.display(description='Performance Scores')
    def score_table_display(self, obj):
        """Render evaluation scores as a structured HTML table (task × period_label)."""
        from employee_evaluation.views import _build_period_labels

        scores = obj.scores.select_related('task').order_by('task_name', 'period_label')
        if not scores.exists():
            return mark_safe('<em style="color:#888">No scores recorded.</em>')

        # Build task_name → period_label → score mapping
        score_map: dict = {}
        present_labels: list = []
        for s in scores:
            if s.task_name not in score_map:
                score_map[s.task_name] = {}
            score_map[s.task_name][s.period_label] = s.score
            if s.period_label not in present_labels:
                present_labels.append(s.period_label)

        # Preserve canonical period ordering (Q1/Q2/…, Jan/Feb/…, Wk1/…)
        if obj.evaluation_period:
            all_labels = _build_period_labels(obj.evaluation_period.frequency)
            ordered_labels = [l for l in all_labels if l in present_labels]
        else:
            ordered_labels = present_labels

        TH  = 'border:1px solid #d0d0d0;padding:5px 10px;background:#f2f4f8;font-weight:600;text-align:center;white-space:nowrap;font-size:12px'
        TH_TASK = 'border:1px solid #d0d0d0;padding:5px 10px;background:#f2f4f8;font-weight:600;text-align:left;min-width:220px;font-size:12px'
        TD  = 'border:1px solid #d0d0d0;padding:5px 10px;text-align:center;font-size:12px'
        TD_TASK = 'border:1px solid #d0d0d0;padding:5px 10px;text-align:left;font-size:12px'

        header_cells = ''.join(
            f'<th style="{TH}">{conditional_escape(label)}</th>'
            for label in ordered_labels
        )

        body_rows = []
        for task_name, cell_scores in score_map.items():
            data_cells = ''.join(
                f'<td style="{TD}">{conditional_escape(str(cell_scores.get(label, "—")))}</td>'
                for label in ordered_labels
            )
            body_rows.append(
                f'<tr><td style="{TD_TASK}">{conditional_escape(task_name)}</td>{data_cells}</tr>'
            )

        html = (
            f'<div style="overflow-x:auto;margin-top:4px">'
            f'<table style="border-collapse:collapse;width:100%;font-size:12px">'
            f'<thead><tr><th style="{TH_TASK}">Task</th>{header_cells}</tr></thead>'
            f'<tbody>{chr(10).join(body_rows)}</tbody>'
            f'</table></div>'
        )
        return mark_safe(html)
