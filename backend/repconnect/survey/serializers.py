"""Serializers for the Survey module.

Security notes:
  - _validate_safe_text blocks all XSS/injection characters per system policy.
  - Serializer-level validation mirrors backend models; no raw SQL used.
  - max_length on every text field matches the corresponding model field.
"""
from __future__ import annotations

import re
from collections import defaultdict

from django.db import models as django_models
from rest_framework import serializers

from survey.models import (
    ALLOW_OTHER_TYPES,
    CHOICE_BASED_TYPES,
    Survey,
    SurveyAnswer,
    SurveyQuestion,
    SurveyQuestionOption,
    SurveyQuestionRatingConfig,
    SurveyResponse,
    SurveyTargetUser,
    SurveyTemplate,
)

# ── Shared validation ─────────────────────────────────────────────────────────
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
        raise serializers.ValidationError(
            f'{field_name} cannot exceed {max_length} characters.'
        )
    return value


# ── Option serializer ─────────────────────────────────────────────────────────

class SurveyQuestionOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SurveyQuestionOption
        fields = ('id', 'option_text', 'order')

    def validate_option_text(self, value):
        return _validate_safe_text(value, 'Option text', 500)


# ── Rating config serializer ──────────────────────────────────────────────────

class SurveyQuestionRatingConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SurveyQuestionRatingConfig
        fields = ('min_value', 'max_value', 'min_label', 'max_label')

    def validate(self, attrs):
        if attrs.get('min_value', 1) >= attrs.get('max_value', 5):
            raise serializers.ValidationError('max_value must be greater than min_value.')
        return attrs


# ── Question serializer ───────────────────────────────────────────────────────

class SurveyQuestionSerializer(serializers.ModelSerializer):
    options     = SurveyQuestionOptionSerializer(many=True, read_only=True)
    rating_config = SurveyQuestionRatingConfigSerializer(read_only=True)

    class Meta:
        model  = SurveyQuestion
        fields = (
            'id', 'question_text', 'question_type', 'order',
            'is_required', 'show_percentage_summary', 'allow_other',
            'options', 'rating_config',
        )

    def validate_question_text(self, value):
        return _validate_safe_text(value, 'Question text', 1000)

    def validate(self, attrs):
        allow_other   = attrs.get('allow_other', False)
        question_type = attrs.get('question_type', '')
        if allow_other and question_type not in ALLOW_OTHER_TYPES:
            raise serializers.ValidationError(
                {'allow_other': '"Allow other" is only valid for Single Choice, Multiple Choice, or Dropdown questions.'}
            )
        return attrs


class SurveyQuestionWriteSerializer(SurveyQuestionSerializer):
    """Used for creating/updating questions; survey/template FKs set by view."""

    options = SurveyQuestionOptionSerializer(many=True, required=False)
    rating_config = SurveyQuestionRatingConfigSerializer(required=False)

    class Meta(SurveyQuestionSerializer.Meta):
        fields = (
            'id', 'question_text', 'question_type', 'order',
            'is_required', 'show_percentage_summary', 'allow_other',
            'options', 'rating_config',
        )

    def create(self, validated_data):
        options_data = validated_data.pop('options', [])
        rating_data = validated_data.pop('rating_config', None)
        question = SurveyQuestion.objects.create(**validated_data)
        for i, option_data in enumerate(options_data):
            option_data.pop('order', None)
            SurveyQuestionOption.objects.create(question=question, order=i, **option_data)
        if rating_data is not None:
            SurveyQuestionRatingConfig.objects.update_or_create(question=question, defaults=rating_data)
        return question

    def update(self, instance, validated_data):
        options_data = validated_data.pop('options', None)
        rating_data = validated_data.pop('rating_config', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if options_data is not None:
            instance.options.all().delete()
            for i, option_data in enumerate(options_data):
                option_data.pop('order', None)
                SurveyQuestionOption.objects.create(question=instance, order=i, **option_data)
        if rating_data is not None:
            SurveyQuestionRatingConfig.objects.update_or_create(question=instance, defaults=rating_data)
        return instance


# ── Survey serializers ────────────────────────────────────────────────────────

class SurveyListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    created_by_name = serializers.SerializerMethodField()
    response_count  = serializers.SerializerMethodField()
    total_targeted  = serializers.SerializerMethodField()
    template_type   = serializers.CharField(read_only=True)

    class Meta:
        model  = Survey
        fields = (
            'id', 'title', 'status', 'template_type', 'target_type', 'is_anonymous',
            'start_date', 'end_date', 'created_by_name', 'created_at',
            'response_count', 'total_targeted',
        )

    def get_created_by_name(self, obj) -> str:
        if obj.created_by:
            return f'{obj.created_by.firstname} {obj.created_by.lastname}'
        return '—'

    def get_response_count(self, obj) -> int:
        return obj.responses.filter(is_complete=True).count()

    def get_total_targeted(self, obj) -> int:
        if obj.target_type == 'all_users':
            return self.context.get('total_active', 0)
        # Use prefetched data when available
        return len(obj.target_users.all())


class SurveyDetailSerializer(serializers.ModelSerializer):
    """Full survey with questions, used by the builder."""
    questions       = SurveyQuestionSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    target_user_ids = serializers.SerializerMethodField()
    response_count  = serializers.SerializerMethodField()
    has_responses   = serializers.SerializerMethodField()

    class Meta:
        model  = Survey
        fields = (
            'id', 'title', 'description', 'status', 'target_type', 'is_anonymous',
            'start_date', 'end_date', 'created_by_name', 'created_at', 'updated_at',
            'questions', 'target_user_ids', 'response_count', 'has_responses',
        )

    def get_created_by_name(self, obj) -> str:
        if obj.created_by:
            return f'{obj.created_by.firstname} {obj.created_by.lastname}'
        return '—'

    def get_response_count(self, obj) -> int:
        return obj.responses.filter(is_complete=True).count()

    def get_has_responses(self, obj) -> bool:
        return obj.responses.exists()

    def get_target_user_ids(self, obj) -> list[int]:
        if obj.target_type == Survey.TARGET_ALL:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            return list(
                User.objects.filter(
                    is_active=True,
                    admin=False,
                    hr=False,
                    accounting=False,
                ).values_list('id', flat=True)
            )
        return list(obj.target_users.values_list('user_id', flat=True))


class SurveyWriteSerializer(serializers.ModelSerializer):
    """Used to create or update a Survey's core fields."""
    target_user_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False, default=list
    )
    template_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model  = Survey
        fields = (
            'id', 'title', 'description', 'status', 'target_type',
            'is_anonymous', 'start_date', 'end_date', 'target_user_ids',
            'template_id',
        )

    def validate_title(self, value):
        return _validate_safe_text(value, 'Title', 200)

    def validate_description(self, value):
        if value:
            return _validate_safe_text(value, 'Description', 1000)
        return value

    def validate(self, attrs):
        target_type     = attrs.get('target_type', Survey.TARGET_ALL)
        target_user_ids = attrs.get('target_user_ids', [])
        if target_type == Survey.TARGET_SPECIFIC and not target_user_ids:
            raise serializers.ValidationError(
                {'target_user_ids': 'At least one target user is required for "Specific Users" surveys.'}
            )
        return attrs


# ── Template serializers ──────────────────────────────────────────────────────

class SurveyTemplateListSerializer(serializers.ModelSerializer):
    created_by_name  = serializers.SerializerMethodField()
    created_by_id    = serializers.IntegerField(allow_null=True, read_only=True)
    question_count   = serializers.SerializerMethodField()

    class Meta:
        model  = SurveyTemplate
        fields = ('id', 'title', 'description', 'template_type', 'created_by_name', 'created_by_id', 'created_at', 'question_count')

    def get_created_by_name(self, obj) -> str:
        if obj.created_by:
            return f'{obj.created_by.firstname} {obj.created_by.lastname}'
        return '—'

    def get_question_count(self, obj) -> int:
        return obj.questions.count()


class SurveyTemplateDetailSerializer(serializers.ModelSerializer):
    questions = SurveyQuestionSerializer(many=True, read_only=True)

    class Meta:
        model  = SurveyTemplate
        fields = ('id', 'title', 'description', 'template_type', 'created_at', 'questions')


class SurveyTemplateWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SurveyTemplate
        fields = ('id', 'title', 'description', 'template_type')

    def validate_title(self, value):
        return _validate_safe_text(value, 'Title', 200)

    def validate_description(self, value):
        if value:
            return _validate_safe_text(value, 'Description', 1000)
        return value

    def validate_template_type(self, value):
        allowed = {'Leadership Alignment', 'Engagement', 'Effectiveness', 'Experience', 'Onboarding', ''}
        if value not in allowed:
            from rest_framework import serializers as _s
            raise _s.ValidationError('Invalid template type.')
        return value


# ── Response / Answer serializers ─────────────────────────────────────────────

class SurveyAnswerSerializer(serializers.ModelSerializer):
    selected_option_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=SurveyQuestionOption.objects.all(),
        source='selected_options',
        write_only=True,
        required=False,
    )
    selected_options = SurveyQuestionOptionSerializer(many=True, read_only=True)

    class Meta:
        model  = SurveyAnswer
        fields = (
            'id', 'question', 'text_value', 'number_value',
            'selected_options', 'selected_option_ids', 'other_text',
        )
        read_only_fields = ('id', 'question', 'selected_options')

    def validate_text_value(self, value):
        if value and len(value) > 5000:
            raise serializers.ValidationError('Answer cannot exceed 5000 characters.')
        return value

    def validate_other_text(self, value):
        if value and len(value) > 500:
            raise serializers.ValidationError('Other text cannot exceed 500 characters.')
        return value


class SurveyResponseSerializer(serializers.ModelSerializer):
    answers = SurveyAnswerSerializer(many=True, read_only=True)

    class Meta:
        model  = SurveyResponse
        fields = ('id', 'survey', 'is_complete', 'submitted_at', 'answers')
        read_only_fields = ('id', 'is_complete', 'submitted_at', 'answers')


# ── Results serializer (aggregated) ──────────────────────────────────────────

class QuestionResultSerializer(serializers.Serializer):
    """Per-question aggregated results returned by the results endpoint."""
    question_id     = serializers.IntegerField()
    question_text   = serializers.CharField()
    question_type   = serializers.CharField()
    show_percentage = serializers.BooleanField()
    total_responses = serializers.IntegerField()
    # Choice-based: list of {option_id, option_text, count, percentage}
    options         = serializers.ListField(child=serializers.DictField(), required=False)
    # Open-ended: list of text answers
    text_answers    = serializers.ListField(child=serializers.CharField(), required=False)
    # Rating/numeric: average value + distribution
    average         = serializers.FloatField(required=False, allow_null=True)
    distribution    = serializers.ListField(child=serializers.DictField(), required=False)


class SurveyResultsSerializer(serializers.Serializer):
    survey_id         = serializers.IntegerField()
    survey_title      = serializers.CharField()
    total_targeted    = serializers.IntegerField()
    total_responses   = serializers.IntegerField()
    completion_rate   = serializers.FloatField()
    questions         = QuestionResultSerializer(many=True)


# ── User search (for specific_users picker) ───────────────────────────────────

class UserSearchSerializer(serializers.Serializer):
    id        = serializers.IntegerField()
    idnumber  = serializers.CharField()
    full_name = serializers.CharField()
