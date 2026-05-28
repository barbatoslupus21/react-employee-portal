import re

from django.db.models import Prefetch, Q, Subquery, OuterRef
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from userProfile.models import workInformation
from .models import (
    FeedbackSettings,
    SystemFeedback,
    SystemFeedbackModalState,
    SystemUpdate,
    SystemUpdateSeen,
    UpdateSettings,
)

SEMVER_RE = re.compile(r'^\d+\.\d+\.\d+$')


def _require_admin(request) -> Response | None:
    if not getattr(request.user, 'admin', False):
        return Response({'detail': 'Admin permission required.'}, status=status.HTTP_403_FORBIDDEN)
    return None


# ── Settings ──────────────────────────────────────────────────────────────────

class FeedbackSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'feedback_enabled': FeedbackSettings.get().enabled,
            'updates_enabled': UpdateSettings.get().enabled,
        })

    def put(self, request):
        err = _require_admin(request)
        if err:
            return err
        target = request.data.get('target')
        enabled = request.data.get('enabled')
        if not isinstance(enabled, bool):
            return Response({'detail': 'enabled must be a boolean.'}, status=status.HTTP_400_BAD_REQUEST)
        if target == 'feedback':
            s = FeedbackSettings.get()
            s.enabled = enabled
            s.save()
            return Response({'feedback_enabled': s.enabled, 'updates_enabled': UpdateSettings.get().enabled})
        if target == 'updates':
            s = UpdateSettings.get()
            s.enabled = enabled
            s.save()
            return Response({'feedback_enabled': FeedbackSettings.get().enabled, 'updates_enabled': s.enabled})
        return Response({'detail': 'Invalid target.'}, status=status.HTTP_400_BAD_REQUEST)


# ── Feedback Records ──────────────────────────────────────────────────────────

def _serialize_feedback(record: SystemFeedback, work_info_attr: str = 'work_info_list') -> dict:
    u = record.employee
    last = (u.lastname or '').strip()
    first = (u.firstname or '').strip()
    if last and first:
        name = f'{last}, {first}'
    else:
        name = u.email

    department = None
    work_infos = getattr(u, work_info_attr, None)
    if work_infos:
        wi = work_infos[0]
        if wi.department:
            department = wi.department.name

    return {
        'id': record.id,
        'employee_name': name,
        'department': department,
        'rating': record.rating,
        'feedback_text': record.feedback_text,
        'submitted_at': record.submitted_at.isoformat(),
    }


class FeedbackRecordsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        err = _require_admin(request)
        if err:
            return err

        dept_subq = workInformation.objects.filter(
            employee=OuterRef('employee_id'),
        ).order_by('-created_at').values('department__name')[:1]

        qs = SystemFeedback.objects.select_related('employee').prefetch_related(
            Prefetch(
                'employee__workinformation_set',
                queryset=workInformation.objects.select_related('department').order_by('-created_at'),
                to_attr='work_info_list',
            )
        )

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(employee__firstname__icontains=search) |
                Q(employee__lastname__icontains=search)
            )

        rating_filter = request.query_params.get('rating', '').strip()
        if rating_filter:
            try:
                qs = qs.filter(rating=int(rating_filter))
            except (ValueError, TypeError):
                pass

        sort_field = request.query_params.get('sort', 'submitted_at').strip()
        sort_dir = request.query_params.get('dir', 'desc').strip()

        valid_sorts = {
            'submitted_at': 'submitted_at',
            'rating': 'rating',
            'employee_name': 'employee__lastname',
            'department': 'dept_name_sort',
        }
        if sort_field not in valid_sorts:
            sort_field = 'submitted_at'

        if sort_field == 'department':
            from django.db.models import Subquery as _Subquery, OuterRef as _OuterRef
            from django.db.models.functions import Lower
            qs = qs.annotate(
                dept_name_sort=_Subquery(
                    workInformation.objects.filter(
                        employee=_OuterRef('employee_id')
                    ).order_by('-created_at').values('department__name')[:1]
                )
            )

        db_sort = valid_sorts[sort_field]
        prefix = '' if sort_dir == 'asc' else '-'
        qs = qs.order_by(f'{prefix}{db_sort}')

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            page_size = max(1, min(100, int(request.query_params.get('page_size', 20))))
        except (ValueError, TypeError):
            page, page_size = 1, 20

        total = qs.count()
        offset = (page - 1) * page_size
        records = list(qs[offset:offset + page_size])

        return Response({
            'results': [_serialize_feedback(r) for r in records],
            'count': total,
            'page': page,
            'page_size': page_size,
        })

    def post(self, request):
        if getattr(request.user, 'admin', False):
            return Response({'detail': 'Admin users cannot submit feedback.'}, status=status.HTTP_403_FORBIDDEN)

        if not FeedbackSettings.get().enabled:
            return Response({'detail': 'Feedback is not currently enabled.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        already = SystemFeedback.objects.filter(
            employee=request.user,
            submitted_at__year=now.year,
            submitted_at__month=now.month,
        ).exists()
        if already:
            return Response({'detail': 'You have already submitted feedback this month.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            rating = int(request.data.get('rating', 0))
        except (ValueError, TypeError):
            return Response({'detail': 'rating must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (1 <= rating <= 5):
            return Response({'detail': 'rating must be between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)

        feedback_text = (request.data.get('feedback_text') or '').strip()
        if len(feedback_text) > 2000:
            return Response({'detail': 'Feedback text exceeds 2000 characters.'}, status=status.HTTP_400_BAD_REQUEST)

        SystemFeedback.objects.create(
            employee=request.user,
            rating=rating,
            feedback_text=feedback_text,
        )

        month_start = timezone.localtime().date().replace(day=1)
        SystemFeedbackModalState.objects.update_or_create(
            employee=request.user,
            month=month_start,
            defaults={'submitted': True},
        )

        return Response({'detail': 'Feedback submitted.'}, status=status.HTTP_201_CREATED)


class FeedbackStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if getattr(request.user, 'admin', False):
            return Response({
                'feedback_enabled': FeedbackSettings.get().enabled,
                'show_feedback_modal': False,
                'submitted_this_month': False,
                'feedback_modal_appearance_count': 0,
                'feedback_modal_max_appearances': 2,
            })

        now = timezone.now()
        month_start = timezone.localtime().date().replace(day=1)
        feedback_settings = FeedbackSettings.get()
        submitted = SystemFeedback.objects.filter(
            employee=request.user,
            submitted_at__year=now.year,
            submitted_at__month=now.month,
        ).exists()

        state = None
        if feedback_settings.enabled:
            state, _ = SystemFeedbackModalState.objects.get_or_create(
                employee=request.user,
                month=month_start,
            )
            if submitted and not state.submitted:
                state.submitted = True
                state.save(update_fields=['submitted', 'updated_at'])

        if not feedback_settings.enabled or submitted or (state and state.submitted):
            return Response({
                'feedback_enabled': feedback_settings.enabled,
                'show_feedback_modal': False,
                'submitted_this_month': submitted,
                'feedback_modal_appearance_count': state.appearance_count if state else 0,
                'feedback_modal_max_appearances': 2,
            })

        if state.appearance_count >= 2:
            return Response({
                'feedback_enabled': feedback_settings.enabled,
                'show_feedback_modal': False,
                'submitted_this_month': submitted,
                'feedback_modal_appearance_count': state.appearance_count,
                'feedback_modal_max_appearances': 2,
            })

        state.appearance_count += 1
        state.save(update_fields=['appearance_count', 'updated_at'])

        return Response({
            'feedback_enabled': feedback_settings.enabled,
            'show_feedback_modal': True,
            'submitted_this_month': submitted,
            'feedback_modal_appearance_count': state.appearance_count,
            'feedback_modal_max_appearances': 2,
        })


# ── System Updates ─────────────────────────────────────────────────────────────

def _serialize_update(update: SystemUpdate) -> dict:
    return {
        'id': update.id,
        'version': update.version,
        'description': update.description,
        'created_at': update.created_at.isoformat(),
        'updated_at': update.updated_at.isoformat(),
    }


class SystemUpdatesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        updates = SystemUpdate.objects.all()
        return Response([_serialize_update(u) for u in updates])

    def post(self, request):
        err = _require_admin(request)
        if err:
            return err

        version = (request.data.get('version') or '').strip()
        description = (request.data.get('description') or '').strip()

        if not version:
            return Response({'detail': 'version is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not SEMVER_RE.match(version):
            return Response({'detail': 'Version must follow x.y.z format (e.g. 1.0.4).'}, status=status.HTTP_400_BAD_REQUEST)
        if not description:
            return Response({'detail': 'description is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if SystemUpdate.objects.filter(version=version).exists():
            return Response({'detail': f'Version {version} already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        update = SystemUpdate.objects.create(version=version, description=description)
        return Response(_serialize_update(update), status=status.HTTP_201_CREATED)


class SystemUpdateDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, pk: int) -> SystemUpdate | None:
        try:
            return SystemUpdate.objects.get(pk=pk)
        except SystemUpdate.DoesNotExist:
            return None

    def patch(self, request, pk: int):
        err = _require_admin(request)
        if err:
            return err

        update = self._get(pk)
        if not update:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        version = (request.data.get('version') or update.version).strip()
        description = (request.data.get('description') or update.description).strip()

        if not SEMVER_RE.match(version):
            return Response({'detail': 'Version must follow x.y.z format (e.g. 1.0.4).'}, status=status.HTTP_400_BAD_REQUEST)
        if not description:
            return Response({'detail': 'description is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if version != update.version and SystemUpdate.objects.filter(version=version).exists():
            return Response({'detail': f'Version {version} already exists.'}, status=status.HTTP_400_BAD_REQUEST)

        update.version = version
        update.description = description
        update.save()
        return Response(_serialize_update(update))

    def delete(self, request, pk: int):
        err = _require_admin(request)
        if err:
            return err

        update = self._get(pk)
        if not update:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        update.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UnseenUpdatesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if getattr(request.user, 'admin', False):
            return Response([])
        if not UpdateSettings.get().enabled:
            return Response([])

        seen_ids = SystemUpdateSeen.objects.filter(
            employee=request.user,
        ).values_list('update_id', flat=True)

        latest_unseen = SystemUpdate.objects.exclude(id__in=seen_ids).order_by('-created_at').first()
        if not latest_unseen:
            return Response([])

        return Response([_serialize_update(latest_unseen)])


class MarkUpdatesSeenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        update_ids = request.data.get('update_ids', [])
        if not isinstance(update_ids, list):
            return Response({'detail': 'update_ids must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_ids = list(
            SystemUpdate.objects.filter(id__in=update_ids).values_list('id', flat=True)
        )
        records = [
            SystemUpdateSeen(employee=request.user, update_id=uid)
            for uid in valid_ids
        ]
        SystemUpdateSeen.objects.bulk_create(records, ignore_conflicts=True)
        return Response({'detail': 'Marked as seen.'})
