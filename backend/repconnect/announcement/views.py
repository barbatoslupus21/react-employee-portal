"""Views for the Announcement module.

All mutating endpoints use @transaction.atomic.
Reaction toggle uses select_for_update() to prevent race conditions (Risk 4).
"""
from __future__ import annotations

from django.db import transaction
from django.db.models import Count, OuterRef, Subquery, Value, CharField
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Announcement,
    AnnouncementComment,
    AnnouncementMedia,
    AnnouncementReaction,
)
from .permissions import IsAdminHrAccounting
from .serializers import (
    ALLOWED_EMOJIS,
    AnnouncementCommentSerializer,
    AnnouncementListSerializer,
    AnnouncementMediaWriteSerializer,
    AnnouncementReactionSerializer,
    AnnouncementWriteSerializer,
    _resolve_media_type,
)
from activityLog.models import Notification

PAGE_SIZE = 10


def _annotate_announcements(queryset, user):
    """Annotate reaction_count, comment_count, and user_reaction."""
    user_reaction_subquery = AnnouncementReaction.objects.filter(
        announcement=OuterRef('pk'),
        user=user,
    ).values('emoji')[:1]

    return queryset.annotate(
        reaction_count=Count('reactions', distinct=True),
        comment_count=Count('comments', distinct=True),
        user_reaction=Coalesce(
            Subquery(user_reaction_subquery),
            Value(None, output_field=CharField()),
        ),
    )


def _paginate(queryset, page: int):
    offset = (page - 1) * PAGE_SIZE
    total = queryset.count()
    items = queryset[offset: offset + PAGE_SIZE]
    return items, total


# --------------------------------------------------------------------------- #
#  Announcement List / Create                                                  #
# --------------------------------------------------------------------------- #

class AnnouncementListCreateView(APIView):
    """
    GET  /api/announcements/          — paginated list (all authenticated)
    POST /api/announcements/          — create (admin/hr/accounting only)
    """

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdminHrAccounting()]
        return [IsAuthenticated()]

    def get(self, request):
        user = request.user
        is_privileged = user.admin or user.hr or user.accounting

        qs = Announcement.objects.select_related('created_by').prefetch_related(
            'media', 'reactions__user'
        )
        if not is_privileged:
            qs = qs.filter(is_published=True)

        tab = request.query_params.get('tab', 'all')  # all | published | drafts
        if tab == 'published':
            qs = qs.filter(is_published=True)
        elif tab == 'drafts' and is_privileged:
            qs = qs.filter(is_published=False)

        qs = qs.order_by('-created_at')
        qs = _annotate_announcements(qs, user)

        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except ValueError:
            page = 1

        items, total = _paginate(qs, page)
        serializer = AnnouncementListSerializer(
            items, many=True, context={'request': request}
        )
        return Response({
            'results': serializer.data,
            'count': total,
            'page': page,
            'total_pages': max(1, -(-total // PAGE_SIZE)),
        })

    @transaction.atomic
    def post(self, request):
        write_ser = AnnouncementWriteSerializer(data=request.data)
        write_ser.is_valid(raise_exception=True)

        announcement = write_ser.save(created_by=request.user)

        # Notify all users about the new announcement (general scope — no loop needed)
        if announcement.is_published:
            Notification.objects.create(
                notification_scope='general',
                notification_type='announcement',
                title=announcement.title or 'New Announcement',
                message='A new announcement has been posted.',
                module='announcements',
                related_object_id=announcement.pk,
            )

        # Process uploaded media files
        files = request.FILES.getlist('media')
        for idx, f in enumerate(files):
            media_ser = AnnouncementMediaWriteSerializer(data={'file': f, 'order': idx})
            media_ser.is_valid(raise_exception=True)
            media_type = _resolve_media_type(f.name, getattr(f, 'content_type', None))
            AnnouncementMedia.objects.create(
                announcement=announcement,
                file=f,
                media_type=media_type,
                order=idx,
            )

        qs = _annotate_announcements(
            Announcement.objects.filter(pk=announcement.pk).select_related('created_by').prefetch_related('media', 'reactions__user'),
            request.user,
        )
        out = AnnouncementListSerializer(qs.first(), context={'request': request})
        return Response(out.data, status=status.HTTP_201_CREATED)


# --------------------------------------------------------------------------- #
#  Announcement Detail / Update / Delete                                       #
# --------------------------------------------------------------------------- #

class AnnouncementDetailView(APIView):
    """
    GET    /api/announcements/<id>/
    PATCH  /api/announcements/<id>/
    DELETE /api/announcements/<id>/
    """

    def _get_object(self, pk):
        try:
            return Announcement.objects.select_related('created_by').prefetch_related(
                'media', 'reactions__user'
            ).get(pk=pk)
        except Announcement.DoesNotExist:
            return None

    def get_permissions(self):
        if self.request.method in ('PATCH', 'PUT', 'DELETE'):
            return [IsAdminHrAccounting()]
        return [IsAuthenticated()]

    def get(self, request, pk):
        ann = self._get_object(pk)
        if ann is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_privileged = user.admin or user.hr or user.accounting
        if not ann.is_published and not is_privileged:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        qs = _annotate_announcements(
            Announcement.objects.filter(pk=pk).select_related('created_by').prefetch_related('media', 'reactions__user'),
            user,
        )
        out = AnnouncementListSerializer(qs.first(), context={'request': request})
        return Response(out.data)

    @transaction.atomic
    def patch(self, request, pk):
        ann = self._get_object(pk)
        if ann is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        write_ser = AnnouncementWriteSerializer(ann, data=request.data, partial=True)
        write_ser.is_valid(raise_exception=True)
        ann = write_ser.save()

        # Replace media if new files provided
        files = request.FILES.getlist('media')
        if files:
            ann.media.all().delete()
            for idx, f in enumerate(files):
                media_ser = AnnouncementMediaWriteSerializer(data={'file': f, 'order': idx})
                media_ser.is_valid(raise_exception=True)
                media_type = _resolve_media_type(f.name, getattr(f, 'content_type', None))
                AnnouncementMedia.objects.create(
                    announcement=ann,
                    file=f,
                    media_type=media_type,
                    order=idx,
                )

        qs = _annotate_announcements(
            Announcement.objects.filter(pk=ann.pk).select_related('created_by').prefetch_related('media', 'reactions__user'),
            request.user,
        )
        out = AnnouncementListSerializer(qs.first(), context={'request': request})
        return Response(out.data)

    @transaction.atomic
    def delete(self, request, pk):
        ann = self._get_object(pk)
        if ann is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        ann.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
#  Media Reorder                                                               #
# --------------------------------------------------------------------------- #

class AnnouncementMediaReorderView(APIView):
    """PUT /api/announcements/<id>/media/reorder/"""
    permission_classes = [IsAdminHrAccounting]

    @transaction.atomic
    def put(self, request, pk):
        try:
            ann = Announcement.objects.get(pk=pk)
        except Announcement.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        items = request.data  # expected: [{"id": 1, "order": 0}, ...]
        if not isinstance(items, list):
            return Response({'detail': 'Expected a list.'}, status=status.HTTP_400_BAD_REQUEST)

        for item in items:
            media_id = item.get('id')
            new_order = item.get('order')
            if media_id is None or new_order is None:
                return Response(
                    {'detail': 'Each item must have "id" and "order".'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            AnnouncementMedia.objects.filter(pk=media_id, announcement=ann).update(order=new_order)

        return Response({'detail': 'Reordered.'})


# --------------------------------------------------------------------------- #
#  Reaction Toggle                                                             #
# --------------------------------------------------------------------------- #

class AnnouncementReactionToggleView(APIView):
    """POST /api/announcements/<id>/react/"""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        try:
            ann = Announcement.objects.get(pk=pk)
        except Announcement.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        emoji = request.data.get('emoji', '❤️')
        if emoji not in ALLOWED_EMOJIS:
            return Response(
                {'detail': f'Emoji "{emoji}" is not allowed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Atomic get_or_create + toggle (Risk 3 & 4)
        existing = (
            AnnouncementReaction.objects
            .select_for_update()
            .filter(announcement=ann, user=request.user)
            .first()
        )

        if existing is None:
            AnnouncementReaction.objects.create(
                announcement=ann, user=request.user, emoji=emoji
            )
            reacted = True
        elif existing.emoji == emoji:
            # Same emoji → toggle off
            existing.delete()
            reacted = False
        else:
            # Different emoji → update
            existing.emoji = emoji
            existing.save(update_fields=['emoji'])
            reacted = True

        reaction_count = AnnouncementReaction.objects.filter(announcement=ann).count()
        user_reaction = emoji if reacted else None

        # Collect top reactors
        reactors = []
        for r in AnnouncementReaction.objects.filter(announcement=ann).select_related('user').order_by('created_at')[:5]:
            avatar = r.user.avatar.url if r.user.avatar else None
            reactors.append({'avatar': avatar})

        return Response({
            'reacted': reacted,
            'emoji': user_reaction,
            'reaction_count': reaction_count,
            'top_reactors': reactors,
        })


# --------------------------------------------------------------------------- #
#  Reaction List (for "View Reactions" modal)                                  #
# --------------------------------------------------------------------------- #

class AnnouncementReactionListView(APIView):
    """GET /api/announcements/<id>/reactions/"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            ann = Announcement.objects.get(pk=pk)
        except Announcement.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        reactions = ann.reactions.select_related('user').order_by('created_at')
        ser = AnnouncementReactionSerializer(reactions, many=True, context={'request': request})
        return Response(ser.data)


# --------------------------------------------------------------------------- #
#  Comments                                                                    #
# --------------------------------------------------------------------------- #

class AnnouncementCommentListCreateView(APIView):
    """
    GET  /api/announcements/<id>/comments/
    POST /api/announcements/<id>/comments/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            ann = Announcement.objects.get(pk=pk)
        except Announcement.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Top-level only; replies are nested via serializer
        comments = (
            ann.comments
            .filter(parent__isnull=True)
            .select_related('user')
            .prefetch_related('replies__user')
            .order_by('created_at')
        )
        ser = AnnouncementCommentSerializer(comments, many=True, context={'request': request})
        return Response(ser.data)

    @transaction.atomic
    def post(self, request, pk):
        try:
            ann = Announcement.objects.get(pk=pk)
        except Announcement.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        content = (request.data.get('content') or '').strip()
        if not content:
            return Response({'detail': 'Content is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(content) > 1000:
            return Response({'detail': 'Comment must be 1000 characters or fewer.'}, status=status.HTTP_400_BAD_REQUEST)

        parent_id = request.data.get('parent_id')
        parent = None
        if parent_id:
            try:
                parent = AnnouncementComment.objects.get(pk=parent_id, announcement=ann, parent__isnull=True)
            except AnnouncementComment.DoesNotExist:
                return Response({'detail': 'Parent comment not found.'}, status=status.HTTP_400_BAD_REQUEST)

        comment = AnnouncementComment.objects.create(
            announcement=ann,
            user=request.user,
            content=content,
            parent=parent,
        )

        comment_count = ann.comments.count()
        ser = AnnouncementCommentSerializer(comment, context={'request': request})
        return Response({'comment': ser.data, 'comment_count': comment_count}, status=status.HTTP_201_CREATED)


class AnnouncementCommentDeleteView(APIView):
    """DELETE /api/announcements/<id>/comments/<comment_id>/"""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def delete(self, request, pk, comment_id):
        try:
            comment = AnnouncementComment.objects.get(pk=comment_id, announcement_id=pk)
        except AnnouncementComment.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_privileged = request.user.admin or request.user.hr or request.user.accounting
        if comment.user_id != request.user.pk and not is_privileged:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
#  Activity Feed                                                               #
# --------------------------------------------------------------------------- #

class AnnouncementActivityView(APIView):
    """GET /api/announcements/activity/  — recent reactions + comments."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        def _name(u):
            parts = [u.firstname or '', u.lastname or '']
            return ' '.join(p for p in parts if p).strip() or u.email

        def _avatar(u):
            return u.avatar.url if u.avatar else None

        def _preview(ann):
            if ann.title:
                return ann.title
            return (ann.caption or '')[:80]

        activities = []

        comments = (
            AnnouncementComment.objects
            .filter(announcement__is_published=True)
            .select_related('user', 'announcement')
            .order_by('-created_at')[:15]
        )
        for c in comments:
            activities.append({
                'type': 'comment',
                'user_name': _name(c.user),
                'user_avatar': _avatar(c.user),
                'announcement_id': c.announcement_id,
                'announcement_preview': _preview(c.announcement),
                'timestamp': c.created_at.isoformat(),
                'content': c.content[:120],
                'emoji': None,
            })

        reactions = (
            AnnouncementReaction.objects
            .filter(announcement__is_published=True)
            .select_related('user', 'announcement')
            .order_by('-created_at')[:15]
        )
        for r in reactions:
            activities.append({
                'type': 'reaction',
                'user_name': _name(r.user),
                'user_avatar': _avatar(r.user),
                'announcement_id': r.announcement_id,
                'announcement_preview': _preview(r.announcement),
                'timestamp': r.created_at.isoformat(),
                'content': None,
                'emoji': r.emoji,
            })

        activities.sort(key=lambda x: x['timestamp'], reverse=True)
        return Response(activities[:20])
