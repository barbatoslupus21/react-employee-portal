from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import EmailConfiguration


class EmailConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model  = EmailConfiguration
        fields = ('id', 'provider', 'smtp_host', 'smtp_port', 'use_ssl', 'use_tls',
                  'username', 'password', 'from_name')
        extra_kwargs = {'password': {'write_only': True}}


class EmailConfigView(APIView):
    """GET/PUT /api/general-settings/email-config — manage SMTP config (admin+hr only)."""
    permission_classes = [IsAuthenticated]

    def _require_admin(self, request) -> Response | None:
        if not (getattr(request.user, 'admin', False) and getattr(request.user, 'hr', False)):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    def get(self, request) -> Response:
        err = self._require_admin(request)
        if err:
            return err
        config = EmailConfiguration.objects.first()
        if not config:
            return Response(None)
        return Response(EmailConfigSerializer(config).data)

    def put(self, request) -> Response:
        err = self._require_admin(request)
        if err:
            return err
        config = EmailConfiguration.objects.first()
        if config:
            ser = EmailConfigSerializer(config, data=request.data)
        else:
            ser = EmailConfigSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        ser.save()
        return Response(ser.data)
