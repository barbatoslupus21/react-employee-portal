from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(APIView):
    """
    GET /api/activitylog/notifications/
    Returns the most recent 50 notifications for the current user (newest first).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Notification.objects.filter(recipient=request.user).order_by('-created_at')[:50]
        return Response(NotificationSerializer(qs, many=True).data)


class NotificationReadView(APIView):
    """
    POST /api/activitylog/notifications/<pk>/read/
    Marks a single notification as read.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        try:
            notif = Notification.objects.get(pk=pk, recipient=request.user)
        except Notification.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        notif.is_read = True
        notif.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notif).data)


class NotificationReadAllView(APIView):
    """
    POST /api/activitylog/notifications/read-all/
    Marks all of the current user's notifications as read.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({'detail': 'All notifications marked as read.'})
