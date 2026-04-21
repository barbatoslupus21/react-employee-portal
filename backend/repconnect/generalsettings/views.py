from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Department, EmailConfiguration, EmploymentType, Line, PasswordPolicy, Position


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


# ── Password Policy (read-only for users) ─────────────────────────────────────

class PasswordPolicyReadView(APIView):
    """GET /api/general-settings/password-policy — returns current policy (authenticated)."""

    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        policy = PasswordPolicy.get()
        return Response({
            'min_length':               policy.min_length,
            'require_uppercase':        policy.require_uppercase,
            'require_lowercase':        policy.require_lowercase,
            'require_number':           policy.require_number,
            'require_special_character': policy.require_special_character,
        })


# ── Department list ────────────────────────────────────────────────────────────

class DepartmentListView(APIView):
    """GET /api/general-settings/departments — list all departments."""

    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        qs = Department.objects.select_related('office').order_by('office', 'name')
        data = [
            {
                'id':          d.id,
                'name':        d.name,
                'office_id':   d.office_id,
                'office_name': d.office.name,
            }
            for d in qs
        ]
        return Response(data)


# ── Line list ──────────────────────────────────────────────────────────────────

class LineListView(APIView):
    """
    GET /api/general-settings/lines — list lines.
    Accepts optional ?department=<id> query param to filter by department.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        qs = Line.objects.select_related('department').order_by('department', 'name')
        dept_id = request.query_params.get('department')
        if dept_id:
            try:
                qs = qs.filter(department_id=int(dept_id))
            except (ValueError, TypeError):
                return Response(
                    {'detail': 'Invalid department id.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        data = [
            {
                'id':              l.id,
                'name':            l.name,
                'department_id':   l.department_id,
                'department_name': l.department.name,
            }
            for l in qs
        ]
        return Response(data)


# ── Position list ──────────────────────────────────────────────────────────────

class PositionListView(APIView):
    """GET /api/general-settings/positions — list all positions (read-only for users)."""

    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        qs = Position.objects.order_by('-level_of_approval', 'name')
        data = [
            {
                'id':                p.id,
                'name':              p.name,
                'level_of_approval': p.level_of_approval,
            }
            for p in qs
        ]
        return Response(data)


# ── Employment Type list ───────────────────────────────────────────────────────

class EmploymentTypeListView(APIView):
    """GET /api/general-settings/employment-types — list all employment types (read-only)."""

    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        qs = EmploymentType.objects.order_by('name')
        data = [{'id': e.id, 'name': e.name} for e in qs]
        return Response(data)



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
