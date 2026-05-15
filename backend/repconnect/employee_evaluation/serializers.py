"""Serializers for the Employee Evaluation module."""
from __future__ import annotations

from rest_framework import serializers

from employee_evaluation.models import (
    EvaluationSettings,
    EvaluationPeriod,
    EmployeeTasklist,
    EmployeeTask,
    EvaluationEntry,
    EvaluationScore,
    EvaluationApprovalStep,
    SupervisorEvaluationEE,
    EvaluationTrainingRequest,
    EvaluationTimelineEntry,
)


# ── Settings ───────────────────────────────────────────────────────────────────

class EvaluationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EvaluationSettings
        fields = ['id', 'frequency']


# ── Period ─────────────────────────────────────────────────────────────────────

class EvaluationPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EvaluationPeriod
        fields = [
            'id', 'title', 'fiscal_year', 'start_date', 'end_date',
            'status', 'frequency', 'created_at',
        ]
        read_only_fields = ['id', 'title', 'fiscal_year', 'start_date', 'frequency', 'created_at']


class EvaluationPeriodWriteSerializer(serializers.ModelSerializer):
    """Used when admin patches only end_date or status."""
    class Meta:
        model  = EvaluationPeriod
        fields = ['end_date', 'status']


# ── Task ───────────────────────────────────────────────────────────────────────

class EmployeeTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EmployeeTask
        fields = ['id', 'name', 'order']


# ── Tasklist ───────────────────────────────────────────────────────────────────

class EmployeeTasklistSerializer(serializers.ModelSerializer):
    tasks      = EmployeeTaskSerializer(many=True, read_only=True)
    task_count = serializers.IntegerField(read_only=True)
    employee_id_number = serializers.SerializerMethodField()
    employee_name      = serializers.SerializerMethodField()
    department         = serializers.SerializerMethodField()

    class Meta:
        model  = EmployeeTasklist
        fields = [
            'id', 'employee', 'employee_id_number', 'employee_name',
            'department', 'tasks', 'task_count',
            'created_at', 'updated_at',
        ]

    def get_employee_id_number(self, obj):
        return getattr(obj.employee, 'id_number', None) or getattr(obj.employee, 'username', '')

    def get_employee_name(self, obj):
        return obj.employee.get_full_name() or obj.employee.username

    def get_department(self, obj):
        from userProfile.models import workInformation
        work = workInformation.objects.filter(employee=obj.employee).select_related('department').first()
        return work.department.name if (work and work.department) else ''


class EmployeeTasklistAdminListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for admin tasklist table (no nested tasks)."""
    employee_id_number = serializers.SerializerMethodField()
    employee_name      = serializers.SerializerMethodField()
    department         = serializers.SerializerMethodField()
    task_count         = serializers.IntegerField(read_only=True)

    class Meta:
        model  = EmployeeTasklist
        fields = [
            'id', 'employee', 'employee_id_number', 'employee_name',
            'department', 'task_count', 'updated_at',
        ]

    def get_employee_id_number(self, obj):
        return getattr(obj.employee, 'id_number', None) or getattr(obj.employee, 'username', '')

    def get_employee_name(self, obj):
        first = getattr(obj.employee, 'firstname', None) or getattr(obj.employee, 'first_name', '')
        last = getattr(obj.employee, 'lastname', None) or getattr(obj.employee, 'last_name', '')
        name = f'{last}, {first}'.strip(', ')
        if name:
            return name
        return getattr(obj.employee, 'idnumber', None) or getattr(obj.employee, 'username', '')

    def get_department(self, obj):
        from userProfile.models import workInformation
        work = workInformation.objects.filter(employee=obj.employee).select_related('department').first()
        return work.department.name if (work and work.department) else ''


class EmployeeTasklistUserAdminListSerializer(serializers.Serializer):
    """Lightweight admin tasklist row serializer for user-based listings."""
    employee = serializers.IntegerField(source='id')
    employee_id_number = serializers.SerializerMethodField()
    employee_name = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    task_count = serializers.IntegerField()
    updated_at = serializers.DateTimeField(allow_null=True)

    def get_employee_id_number(self, obj):
        return getattr(obj, 'id_number', None) or getattr(obj, 'username', '')

    def get_employee_name(self, obj):
        first = getattr(obj, 'firstname', None) or getattr(obj, 'first_name', '')
        last = getattr(obj, 'lastname', None) or getattr(obj, 'last_name', '')
        name = f'{last}, {first}'.strip(', ')
        if name:
            return name
        return getattr(obj, 'idnumber', None) or getattr(obj, 'username', '')

    def get_department(self, obj):
        from userProfile.models import workInformation
        work = workInformation.objects.filter(employee=obj).select_related('department').first()
        return work.department.name if (work and work.department) else ''


# ── Score ──────────────────────────────────────────────────────────────────────

class EvaluationScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EvaluationScore
        fields = ['id', 'task', 'task_name', 'period_label', 'score']


class EvaluationScoreSaveSerializer(serializers.Serializer):
    """Used for bulk upsert of score cells."""
    task_name    = serializers.CharField(max_length=300)
    period_label = serializers.CharField(max_length=20)
    score        = serializers.DecimalField(
        max_digits=5, decimal_places=2, allow_null=True, required=False
    )


# ── Approval Step ──────────────────────────────────────────────────────────────

class EvaluationApprovalStepSerializer(serializers.ModelSerializer):
    approver_name = serializers.SerializerMethodField()

    class Meta:
        model  = EvaluationApprovalStep
        fields = [
            'id', 'entry', 'approver', 'approver_name', 'sequence',
            'status', 'acted_at', 'activated_at', 'final_action', 'final_remarks',
        ]

    def get_approver_name(self, obj):
        if not obj.approver:
            return None
        first = getattr(obj.approver, 'firstname', None) or getattr(obj.approver, 'first_name', '') or ''
        last = getattr(obj.approver, 'lastname', None) or getattr(obj.approver, 'last_name', '') or ''
        first = first.strip()
        last = last.strip()
        if last and first:
            return f'{last}, {first}'
        if last:
            return last
        if first:
            return first
        username = getattr(obj.approver, 'username', '') or ''
        return username or None


# ── Supervisor Evaluation EE ───────────────────────────────────────────────────

class SupervisorEvaluationEESerializer(serializers.ModelSerializer):
    class Meta:
        model  = SupervisorEvaluationEE
        fields = [
            'id', 'step',
            'strengths_q1', 'strengths_q2', 'strengths_q3', 'strengths_q4',
            'weaknesses_q1', 'weaknesses_q2', 'weaknesses_q3', 'weaknesses_q4',
            'training_required_q1', 'training_required_q2', 'training_required_q3', 'training_required_q4',
            'supervisor_comments_q1', 'supervisor_comments_q2', 'supervisor_comments_q3', 'supervisor_comments_q4',
            'employee_comments_q1', 'employee_comments_q2', 'employee_comments_q3', 'employee_comments_q4',
            'cost_consciousness_q1', 'cost_consciousness_q2', 'cost_consciousness_q3', 'cost_consciousness_q4',
            'dependability_q1', 'dependability_q2', 'dependability_q3', 'dependability_q4',
            'communication_q1', 'communication_q2', 'communication_q3', 'communication_q4',
            'work_ethics_q1', 'work_ethics_q2', 'work_ethics_q3', 'work_ethics_q4',
            'attendance_q1', 'attendance_q2', 'attendance_q3', 'attendance_q4',
            'quality_comments', 'supervisor_scores', 'is_complete', 'submitted_at',
        ]
        read_only_fields = ['id', 'step', 'is_complete', 'submitted_at']


class SupervisorEvaluationEESubmitSerializer(serializers.ModelSerializer):
    """Validates all required rating fields (at least Q1) before marking is_complete=True."""
    REQUIRED_RATING_FIELDS = [
        'cost_consciousness_q1', 'dependability_q1', 'communication_q1',
        'work_ethics_q1', 'attendance_q1',
    ]

    class Meta:
        model  = SupervisorEvaluationEE
        fields = [
            'strengths_q1', 'strengths_q2', 'strengths_q3', 'strengths_q4',
            'weaknesses_q1', 'weaknesses_q2', 'weaknesses_q3', 'weaknesses_q4',
            'training_required_q1', 'training_required_q2', 'training_required_q3', 'training_required_q4',
            'supervisor_comments_q1', 'supervisor_comments_q2', 'supervisor_comments_q3', 'supervisor_comments_q4',
            'employee_comments_q1', 'employee_comments_q2', 'employee_comments_q3', 'employee_comments_q4',
            'cost_consciousness_q1', 'cost_consciousness_q2', 'cost_consciousness_q3', 'cost_consciousness_q4',
            'dependability_q1', 'dependability_q2', 'dependability_q3', 'dependability_q4',
            'communication_q1', 'communication_q2', 'communication_q3', 'communication_q4',
            'work_ethics_q1', 'work_ethics_q2', 'work_ethics_q3', 'work_ethics_q4',
            'attendance_q1', 'attendance_q2', 'attendance_q3', 'attendance_q4',
            'quality_comments', 'supervisor_scores',
        ]

    def validate(self, attrs):
        for field in self.REQUIRED_RATING_FIELDS:
            if attrs.get(field) is None:
                raise serializers.ValidationError(
                    {field: 'This rating is required before submitting.'}
                )
        return attrs


# ── Entry (user-facing) ────────────────────────────────────────────────────────

class EvaluationEntrySerializer(serializers.ModelSerializer):
    scores = EvaluationScoreSerializer(many=True, read_only=True)
    approval_steps = EvaluationApprovalStepSerializer(many=True, read_only=True)
    supervisor_evaluation = serializers.SerializerMethodField()

    class Meta:
        model  = EvaluationEntry
        fields = [
            'id', 'employee', 'evaluation_period', 'status',
            'submitted_at', 'confirmed_at', 'created_at', 'updated_at',
            'scores', 'approval_steps', 'supervisor_evaluation',
        ]

    def get_supervisor_evaluation(self, obj):
        step1 = obj.approval_steps.filter(sequence=1).first()
        if step1 and hasattr(step1, 'supervisor_evaluation') and step1.supervisor_evaluation.is_complete:
            return SupervisorEvaluationEESerializer(step1.supervisor_evaluation).data
        return None


class EvaluationEntryAdminSerializer(serializers.ModelSerializer):
    """Used by admin list/chart endpoint."""
    employee_name = serializers.SerializerMethodField()
    period_title  = serializers.CharField(source='evaluation_period.title', read_only=True)

    class Meta:
        model  = EvaluationEntry
        fields = [
            'id', 'employee', 'employee_name', 'evaluation_period', 'period_title',
            'status', 'submitted_at', 'created_at',
        ]

    def get_employee_name(self, obj):
        return obj.employee.get_full_name() or obj.employee.username


def _build_period_labels(frequency: str) -> list:
    if frequency == 'quarterly':
        return ['Q1', 'Q2', 'Q3', 'Q4']
    if frequency == 'monthly':
        return ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr']
    if frequency == 'weekly':
        return [f'Wk{i}' for i in range(1, 53)]
    if frequency == 'yearly':
        return ['Year']
    return []


# ── Approver queue item ────────────────────────────────────────────────────────

class EvalApproverQueueItemSerializer(serializers.ModelSerializer):
    """Lightweight card data for the approver queue list."""
    employee_name      = serializers.SerializerMethodField()
    employee_id_number = serializers.SerializerMethodField()
    department         = serializers.SerializerMethodField()
    fiscal_year        = serializers.IntegerField(source='evaluation_period.fiscal_year', read_only=True)
    period_title       = serializers.CharField(source='evaluation_period.title', read_only=True)
    my_step_id         = serializers.SerializerMethodField()
    my_step_status     = serializers.SerializerMethodField()
    my_step_sequence   = serializers.SerializerMethodField()
    my_role            = serializers.SerializerMethodField()
    my_step_label      = serializers.SerializerMethodField()
    total_steps        = serializers.SerializerMethodField()

    class Meta:
        model  = EvaluationEntry
        fields = [
            'id', 'employee', 'employee_name', 'employee_id_number', 'department',
            'fiscal_year', 'period_title', 'status', 'submitted_at',
            'my_step_id', 'my_step_status', 'my_step_sequence', 'my_role',
            'my_step_label', 'total_steps',
        ]

    def _get_user_step(self, obj):
        user = self.context['request'].user
        steps = list(obj.approval_steps.all())
        active = [s for s in steps if s.approver_id == user.pk and s.status == 'pending' and s.activated_at]
        if active:
            return active[0]
        reviewed = [s for s in steps if s.approver_id == user.pk and s.status == 'reviewed']
        if reviewed:
            return reviewed[-1]
        return None

    def get_employee_name(self, obj):
        return obj.employee.get_full_name() or obj.employee.username

    def get_employee_id_number(self, obj):
        return getattr(obj.employee, 'id_number', None) or getattr(obj.employee, 'username', '')

    def get_department(self, obj):
        from userProfile.models import workInformation
        work = workInformation.objects.filter(employee=obj.employee).select_related('department').first()
        return work.department.name if (work and work.department) else ''

    def get_my_step_id(self, obj):
        step = self._get_user_step(obj)
        return step.pk if step else None

    def get_my_step_status(self, obj):
        step = self._get_user_step(obj)
        return step.status if step else None

    def get_my_step_sequence(self, obj):
        step = self._get_user_step(obj)
        return step.sequence if step else None

    def get_my_role(self, obj):
        step = self._get_user_step(obj)
        if not step:
            return None
        return 'supervisor' if step.sequence == 1 else 'final_approver'

    def get_my_step_label(self, obj):
        step = self._get_user_step(obj)
        if not step:
            return '—'
        if obj.status == 'returned':
            return 'Returned for Re-evaluation'
        if obj.status == 'completed':
            return 'Completed'
        if step.status == 'reviewed':
            return 'Reviewed'
        total = len(list(obj.approval_steps.all()))
        if step.sequence == 1:
            return '1st Approver Evaluation'
        elif step.sequence < total:
            return '2nd Approval'
        else:
            return 'Final Approval'

    def get_total_steps(self, obj):
        return len(list(obj.approval_steps.all()))


# ── Approver entry detail ──────────────────────────────────────────────────────

class EvalApproverEntryDetailSerializer(serializers.ModelSerializer):
    employee_name      = serializers.SerializerMethodField()
    employee_id_number = serializers.SerializerMethodField()
    department         = serializers.SerializerMethodField()
    period             = serializers.SerializerMethodField()
    period_labels      = serializers.SerializerMethodField()
    scores             = EvaluationScoreSerializer(many=True, read_only=True)
    approval_steps     = EvaluationApprovalStepSerializer(many=True, read_only=True)
    tasklist           = serializers.SerializerMethodField()
    my_step            = serializers.SerializerMethodField()
    my_role            = serializers.SerializerMethodField()
    can_act            = serializers.SerializerMethodField()
    supervisor_evaluation = serializers.SerializerMethodField()
    disapproval_remarks   = serializers.SerializerMethodField()

    class Meta:
        model  = EvaluationEntry
        fields = [
            'id', 'employee', 'employee_name', 'employee_id_number', 'department',
            'period', 'period_labels', 'status', 'submitted_at',
            'scores', 'approval_steps', 'tasklist',
            'my_step', 'my_role', 'can_act',
            'supervisor_evaluation', 'disapproval_remarks',
        ]

    def _get_user_step(self, obj):
        user = self.context['request'].user
        steps = list(obj.approval_steps.all())
        active = [s for s in steps if s.approver_id == user.pk and s.status == 'pending' and s.activated_at]
        if active:
            return active[0]
        reviewed = [s for s in steps if s.approver_id == user.pk and s.status == 'reviewed']
        if reviewed:
            return reviewed[-1]
        return None

    def get_employee_name(self, obj):
        return obj.employee.get_full_name() or obj.employee.username

    def get_employee_id_number(self, obj):
        return getattr(obj.employee, 'id_number', None) or getattr(obj.employee, 'username', '')

    def get_department(self, obj):
        from userProfile.models import workInformation
        work = workInformation.objects.filter(employee=obj.employee).select_related('department').first()
        return work.department.name if (work and work.department) else ''

    def get_period(self, obj):
        return EvaluationPeriodSerializer(obj.evaluation_period).data

    def get_period_labels(self, obj):
        return _build_period_labels(obj.evaluation_period.frequency)

    def get_tasklist(self, obj):
        try:
            tasklist = obj.employee.evaluation_tasklists
            return EmployeeTaskSerializer(tasklist.tasks.all(), many=True).data
        except Exception:
            return []

    def get_my_step(self, obj):
        step = self._get_user_step(obj)
        if not step:
            return None
        return EvaluationApprovalStepSerializer(step).data

    def get_my_role(self, obj):
        step = self._get_user_step(obj)
        if not step:
            return None
        return 'supervisor' if step.sequence == 1 else 'final_approver'

    def get_can_act(self, obj):
        from employee_evaluation.routing import can_act_on_evaluation_step
        step = self._get_user_step(obj)
        if not step:
            return False
        user = self.context['request'].user
        return can_act_on_evaluation_step(step, user)

    def get_supervisor_evaluation(self, obj):
        steps = list(obj.approval_steps.all())
        step1 = next((s for s in steps if s.sequence == 1), None)
        if not step1:
            return None
        try:
            ev = step1.supervisor_evaluation
            return SupervisorEvaluationEESerializer(ev).data
        except Exception:
            return None

    def get_disapproval_remarks(self, obj):
        steps = list(obj.approval_steps.all())
        for step in reversed(steps):
            if step.final_action == 'disapproved' and step.final_remarks:
                return step.final_remarks
        return ''


# ── My evaluation (user self-eval) ────────────────────────────────────────────

class MyEvaluationSerializer(serializers.Serializer):
    """Composite response for the self-evaluation page."""
    period       = EvaluationPeriodSerializer()
    entry        = EvaluationEntrySerializer(allow_null=True)
    tasklist     = serializers.SerializerMethodField()
    period_labels = serializers.ListField(child=serializers.CharField())

    def get_tasklist(self, obj):
        tasklist = obj.get('tasklist')
        if tasklist is None:
            return []
        return EmployeeTaskSerializer(tasklist.tasks.all(), many=True).data


# ── Training Request ───────────────────────────────────────────────────────────

class EvaluationTrainingRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EvaluationTrainingRequest
        fields = ['id', 'quarter', 'title', 'objective', 'preferred_date', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


# ── Timeline ───────────────────────────────────────────────────────────────────

class EvaluationTimelineEntrySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model  = EvaluationTimelineEntry
        fields = [
            'id', 'entry', 'actor', 'actor_name',
            'action_type', 'remarks', 'acted_at', 'step_order',
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if not obj.actor:
            return None
        first = getattr(obj.actor, 'firstname', None) or getattr(obj.actor, 'first_name', '') or ''
        last  = getattr(obj.actor, 'lastname',  None) or getattr(obj.actor, 'last_name',  '') or ''
        first = first.strip()
        last  = last.strip()
        if last and first:
            return f'{last}, {first}'
        return last or first or getattr(obj.actor, 'username', None) or None
