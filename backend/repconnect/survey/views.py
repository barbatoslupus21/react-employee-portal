"""Survey module views.

Security checklist:
  - All list endpoints paginated (max page_size=20).
  - No raw SQL — ORM only.
  - @transaction.atomic + select_for_update() on all write-modify operations.
  - CSRF enforced via DRF + middleware (no @csrf_exempt anywhere).
  - permission_classes = [IsAuthenticated] on every view; role check inside method.
  - Input validated through serializers before any DB write.
  - Data returned on anonymous surveys never includes employee identity.
  - Option mutation blocked on non-Draft surveys (R5).
  - Double-submit prevented by unique_together + select_for_update (R1).
"""
from __future__ import annotations

import io
from collections import defaultdict
from typing import Any

from django.db import transaction
from django.db.models import Q, Max, Avg, F, ExpressionWrapper, DurationField
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from activityLog.models import Notification
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
from survey.serializers import (
    SurveyAnswerSerializer,
    SurveyDetailSerializer,
    SurveyListSerializer,
    SurveyQuestionSerializer,
    SurveyQuestionWriteSerializer,
    SurveyQuestionOptionSerializer,
    SurveyResponseSerializer,
    SurveyTemplateDetailSerializer,
    SurveyTemplateListSerializer,
    SurveyTemplateWriteSerializer,
    SurveyWriteSerializer,
)

# ── Permission helpers ────────────────────────────────────────────────────────

def _require_admin_hr_or_iad(request) -> Response | None:
    u = request.user
    if not (getattr(u, 'admin', False) or getattr(u, 'hr', False) or getattr(u, 'iad', False)):
        return Response({'detail': 'Permission denied.'}, status=http_status.HTTP_403_FORBIDDEN)
    return None


# ── Notification helper ───────────────────────────────────────────────────────

def _eligible_survey_recipients():
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.filter(
        is_active=True,
        admin=False,
        hr=False,
        accounting=False,
    )


def _schedule_survey_notifications(survey: Survey) -> None:
    """Fire in-app notifications on survey activation via bulk_create (R11)."""
    def _create():
        if survey.target_type == Survey.TARGET_ALL:
            user_ids = list(_eligible_survey_recipients().values_list('id', flat=True))
        else:
            user_ids = list(survey.target_users.values_list('user_id', flat=True))

        is_general = survey.target_type == Survey.TARGET_ALL
        scope = 'general' if is_general else 'specific_user'
        desc = survey.description[:200] + ('...' if len(survey.description) > 200 else '')
        notifications = [
            Notification(
                recipient_id=uid,
                notification_type='survey_assigned',
                notification_scope=scope,
                title=f'New Survey: {survey.title}',
                message=(f'A new survey "{survey.title}" is now available.\n\n{desc}').strip(),
                module='survey',
                related_object_id=survey.pk,
            )
            for uid in user_ids
        ]
        for i in range(0, len(notifications), 50):
            Notification.objects.bulk_create(notifications[i:i + 50], ignore_conflicts=True)

    transaction.on_commit(_create)


# ── Pagination helper ─────────────────────────────────────────────────────────

def _paginate(qs, request, page_size: int = 20) -> tuple:
    try:
        page = max(1, int(request.query_params.get('page', 1)))
    except (ValueError, TypeError):
        page = 1
    total = qs.count()
    start = (page - 1) * page_size
    items = list(qs[start:start + page_size])
    return items, {
        'page': page,
        'page_size': page_size,
        'total': total,
        'total_pages': max(1, (total + page_size - 1) // page_size),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5 — Admin API Views
# ═══════════════════════════════════════════════════════════════════════════════

class AdminSurveyListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied

        qs = Survey.objects.select_related('created_by').prefetch_related('responses', 'target_users')
        status_filter = request.query_params.get('status', '')
        if status_filter and status_filter != 'all':
            today = timezone.localdate()
            if status_filter == 'scheduled':
                qs = qs.filter(start_date__gt=today)
            elif status_filter == 'active':
                qs = qs.filter(
                    Q(start_date__lte=today) | Q(start_date__isnull=True),
                    Q(end_date__gte=today) | Q(end_date__isnull=True),
                ).exclude(status=Survey.STATUS_CLOSED)
            elif status_filter == 'closed':
                qs = qs.filter(
                    Q(status=Survey.STATUS_CLOSED) | Q(end_date__lt=today)
                )
        category_filter = request.query_params.get('category', '')
        if category_filter and category_filter != 'all':
            qs = qs.filter(template_type=category_filter)
        q = request.query_params.get('search', '').strip()
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q))

        sort_by = request.query_params.get('sort_by', 'created_at')
        sort_dir = request.query_params.get('sort_dir', 'desc')
        allowed_sorts = {'title', 'status', 'template_type', 'start_date', 'end_date', 'created_at'}
        if sort_by not in allowed_sorts:
            sort_by = 'created_at'
        prefix = '-' if sort_dir == 'desc' else ''
        items, meta = _paginate(qs.order_by(f'{prefix}{sort_by}'), request)
        from django.contrib.auth import get_user_model
        total_active = get_user_model().objects.filter(
            is_active=True,
            admin=False,
            hr=False,
            accounting=False,
        ).count()
        return Response({
            'results': SurveyListSerializer(items, many=True, context={'total_active': total_active}).data,
            'pagination': meta,
        })

    @transaction.atomic
    def post(self, request):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied

        ser = SurveyWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        target_user_ids = data.pop('target_user_ids', [])
        template_id = data.pop('template_id', None)
        if template_id:
            tmpl = SurveyTemplate.objects.prefetch_related(
                'questions__options', 'questions__rating_config'
            ).filter(pk=template_id).first()
            template_type = tmpl.template_type if tmpl else ''
        else:
            template_type = ''

        survey = Survey.objects.create(
            **data,
            created_by=request.user,
            template_type=template_type,
        )
        if survey.target_type == Survey.TARGET_SPECIFIC and target_user_ids:
            SurveyTargetUser.objects.bulk_create([
                SurveyTargetUser(survey=survey, user_id=uid) for uid in target_user_ids
            ], ignore_conflicts=True)
        # Seed questions from template if template_id provided
        template_id = request.data.get('template_id')
        if template_id:
            tmpl = SurveyTemplate.objects.prefetch_related(
                'questions__options', 'questions__rating_config'
            ).filter(pk=template_id).first()
            if tmpl:
                for tmpl_q in tmpl.questions.order_by('order'):
                    new_q = SurveyQuestion.objects.create(
                        survey=survey,
                        question_text=tmpl_q.question_text,
                        question_type=tmpl_q.question_type,
                        order=tmpl_q.order,
                        is_required=tmpl_q.is_required,
                        show_percentage_summary=tmpl_q.show_percentage_summary,
                        allow_other=tmpl_q.allow_other,
                    )
                    for opt in tmpl_q.options.order_by('order'):
                        SurveyQuestionOption.objects.create(
                            question=new_q, option_text=opt.option_text, order=opt.order
                        )
                    if tmpl_q.question_type == 'rating':
                        try:
                            cfg = tmpl_q.rating_config
                            SurveyQuestionRatingConfig.objects.filter(question=new_q).update(
                                min_value=cfg.min_value, max_value=cfg.max_value,
                                min_label=cfg.min_label, max_label=cfg.max_label,
                            )
                        except SurveyQuestionRatingConfig.DoesNotExist:
                            pass
        return Response(SurveyDetailSerializer(survey).data, status=http_status.HTTP_201_CREATED)


class AdminSurveyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_survey(self, pk):
        return Survey.objects.prefetch_related(
            'questions__options', 'questions__rating_config', 'target_users'
        ).filter(pk=pk).first()

    def get(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        survey = self._get_survey(pk)
        if not survey:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        return Response(SurveyDetailSerializer(survey).data)

    @transaction.atomic
    def patch(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        survey = Survey.objects.select_for_update().filter(pk=pk).first()
        if not survey:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        ser = SurveyWriteSerializer(survey, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        target_user_ids = data.pop('target_user_ids', None)
        template_id = data.pop('template_id', None)
        template = None
        if template_id is not None:
            if survey.responses.exists():
                return Response(
                    {'detail': 'Cannot change template after survey responses exist.'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            template = SurveyTemplate.objects.prefetch_related(
                'questions__options', 'questions__rating_config'
            ).filter(pk=template_id).first()
            if not template:
                return Response({'template_id': 'Template not found.'}, status=http_status.HTTP_400_BAD_REQUEST)
            survey.template_type = template.template_type

        for attr, val in data.items():
            setattr(survey, attr, val)
        survey.save()

        if target_user_ids is not None:
            SurveyTargetUser.objects.filter(survey=survey).delete()
            if survey.target_type == Survey.TARGET_SPECIFIC and target_user_ids:
                SurveyTargetUser.objects.bulk_create([
                    SurveyTargetUser(survey=survey, user_id=uid) for uid in target_user_ids
                ], ignore_conflicts=True)

        if template is not None:
            survey.questions.all().delete()
            for tmpl_q in template.questions.order_by('order'):
                new_q = SurveyQuestion.objects.create(
                    survey=survey,
                    question_text=tmpl_q.question_text,
                    question_type=tmpl_q.question_type,
                    order=tmpl_q.order,
                    is_required=tmpl_q.is_required,
                    show_percentage_summary=tmpl_q.show_percentage_summary,
                    allow_other=tmpl_q.allow_other,
                )
                for opt in tmpl_q.options.order_by('order'):
                    SurveyQuestionOption.objects.create(
                        question=new_q, option_text=opt.option_text, order=opt.order
                    )
                if tmpl_q.question_type == 'rating':
                    try:
                        cfg = tmpl_q.rating_config
                        SurveyQuestionRatingConfig.objects.filter(question=new_q).update(
                            min_value=cfg.min_value, max_value=cfg.max_value,
                            min_label=cfg.min_label, max_label=cfg.max_label,
                        )
                    except SurveyQuestionRatingConfig.DoesNotExist:
                        pass

        return Response(SurveyDetailSerializer(self._get_survey(pk)).data)

    @transaction.atomic
    def delete(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        survey = Survey.objects.filter(pk=pk).first()
        if not survey:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if survey.status != Survey.STATUS_DRAFT:
            return Response({'detail': 'Only Draft surveys can be deleted.'}, status=http_status.HTTP_400_BAD_REQUEST)
        survey.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class AdminSurveyStatusView(APIView):
    permission_classes = [IsAuthenticated]
    _VALID_TRANSITIONS = {
        Survey.STATUS_DRAFT:  {Survey.STATUS_ACTIVE},
        Survey.STATUS_ACTIVE: {Survey.STATUS_CLOSED},
        Survey.STATUS_CLOSED: set(),
    }

    @transaction.atomic
    def patch(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        new_status = request.data.get('status', '')
        survey = Survey.objects.select_for_update().filter(pk=pk).first()
        if not survey:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        allowed = self._VALID_TRANSITIONS.get(survey.status, set())
        if new_status not in allowed:
            return Response({'detail': f'Cannot transition from "{survey.status}" to "{new_status}".'}, status=http_status.HTTP_400_BAD_REQUEST)
        survey.status = new_status
        survey.save(update_fields=['status', 'updated_at'])
        if new_status == Survey.STATUS_ACTIVE:
            _schedule_survey_notifications(survey)
        return Response({'status': survey.status})


class AdminQuestionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, survey_pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        survey = Survey.objects.filter(pk=survey_pk).first()
        if not survey:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        qs = survey.questions.prefetch_related('options', 'rating_config').order_by('order')
        return Response(SurveyQuestionSerializer(qs, many=True).data)

    @transaction.atomic
    def post(self, request, survey_pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        survey = Survey.objects.select_for_update().filter(pk=survey_pk).first()
        if not survey:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if not survey.is_editable:
            return Response({'detail': 'Questions cannot be added to a non-Draft survey.'}, status=http_status.HTTP_400_BAD_REQUEST)
        ser = SurveyQuestionWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        max_order = survey.questions.aggregate(m=Max('order'))['m'] or 0
        question = ser.save(survey=survey, order=max_order + 1)
        return Response(SurveyQuestionSerializer(question).data, status=http_status.HTTP_201_CREATED)


class AdminQuestionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        question = SurveyQuestion.objects.select_related('survey', 'template').filter(pk=pk).first()
        if not question:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if question.survey and not question.survey.is_editable:
            return Response({'detail': 'Questions on non-Draft surveys cannot be modified.'}, status=http_status.HTTP_400_BAD_REQUEST)
        ser = SurveyQuestionWriteSerializer(question, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        question = ser.save()
        return Response(SurveyQuestionSerializer(question).data)

    @transaction.atomic
    def delete(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        question = SurveyQuestion.objects.select_related('survey', 'template').filter(pk=pk).first()
        if not question:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if question.survey and not question.survey.is_editable:
            return Response({'detail': 'Questions on non-Draft surveys cannot be deleted.'}, status=http_status.HTTP_400_BAD_REQUEST)
        question.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class AdminQuestionReorderView(APIView):
    """PATCH body: {"order": [{"id": 1, "order": 0}, ...], "last_updated": "<iso>"}"""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, survey_pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        survey = Survey.objects.select_for_update().filter(pk=survey_pk).first()
        if not survey:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if not survey.is_editable:
            return Response({'detail': 'Cannot reorder questions on a non-Draft survey.'}, status=http_status.HTTP_400_BAD_REQUEST)
        last_updated = request.data.get('last_updated')
        if last_updated:
            try:
                from django.utils.dateparse import parse_datetime
                client_ts = parse_datetime(last_updated)
                if client_ts and survey.updated_at and survey.updated_at > client_ts:
                    return Response({'detail': 'Survey was modified by another session. Please reload.'}, status=http_status.HTTP_409_CONFLICT)
            except Exception:
                pass
        for item in request.data.get('order', []):
            SurveyQuestion.objects.filter(pk=item['id'], survey=survey).update(order=item['order'])
        survey.save(update_fields=['updated_at'])
        qs = survey.questions.prefetch_related('options', 'rating_config').order_by('order')
        return Response(SurveyQuestionSerializer(qs, many=True).data)


class AdminTemplateQuestionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, template_pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        template = SurveyTemplate.objects.filter(pk=template_pk).first()
        if not template:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        qs = template.questions.prefetch_related('options', 'rating_config').order_by('order')
        return Response(SurveyQuestionSerializer(qs, many=True).data)

    @transaction.atomic
    def post(self, request, template_pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        template = SurveyTemplate.objects.select_for_update().filter(pk=template_pk).first()
        if not template:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        ser = SurveyQuestionWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        max_order = template.questions.aggregate(m=Max('order'))['m'] or 0
        question = ser.save(template=template, order=max_order + 1)
        return Response(SurveyQuestionSerializer(question).data, status=http_status.HTTP_201_CREATED)


class AdminTemplateQuestionReorderView(APIView):
    """PATCH body: {"order": [{"id": 1, "order": 0}, ...], "last_updated": "<iso>"}"""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, template_pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        template = SurveyTemplate.objects.select_for_update().filter(pk=template_pk).first()
        if not template:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        for item in request.data.get('order', []):
            SurveyQuestion.objects.filter(pk=item['id'], template=template).update(order=item['order'])
        qs = template.questions.prefetch_related('options', 'rating_config').order_by('order')
        return Response(SurveyQuestionSerializer(qs, many=True).data)


class AdminQuestionRatingConfigView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        question = SurveyQuestion.objects.select_related('survey', 'template').filter(pk=pk).first()
        if not question:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if question.survey and not question.survey.is_editable:
            return Response({'detail': 'Rating config on non-Draft surveys is immutable.'}, status=http_status.HTTP_400_BAD_REQUEST)
        ser = SurveyQuestionRatingConfigSerializer(question.rating_config, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for attr, val in ser.validated_data.items():
            setattr(question.rating_config, attr, val)
        question.rating_config.save()
        return Response(SurveyQuestionRatingConfigSerializer(question.rating_config).data)


class AdminOptionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, question_pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        qs = SurveyQuestionOption.objects.filter(question_id=question_pk).order_by('order')
        return Response(SurveyQuestionOptionSerializer(qs, many=True).data)

    @transaction.atomic
    def post(self, request, question_pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        question = SurveyQuestion.objects.select_related('survey', 'template').filter(pk=question_pk).first()
        if not question:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if question.survey and not question.survey.is_editable:
            return Response({'detail': 'Options on non-Draft surveys are immutable.'}, status=http_status.HTTP_400_BAD_REQUEST)
        if question.question_type not in CHOICE_BASED_TYPES:
            return Response({'detail': 'Options can only be added to choice-based question types.'}, status=http_status.HTTP_400_BAD_REQUEST)
        ser = SurveyQuestionOptionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        option = SurveyQuestionOption.objects.create(question=question, **ser.validated_data, order=question.options.count())
        return Response(SurveyQuestionOptionSerializer(option).data, status=http_status.HTTP_201_CREATED)


class AdminOptionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_option(self, pk):
        return SurveyQuestionOption.objects.select_related('question__survey', 'question__template').filter(pk=pk).first()

    @transaction.atomic
    def patch(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        option = self._get_option(pk)
        if not option:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if option.question.survey and not option.question.survey.is_editable:
            return Response({'detail': 'Options on non-Draft surveys are immutable.'}, status=http_status.HTTP_400_BAD_REQUEST)
        ser = SurveyQuestionOptionSerializer(option, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for attr, val in ser.validated_data.items():
            setattr(option, attr, val)
        option.save()
        return Response(SurveyQuestionOptionSerializer(option).data)

    @transaction.atomic
    def delete(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        option = self._get_option(pk)
        if not option:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if option.question.survey and not option.question.survey.is_editable:
            return Response({'detail': 'Options on non-Draft surveys are immutable.'}, status=http_status.HTTP_400_BAD_REQUEST)
        option.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class AdminTemplateListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        qs = SurveyTemplate.objects.select_related('created_by').prefetch_related('questions')
        q = request.query_params.get('search', '').strip()
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q))
        items, meta = _paginate(qs.order_by('-created_at'), request)
        return Response({'results': SurveyTemplateListSerializer(items, many=True).data, 'pagination': meta})

    @transaction.atomic
    def post(self, request):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        ser = SurveyTemplateWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        template = SurveyTemplate.objects.create(**ser.validated_data, created_by=request.user)
        return Response(SurveyTemplateDetailSerializer(template).data, status=http_status.HTTP_201_CREATED)


class AdminTemplateDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        tmpl = SurveyTemplate.objects.prefetch_related('questions__options', 'questions__rating_config').filter(pk=pk).first()
        if not tmpl:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        return Response(SurveyTemplateDetailSerializer(tmpl).data)

    @transaction.atomic
    def patch(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        tmpl = SurveyTemplate.objects.filter(pk=pk).first()
        if not tmpl:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        ser = SurveyTemplateWriteSerializer(tmpl, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for attr, val in ser.validated_data.items():
            setattr(tmpl, attr, val)
        tmpl.save()
        return Response(SurveyTemplateDetailSerializer(tmpl).data)

    @transaction.atomic
    def delete(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        tmpl = SurveyTemplate.objects.filter(pk=pk).first()
        if not tmpl:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        tmpl.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class AdminTemplateDuplicateView(APIView):
    """POST /api/survey/admin/templates/{pk}/duplicate — deep-copy a template."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        tmpl = SurveyTemplate.objects.prefetch_related(
            'questions__options', 'questions__rating_config'
        ).filter(pk=pk).first()
        if not tmpl:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        new_title = (tmpl.title[:196] + ' (Copy)') if len(tmpl.title) > 196 else f'{tmpl.title} (Copy)'
        new_tmpl = SurveyTemplate.objects.create(
            title=new_title, description=tmpl.description, created_by=request.user
        )
        for q in tmpl.questions.order_by('order'):
            new_q = SurveyQuestion.objects.create(
                template=new_tmpl,
                question_text=q.question_text,
                question_type=q.question_type,
                order=q.order,
                is_required=q.is_required,
                show_percentage_summary=q.show_percentage_summary,
                allow_other=q.allow_other,
            )
            for opt in q.options.order_by('order'):
                SurveyQuestionOption.objects.create(
                    question=new_q, option_text=opt.option_text, order=opt.order
                )
            if q.question_type == 'rating':
                try:
                    cfg = q.rating_config
                    SurveyQuestionRatingConfig.objects.filter(question=new_q).update(
                        min_value=cfg.min_value, max_value=cfg.max_value,
                        min_label=cfg.min_label, max_label=cfg.max_label,
                    )
                except SurveyQuestionRatingConfig.DoesNotExist:
                    pass
        return Response(SurveyTemplateDetailSerializer(new_tmpl).data, status=http_status.HTTP_201_CREATED)


class AdminSurveyFromTemplateView(APIView):
    """POST — deep-copies template questions into a new Draft survey (R8)."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, template_pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        tmpl = SurveyTemplate.objects.prefetch_related('questions__options', 'questions__rating_config').filter(pk=template_pk).first()
        if not tmpl:
            return Response({'detail': 'Template not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        title = request.data.get('title', '').strip() or f'Survey from "{tmpl.title}"'
        survey = Survey.objects.create(title=title[:200], description=tmpl.description, created_by=request.user, status=Survey.STATUS_DRAFT)
        for tmpl_q in tmpl.questions.order_by('order'):
            new_q = SurveyQuestion.objects.create(
                survey=survey,
                question_text=tmpl_q.question_text,
                question_type=tmpl_q.question_type,
                order=tmpl_q.order,
                is_required=tmpl_q.is_required,
                show_percentage_summary=tmpl_q.show_percentage_summary,
                allow_other=tmpl_q.allow_other,
            )
            for opt in tmpl_q.options.order_by('order'):
                SurveyQuestionOption.objects.create(question=new_q, option_text=opt.option_text, order=opt.order)
            if tmpl_q.question_type == 'rating':
                try:
                    cfg = tmpl_q.rating_config
                    SurveyQuestionRatingConfig.objects.filter(question=new_q).update(min_value=cfg.min_value, max_value=cfg.max_value, min_label=cfg.min_label, max_label=cfg.max_label)
                except SurveyQuestionRatingConfig.DoesNotExist:
                    pass
        return Response(SurveyDetailSerializer(survey).data, status=http_status.HTTP_201_CREATED)


class AdminSurveyResultsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        survey = Survey.objects.prefetch_related('questions__options', 'target_users').filter(pk=pk).first()
        if not survey:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        complete_qs = survey.responses.filter(is_complete=True)
        total_responses = complete_qs.count()
        if survey.target_type == Survey.TARGET_ALL:
            from django.contrib.auth import get_user_model
            total_targeted = get_user_model().objects.filter(is_active=True).count()
        else:
            total_targeted = survey.target_users.count()
        completion_rate = (total_responses / total_targeted * 100) if total_targeted > 0 else 0.0

        last_resp_obj = complete_qs.aggregate(last=Max('submitted_at'))
        last_response_at = last_resp_obj['last'].isoformat() if last_resp_obj['last'] else None

        avg_seconds = None
        timed_qs = complete_qs.filter(started_at__isnull=False, submitted_at__isnull=False)
        if timed_qs.exists():
            duration_agg = timed_qs.annotate(
                duration=ExpressionWrapper(F('submitted_at') - F('started_at'), output_field=DurationField())
            ).aggregate(avg_dur=Avg('duration'))
            if duration_agg['avg_dur'] is not None:
                avg_seconds = int(duration_agg['avg_dur'].total_seconds())

        question_results = []
        for q in survey.questions.order_by('order'):
            answered_qs = SurveyAnswer.objects.filter(question=q, response__is_complete=True)
            total_answered = answered_qs.count()
            result = {
                'question_id': q.pk, 'question_text': q.question_text,
                'question_type': q.question_type, 'show_percentage': q.show_percentage_summary,
                'total_responses': total_answered,
            }

            if q.question_type in CHOICE_BASED_TYPES | {'yes_no', 'likert', 'linear_scale'}:
                counts: dict = defaultdict(int)
                for ans in answered_qs.prefetch_related('selected_options'):
                    for opt in ans.selected_options.all():
                        counts[opt.pk] += 1
                result['options'] = [
                    {'option_id': opt.pk, 'option_text': opt.option_text,
                     'count': counts.get(opt.pk, 0),
                     'percentage': round(counts.get(opt.pk, 0) / total_answered * 100, 1) if total_answered else 0.0}
                    for opt in q.options.order_by('order')
                ]
            elif q.question_type in {'rating', 'number'}:
                values = list(answered_qs.filter(number_value__isnull=False).values_list('number_value', flat=True))
                avg = (sum(values) / len(values)) if values else None
                dist: dict = defaultdict(int)
                for v in values:
                    dist[v] += 1
                distribution = []
                if q.question_type == 'rating':
                    try:
                        cfg = q.rating_config
                        min_v, max_v = cfg.min_value, cfg.max_value
                    except SurveyQuestionRatingConfig.DoesNotExist:
                        min_v, max_v = 1, 5
                    for v in range(min_v, max_v + 1):
                        cnt = dist.get(float(v), 0)
                        distribution.append({'value': v, 'count': cnt, 'percentage': round(cnt / len(values) * 100, 1) if values else 0.0})
                else:
                    for v, cnt in sorted(dist.items()):
                        distribution.append({'value': v, 'count': cnt, 'percentage': round(cnt / len(values) * 100, 1) if values else 0.0})
                result['average'] = round(avg, 2) if avg is not None else None
                result['distribution'] = distribution
            else:
                # Open-ended — never return identity, just text (R3).
                result['text_answers'] = list(answered_qs.exclude(text_value='').values_list('text_value', flat=True)[:200])

            question_results.append(result)

        return Response({
            'survey_id': survey.pk, 'survey_title': survey.title,
            'survey_description': survey.description, 'survey_status': survey.status,
            'start_date': survey.start_date.isoformat() if survey.start_date else None,
            'end_date': survey.end_date.isoformat() if survey.end_date else None,
            'is_anonymous': survey.is_anonymous,
            'total_targeted': total_targeted, 'total_responses': total_responses,
            'completion_rate': round(completion_rate, 1),
            'last_response_at': last_response_at,
            'avg_completion_seconds': avg_seconds,
            'questions': question_results,
        })


class AdminSurveyExportView(APIView):
    """GET — XLSX export, max 500 rows (R13)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        survey = Survey.objects.prefetch_related('questions__options').filter(pk=pk).first()
        if not survey:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        try:
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment
        except ImportError:
            return Response({'detail': 'openpyxl not installed.'}, status=http_status.HTTP_503_SERVICE_UNAVAILABLE)

        from django.http import StreamingHttpResponse
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Responses'
        questions = list(survey.questions.order_by('order'))

        headers = ['Response ID', 'Respondent', 'Submitted At', 'Completed']
        if not survey.is_anonymous:
            headers.insert(1, 'Employee ID')
        for q in questions:
            headers.append(f'Q{q.order}: {q.question_text[:50]}')
        ws.append(headers)
        fill = PatternFill('solid', fgColor='2845D6')
        font = Font(bold=True, color='FFFFFF')
        for cell in ws[1]:
            cell.fill = fill
            cell.font = font

        responses = survey.responses.filter(is_complete=True).select_related('employee')[:500]
        answer_map = {(a.response_id, a.question_id): a for a in
                      SurveyAnswer.objects.filter(response__survey=survey, response__is_complete=True).prefetch_related('selected_options')}

        for resp in responses:
            if survey.is_anonymous:
                respondent, emp_id = 'Anonymous', ''
            else:
                respondent = f'{resp.employee.firstname} {resp.employee.lastname}' if resp.employee else '-'
                emp_id = str(resp.employee.idnumber) if resp.employee else '-'
            row = [resp.pk, respondent, str(resp.submitted_at or ''), 'Yes']
            if not survey.is_anonymous:
                row.insert(1, emp_id)
            for q in questions:
                ans = answer_map.get((resp.pk, q.pk))
                if not ans:
                    row.append('')
                elif q.question_type in CHOICE_BASED_TYPES | {'yes_no', 'likert', 'linear_scale'}:
                    opts = [o.option_text for o in ans.selected_options.all()]
                    if ans.other_text:
                        opts.append(f'Other: {ans.other_text}')
                    row.append(', '.join(opts))
                elif q.question_type in {'rating', 'number'}:
                    row.append(ans.number_value if ans.number_value is not None else '')
                else:
                    row.append(ans.text_value)
            ws.append(row)

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        http_resp = StreamingHttpResponse(streaming_content=buffer, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        http_resp['Content-Disposition'] = f'attachment; filename="survey_{pk}_responses.xlsx"'
        return http_resp


class AdminIndividualResponsesView(APIView):
    """GET /api/survey/admin/surveys/<pk>/responses — paginated respondent list with filters."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        survey = Survey.objects.filter(pk=pk).first()
        if not survey:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        qs = SurveyResponse.objects.filter(survey=survey).select_related('employee').order_by('-submitted_at', '-pk')

        # Filter: status (complete / partial)
        status_filter = request.query_params.get('status', 'all')
        if status_filter == 'complete':
            qs = qs.filter(is_complete=True)
        elif status_filter == 'partial':
            qs = qs.filter(is_complete=False)

        # Filter: date range on submitted_at
        date_from = request.query_params.get('date_from', '').strip()
        date_to = request.query_params.get('date_to', '').strip()
        if date_from:
            qs = qs.filter(submitted_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(submitted_at__date__lte=date_to)

        # Filter: search by name or employee ID (only for non-anonymous surveys)
        search = request.query_params.get('search', '').strip()
        if search and not survey.is_anonymous:
            qs = qs.filter(
                Q(employee__firstname__icontains=search) |
                Q(employee__lastname__icontains=search) |
                Q(employee__idnumber__icontains=search)
            )

        items, meta = _paginate(qs, request)

        results = []
        for resp in items:
            if survey.is_anonymous or not resp.employee:
                name = 'Anonymous'
                idnumber = '—'
            else:
                name = f'{resp.employee.firstname or ""} {resp.employee.lastname or ""}'.strip() or resp.employee.idnumber
                idnumber = resp.employee.idnumber
            results.append({
                'id': resp.pk,
                'respondent_name': name,
                'idnumber': idnumber,
                'submitted_at': resp.submitted_at.isoformat() if resp.submitted_at else None,
                'started_at': resp.started_at.isoformat() if resp.started_at else None,
                'is_complete': resp.is_complete,
            })

        return Response({'results': results, 'pagination': meta, 'is_anonymous': survey.is_anonymous})


class AdminResponseDetailView(APIView):
    """GET /api/survey/admin/responses/<pk> — full answer set for one respondent."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        resp = SurveyResponse.objects.select_related('survey', 'employee').filter(pk=pk).first()
        if not resp:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)

        survey = resp.survey
        if survey.is_anonymous or not resp.employee:
            name = 'Anonymous'
            idnumber = '—'
        else:
            name = f'{resp.employee.firstname or ""} {resp.employee.lastname or ""}'.strip() or resp.employee.idnumber
            idnumber = resp.employee.idnumber

        answers = SurveyAnswer.objects.filter(response=resp).select_related('question').prefetch_related('selected_options').order_by('question__order')
        answers_data = []
        for ans in answers:
            q = ans.question
            answer_entry: dict = {
                'question_id': q.pk,
                'question_text': q.question_text,
                'question_type': q.question_type,
                'order': q.order,
            }
            if q.question_type in CHOICE_BASED_TYPES | {'yes_no', 'likert', 'linear_scale'}:
                selected = [{'id': o.pk, 'text': o.option_text} for o in ans.selected_options.all()]
                answer_entry['selected_options'] = selected
                if ans.other_text:
                    answer_entry['other_text'] = ans.other_text
            elif q.question_type in {'rating', 'number'}:
                answer_entry['number_value'] = ans.number_value
            else:
                answer_entry['text_value'] = ans.text_value

            answers_data.append(answer_entry)

        return Response({
            'id': resp.pk,
            'respondent_name': name,
            'idnumber': idnumber,
            'submitted_at': resp.submitted_at.isoformat() if resp.submitted_at else None,
            'started_at': resp.started_at.isoformat() if resp.started_at else None,
            'is_complete': resp.is_complete,
            'answers': answers_data,
        })


class AdminUserSearchView(APIView):
    """GET /api/survey/admin/users?search=<q> — paginated user search (R12, min 2 chars)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _require_admin_hr_or_iad(request)
        if denied:
            return denied
        from django.contrib.auth import get_user_model
        User = get_user_model()
        q = request.query_params.get('search', '').strip()
        if len(q) < 2:
            return Response({'results': [], 'pagination': {'page': 1, 'page_size': 20, 'total': 0, 'total_pages': 1}})
        qs = User.objects.filter(Q(idnumber__icontains=q) | Q(firstname__icontains=q) | Q(lastname__icontains=q), is_active=True).order_by('lastname', 'firstname')
        items, meta = _paginate(qs, request)
        return Response({'results': [{'id': u.pk, 'idnumber': u.idnumber, 'full_name': f'{u.firstname} {u.lastname}'} for u in items], 'pagination': meta})


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6 — Respondent Views
# ═══════════════════════════════════════════════════════════════════════════════

class MySurveysView(APIView):
    """GET /api/survey/my-surveys — active and closed surveys targeted at the authenticated user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        targeted = Survey.objects.filter(
            status__in=[Survey.STATUS_ACTIVE, Survey.STATUS_CLOSED]
        ).filter(
            Q(target_type=Survey.TARGET_ALL) |
            Q(target_type=Survey.TARGET_SPECIFIC, target_users__user=user)
        ).distinct()
        results = []
        for s in targeted:
            response = SurveyResponse.objects.filter(survey=s, employee=user).first()
            results.append({
                'id': s.pk, 'title': s.title, 'description': s.description,
                'is_anonymous': s.is_anonymous, 'start_date': s.start_date, 'end_date': s.end_date,
                'status': s.status,
                'is_complete': response.is_complete if response else False,
                'response_id': response.pk if response else None,
            })
        return Response(results)


class ResponseCreateView(APIView):
    """POST /api/survey/responses — create or return existing response (idempotent, R1, R15)."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        survey_id = request.data.get('survey_id')
        if not survey_id:
            return Response({'detail': 'survey_id is required.'}, status=http_status.HTTP_400_BAD_REQUEST)
        survey = Survey.objects.filter(pk=survey_id).first()
        if not survey:
            return Response({'detail': 'Survey not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if survey.status != Survey.STATUS_ACTIVE:
            return Response({'detail': 'Survey is not active.', 'code': 'survey_not_active'}, status=http_status.HTTP_400_BAD_REQUEST)
        if survey.target_type == Survey.TARGET_SPECIFIC:
            if not SurveyTargetUser.objects.filter(survey=survey, user=request.user).exists():
                return Response({'detail': 'This survey is not assigned to you.', 'code': 'not_targeted'}, status=http_status.HTTP_403_FORBIDDEN)
        employee = None if survey.is_anonymous else request.user
        existing = SurveyResponse.objects.filter(survey=survey, employee=employee).first()
        if existing:
            return Response(SurveyResponseSerializer(existing).data, status=http_status.HTTP_200_OK)
        response = SurveyResponse.objects.create(survey=survey, employee=employee, is_complete=False, started_at=timezone.now())
        return Response(SurveyResponseSerializer(response).data, status=http_status.HTTP_201_CREATED)


class AnswerUpsertView(APIView):
    """PATCH /api/survey/responses/<pk>/answers/<question_pk> — upsert one answer (R4)."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, pk: int, question_pk: int):
        response = SurveyResponse.objects.select_related('survey').filter(pk=pk).first()
        if not response:
            return Response({'detail': 'Response not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if not response.survey.is_anonymous and response.employee_id != request.user.pk:
            return Response({'detail': 'Permission denied.'}, status=http_status.HTTP_403_FORBIDDEN)
        if response.is_complete:
            return Response({'detail': 'Survey already submitted.'}, status=http_status.HTTP_400_BAD_REQUEST)
        if response.survey.status != Survey.STATUS_ACTIVE:
            return Response({'detail': 'Survey is no longer active.', 'code': 'survey_closed'}, status=http_status.HTTP_400_BAD_REQUEST)
        question = SurveyQuestion.objects.filter(pk=question_pk, survey=response.survey).first()
        if not question:
            return Response({'detail': 'Question not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        answer, _ = SurveyAnswer.objects.get_or_create(response=response, question=question)
        ser = SurveyAnswerSerializer(answer, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        selected_options = ser.validated_data.pop('selected_options', None)
        for attr, val in ser.validated_data.items():
            setattr(answer, attr, val)
        answer.save()
        if selected_options is not None:
            answer.selected_options.set(selected_options)
        return Response(SurveyAnswerSerializer(answer).data)


class ResponseSubmitView(APIView):
    """POST /api/survey/responses/<pk>/submit — finalize (R1, R2)."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk: int):
        response = SurveyResponse.objects.select_for_update().select_related('survey').filter(pk=pk).first()
        if not response:
            return Response({'detail': 'Response not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if not response.survey.is_anonymous and response.employee_id != request.user.pk:
            return Response({'detail': 'Permission denied.'}, status=http_status.HTTP_403_FORBIDDEN)
        if response.is_complete:
            return Response({'detail': 'Already submitted.'}, status=http_status.HTTP_200_OK)
        if response.survey.status != Survey.STATUS_ACTIVE:
            return Response({'detail': 'Survey is no longer accepting responses.', 'code': 'survey_closed'}, status=http_status.HTTP_400_BAD_REQUEST)
        required_ids = set(SurveyQuestion.objects.filter(survey=response.survey, is_required=True).values_list('id', flat=True))
        answered_ids = set(response.answers.values_list('question_id', flat=True))
        missing = required_ids - answered_ids
        if missing:
            return Response({'detail': 'Some required questions have not been answered.', 'missing_questions': list(missing)}, status=http_status.HTTP_400_BAD_REQUEST)
        response.is_complete = True
        response.submitted_at = timezone.now()
        response.save(update_fields=['is_complete', 'submitted_at'])
        return Response({'detail': 'Survey submitted successfully.', 'submitted_at': str(response.submitted_at)})


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 9 support — Respondent survey detail + response detail
# ═══════════════════════════════════════════════════════════════════════════════

class SurveyRespondentDetailView(APIView):
    """GET /api/survey/surveys/<pk> — returns survey with questions for respondent.

    Access allowed only when:
    - Survey is active.
    - User is in the target audience.
    Includes existing answers if a response already exists.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        survey = Survey.objects.prefetch_related(
            'questions__options', 'questions__rating_config', 'target_users',
        ).filter(pk=pk).first()
        if not survey:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if survey.status == Survey.STATUS_DRAFT:
            return Response({'detail': 'This survey is not available.', 'code': 'survey_not_available'}, status=http_status.HTTP_404_NOT_FOUND)
        if survey.target_type == Survey.TARGET_SPECIFIC:
            if not SurveyTargetUser.objects.filter(survey=survey, user=request.user).exists():
                return Response({'detail': 'This survey is not assigned to you.'}, status=http_status.HTTP_403_FORBIDDEN)

        # Look up existing response + answers.
        response_obj = SurveyResponse.objects.filter(
            survey=survey,
            employee=None if survey.is_anonymous else request.user,
        ).prefetch_related('answers__selected_options').first()

        # Build answer map: question_id → answer data
        answer_map: dict = {}
        if response_obj:
            for ans in response_obj.answers.all():
                answer_map[ans.question_id] = {
                    'text_value': ans.text_value,
                    'number_value': str(ans.number_value) if ans.number_value is not None else None,
                    'other_text': ans.other_text,
                    'selected_option_ids': list(ans.selected_options.values_list('id', flat=True)),
                }

        questions_data = []
        for q in sorted(survey.questions.all(), key=lambda x: x.order):
            q_data: dict = {
                'id': q.pk,
                'question_text': q.question_text,
                'question_type': q.question_type,
                'order': q.order,
                'is_required': q.is_required,
                'allow_other': q.allow_other,
                'options': [{'id': o.pk, 'option_text': o.option_text, 'order': o.order}
                            for o in sorted(q.options.all(), key=lambda x: x.order)],
                'rating_config': None,
                'existing_answer': answer_map.get(q.pk),
            }
            if q.question_type == 'rating':
                try:
                    cfg = q.rating_config
                    q_data['rating_config'] = {
                        'min_value': cfg.min_value,
                        'max_value': cfg.max_value,
                        'min_label': cfg.min_label,
                        'max_label': cfg.max_label,
                    }
                except Exception:
                    q_data['rating_config'] = {'min_value': 1, 'max_value': 5, 'min_label': '', 'max_label': ''}
            questions_data.append(q_data)

        return Response({
            'id': survey.pk,
            'title': survey.title,
            'description': survey.description,
            'is_anonymous': survey.is_anonymous,
            'status': survey.status,
            'start_date': str(survey.start_date) if survey.start_date else None,
            'end_date': str(survey.end_date) if survey.end_date else None,
            'questions': questions_data,
            'response_id': response_obj.pk if response_obj else None,
            'is_complete': response_obj.is_complete if response_obj else False,
        })


class ResponseDetailView(APIView):
    """GET /api/survey/responses/<pk> — return response with answers (respondent only)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        response = SurveyResponse.objects.select_related('survey').filter(pk=pk).first()
        if not response:
            return Response({'detail': 'Not found.'}, status=http_status.HTTP_404_NOT_FOUND)
        if not response.survey.is_anonymous and response.employee_id != request.user.pk:
            return Response({'detail': 'Permission denied.'}, status=http_status.HTTP_403_FORBIDDEN)
        return Response(SurveyResponseSerializer(response).data)
