"""Serializers for the Training Evaluation module."""
from __future__ import annotations

import re
from rest_framework import serializers
from django.utils import timezone

from training.models import (
    Training,
    TrainingQuestion,
    TrainingQuestionOption,
    TrainingQuestionRatingConfig,
    TrainingParticipant,
    TrainingSubmission,
    TrainingAnswer,
    TrainingApprovalStep,
    SupervisorEvaluation,
)

_BLOCKED_CHARS_RE = re.compile(r'[<>{}\[\]\\|^~`"]')


def _validate_safe_text(value: str, field_name: str, max_length: int) -> str:
    value = value.strip()
    if not value:
        raise serializers.ValidationError(f'{field_name} cannot be blank.')
    if _BLOCKED_CHARS_RE.search(value):
        raise serializers.ValidationError(
            'Special characters like < > { } [ ] \\ | ^ ~ ` " are not allowed.'
        )
    if len(value) > max_length:
        raise serializers.ValidationError(f'{field_name} cannot exceed {max_length} characters.')
    return value


# ── Option ────────────────────────────────────────────────────────────────────

class TrainingQuestionOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingQuestionOption
        fields = ('id', 'option_text', 'order')


# ── Rating config ─────────────────────────────────────────────────────────────

class TrainingQuestionRatingConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingQuestionRatingConfig
        fields = ('min_value', 'max_value', 'min_label', 'max_label')


# ── Question ──────────────────────────────────────────────────────────────────

class TrainingQuestionSerializer(serializers.ModelSerializer):
    options = TrainingQuestionOptionSerializer(many=True, read_only=True)
    rating_config = TrainingQuestionRatingConfigSerializer(read_only=True)

    class Meta:
        model = TrainingQuestion
        fields = (
            'id', 'question_text', 'question_type', 'order',
            'is_required', 'allow_other', 'options', 'rating_config',
        )


# ── Training list ─────────────────────────────────────────────────────────────

class TrainingListSerializer(serializers.ModelSerializer):
    submitted_count = serializers.IntegerField(read_only=True)
    total_participants = serializers.IntegerField(read_only=True)
    created_by_id = serializers.SerializerMethodField()

    def get_created_by_id(self, obj):
        return obj.created_by_id

    class Meta:
        model = Training
        fields = (
            'id', 'title', 'speaker', 'training_date', 'objective',
            'target_type', 'created_by_id', 'created_at',
            'submitted_count', 'total_participants',
        )


# ── Training detail ────────────────────────────────────────────────────────────

class TrainingDetailSerializer(serializers.ModelSerializer):
    questions = TrainingQuestionSerializer(many=True, read_only=True)
    target_user_ids = serializers.SerializerMethodField()
    template_id = serializers.SerializerMethodField()

    def get_target_user_ids(self, obj):
        if obj.target_type == 'specific_users':
            return list(obj.participants.values_list('user_id', flat=True))
        return []

    def get_template_id(self, obj):
        return obj.template_id

    class Meta:
        model = Training
        fields = (
            'id', 'title', 'speaker', 'training_date', 'objective',
            'target_type', 'template_id', 'target_user_ids',
            'created_by_id', 'created_at', 'questions',
        )


# ── Training write ─────────────────────────────────────────────────────────────

class TrainingWriteSerializer(serializers.ModelSerializer):
    target_user_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False, default=list
    )
    template_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Training
        fields = ('title', 'speaker', 'training_date', 'objective', 'target_type', 'target_user_ids', 'template_id')

    def validate_title(self, value):
        return _validate_safe_text(value, 'Title', 200)

    def validate_speaker(self, value):
        return _validate_safe_text(value, 'Speaker', 200)

    def validate_objective(self, value):
        if value:
            return _validate_safe_text(value, 'Objective', 1000)
        return value

    def validate(self, attrs):
        if attrs.get('target_type') == 'specific_users':
            if not attrs.get('target_user_ids'):
                raise serializers.ValidationError({'target_user_ids': 'At least one participant is required for specific_users target type.'})
        return attrs


# ── Participant ────────────────────────────────────────────────────────────────

class TrainingParticipantSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingParticipant
        fields = ('id', 'user_id', 'is_seen')


# ── My training (user-facing list) ────────────────────────────────────────────

class MyTrainingSerializer(serializers.ModelSerializer):
    is_seen = serializers.SerializerMethodField()
    is_complete = serializers.SerializerMethodField()
    submission_id = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    requires_action = serializers.SerializerMethodField()

    def _get_participant(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        # Cached via context to avoid N+1
        pmap = self.context.get('participant_map', {})
        return pmap.get(obj.pk)

    def _get_submission(self, obj):
        smap = self.context.get('submission_map', {})
        return smap.get(obj.pk)

    def get_is_seen(self, obj):
        p = self._get_participant(obj)
        return p.is_seen if p else True

    def get_is_complete(self, obj):
        s = self._get_submission(obj)
        return bool(s and s.is_complete)

    def get_submission_id(self, obj):
        s = self._get_submission(obj)
        return s.pk if s else None

    def get_status(self, obj):
        s = self._get_submission(obj)
        return s.status if s else None

    def get_requires_action(self, obj):
        s = self._get_submission(obj)
        return s.status == 'user_confirmation' if s else False

    class Meta:
        model = Training
        fields = ('id', 'title', 'speaker', 'training_date', 'objective', 'is_seen', 'is_complete', 'submission_id', 'status', 'requires_action')


# ── Training answer ────────────────────────────────────────────────────────────

class TrainingAnswerSerializer(serializers.ModelSerializer):
    selected_option_ids = serializers.PrimaryKeyRelatedField(
        queryset=TrainingQuestionOption.objects.all(),
        many=True, write_only=True, required=False, default=list,
        source='selected_options',
    )
    selected_options = TrainingQuestionOptionSerializer(many=True, read_only=True)

    class Meta:
        model = TrainingAnswer
        fields = (
            'id', 'question_id', 'text_value', 'number_value',
            'selected_option_ids', 'selected_options', 'other_text',
        )

    def validate_text_value(self, v):
        if v and len(v) > 5000:
            raise serializers.ValidationError('Response cannot exceed 5000 characters.')
        return v

    def validate_other_text(self, v):
        if v and len(v) > 500:
            raise serializers.ValidationError('Other text cannot exceed 500 characters.')
        return v


# ── Submission ─────────────────────────────────────────────────────────────────

class TrainingSubmissionSerializer(serializers.ModelSerializer):
    answers = TrainingAnswerSerializer(many=True, read_only=True)

    class Meta:
        model = TrainingSubmission
        fields = ('id', 'training_id', 'submitted_by_id', 'is_complete', 'submitted_at', 'status', 'answers')


# ── Approval step ─────────────────────────────────────────────────────────────

class TrainingApprovalStepSerializer(serializers.ModelSerializer):
    approver_name = serializers.SerializerMethodField()
    approver_position = serializers.SerializerMethodField()

    def _approver_work(self, approver):
        from userProfile.models import workInformation
        return workInformation.objects.select_related('position').filter(employee=approver).first()

    def get_approver_name(self, obj):
        if not obj.approver:
            return None
        u = obj.approver
        name = f'{u.lastname or ""}, {u.firstname or ""}'.strip(', ') or u.idnumber
        return name

    def get_approver_position(self, obj):
        if not obj.approver:
            return None
        wi = self._approver_work(obj.approver)
        return wi.position.name if wi and wi.position else None

    class Meta:
        model = TrainingApprovalStep
        fields = ('id', 'sequence', 'status', 'approver_name', 'approver_position', 'acted_at', 'activated_at')


# ── Supervisor evaluation ──────────────────────────────────────────────────────

class SupervisorEvaluationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupervisorEvaluation
        fields = ('result_and_impact', 'recommendation', 'overall_assessment', 'is_complete', 'submitted_at')


# ── Approver queue item ────────────────────────────────────────────────────────

class ApproverQueueItemSerializer(serializers.ModelSerializer):
    """Approver-facing view of a submission awaiting their evaluation."""
    employee_name = serializers.SerializerMethodField()
    employee_idnumber = serializers.SerializerMethodField()
    training_title = serializers.SerializerMethodField()
    training_date = serializers.SerializerMethodField()
    speaker = serializers.SerializerMethodField()
    my_step_id = serializers.SerializerMethodField()
    my_step_status = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()
    evaluation_submitted = serializers.SerializerMethodField()
    submission_status = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()
    final_remarks = serializers.SerializerMethodField()

    def _get_step(self, obj):
        steps = self.context.get('step_map', {})
        return steps.get(obj.pk)

    def get_employee_name(self, obj):
        u = obj.submitted_by
        return f'{u.lastname or ""}, {u.firstname or ""}'.strip(', ') or u.idnumber

    def get_employee_idnumber(self, obj):
        return obj.submitted_by.idnumber

    def get_training_title(self, obj):
        return obj.training.title

    def get_training_date(self, obj):
        return obj.training.training_date

    def get_my_step_id(self, obj):
        step = self._get_step(obj)
        return step.pk if step else None

    def get_speaker(self, obj):
        return obj.training.speaker

    def get_my_step_status(self, obj):
        step = self._get_step(obj)
        return step.status if step else None

    def get_can_review(self, obj):
        from training.routing import can_act_on_training_step
        step = self._get_step(obj)
        if not step:
            return False
        return can_act_on_training_step(step, self.context['request'].user)

    def get_evaluation_submitted(self, obj):
        step = self._get_step(obj)
        if not step:
            return False
        if step.sequence == 1:
            return hasattr(step, 'supervisor_evaluation') and step.supervisor_evaluation.is_complete
        return step.final_action is not None

    def get_submission_status(self, obj):
        return obj.status

    def get_my_role(self, obj):
        step = self._get_step(obj)
        if not step:
            return None
        return 'supervisor' if step.sequence == 1 else 'final_approver'

    def get_final_remarks(self, obj):
        step = self._get_step(obj)
        if not step:
            return ''
        # Show remarks to supervisor when submission was returned
        return step.final_remarks if obj.status == 'returned' else ''

    class Meta:
        model = TrainingSubmission
        fields = (
            'id', 'employee_name', 'employee_idnumber', 'training_title', 'training_date', 'speaker',
            'my_step_id', 'my_step_status', 'can_review', 'evaluation_submitted', 'submitted_at',
            'submission_status', 'my_role', 'final_remarks',
        )
