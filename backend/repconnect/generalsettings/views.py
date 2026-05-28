import smtplib
import logging
from decimal import Decimal
from email.message import EmailMessage
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    CompanyWorkdayConfiguration,
    Department,
    EmailConfiguration,
    EmploymentType,
    Line,
    MemoAdvertisement,
    MemoAdvertisementSettings,
    Office,
    PasswordPolicy,
    Position,
    Shift,
)
from .workdays import build_weekday_durations, normalize_weekday_durations, normalize_workdays

logger = logging.getLogger(__name__)


def _require_admin(request) -> Response | None:
    if not getattr(request.user, "admin", False):
        return Response({"detail": "Admin permission required."}, status=status.HTTP_403_FORBIDDEN)
    return None


def _require_admin_or_hr(request) -> Response | None:
    if not (getattr(request.user, "admin", False) or getattr(request.user, "hr", False)):
        return Response({"detail": "Admin or HR permission required."}, status=status.HTTP_403_FORBIDDEN)
    return None


def _delete_conflict_response(entity_name: str) -> Response:
    return Response(
        {"detail": f"Cannot delete this {entity_name} because it is referenced by other records."},
        status=status.HTTP_400_BAD_REQUEST,
    )


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = ("id", "name", "start_time", "end_time")


class OfficeSerializer(serializers.ModelSerializer):
    shifts = serializers.PrimaryKeyRelatedField(queryset=Shift.objects.all(), many=True, required=False)

    class Meta:
        model = Office
        fields = ("id", "name", "shifts")


class OfficeReadSerializer(serializers.ModelSerializer):
    shifts = ShiftSerializer(many=True, read_only=True)

    class Meta:
        model = Office
        fields = ("id", "name", "shifts")


class DepartmentSerializer(serializers.ModelSerializer):
    office_name = serializers.CharField(source="office.name", read_only=True)

    class Meta:
        model = Department
        fields = ("id", "name", "office", "office_name")


class LineSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)

    class Meta:
        model = Line
        fields = ("id", "name", "department", "department_name")


class PositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Position
        fields = ("id", "name", "level_of_approval")


class EmploymentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmploymentType
        fields = ("id", "name")


class EmailConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailConfiguration
        fields = (
            "id",
            "provider",
            "smtp_host",
            "smtp_port",
            "use_ssl",
            "use_tls",
            "username",
            "password",
            "from_name",
            "from_address",
        )
        extra_kwargs = {"password": {"write_only": True}}


class PasswordPolicyReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = PasswordPolicy
        fields = (
            "min_length",
            "require_uppercase",
            "require_lowercase",
            "require_number",
            "require_special_character",
            "password_expiry_days",
            "default_password_prefix",
            "enable_account_lockout",
            "max_failed_login_attempts",
        )


class PasswordPolicyAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = PasswordPolicy
        fields = (
            "require_change_on_first_login",
            "min_length",
            "require_uppercase",
            "require_lowercase",
            "require_number",
            "require_special_character",
            "password_expiry_days",
            "default_password_prefix",
            "enable_account_lockout",
            "max_failed_login_attempts",
        )


class CompanyWorkdayConfigurationSerializer(serializers.ModelSerializer):
    half_day_hours = serializers.SerializerMethodField(read_only=True)
    weekday_durations = serializers.DictField(required=False)

    class Meta:
        model = CompanyWorkdayConfiguration
        fields = ("workdays", "hours_per_day", "weekday_durations", "half_day_hours")

    def validate_workdays(self, value: list[int]) -> list[int]:
        normalized = normalize_workdays(value)
        if not normalized:
            raise serializers.ValidationError('At least one working day must be selected.')
        return normalized

    def validate_hours_per_day(self, value: Decimal) -> Decimal:
        dec = Decimal(str(value))
        if dec <= Decimal('0'):
            raise serializers.ValidationError('Hours per day must be greater than 0.')
        if dec > Decimal('24'):
            raise serializers.ValidationError('Hours per day cannot exceed 24.')
        return dec.quantize(Decimal('0.1'))

    def validate_weekday_durations(self, value: dict[str, Any]) -> dict[str, float]:
        if not isinstance(value, dict):
            raise serializers.ValidationError('Weekday durations must be an object.')

        normalized: dict[str, float] = {}
        for day in range(7):
            raw_value = value.get(str(day), value.get(day, 0))
            if raw_value in (None, ''):
                raw_value = 0
            try:
                duration = Decimal(str(raw_value)).quantize(Decimal('0.1'))
            except Exception as exc:
                raise serializers.ValidationError({str(day): 'Enter a valid duration.'}) from exc

            if duration < Decimal('0'):
                raise serializers.ValidationError({str(day): 'Duration cannot be negative.'})
            if duration > Decimal('24'):
                raise serializers.ValidationError({str(day): 'Duration cannot exceed 24 hours.'})
            normalized[str(day)] = float(duration)

        if not any(value > 0 for value in normalized.values()):
            raise serializers.ValidationError('At least one weekday duration must be greater than 0.')

        return normalized

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance = getattr(self, 'instance', None)
        current_workdays = attrs.get('workdays', getattr(instance, 'workdays', None))
        current_hours = attrs.get('hours_per_day', getattr(instance, 'hours_per_day', Decimal('8')))
        weekday_durations = attrs.get('weekday_durations')

        if weekday_durations is None:
            if instance is not None and getattr(instance, 'weekday_durations', None):
                attrs['weekday_durations'] = normalize_weekday_durations(
                    instance.weekday_durations,
                    workdays=current_workdays,
                    hours_per_day=current_hours,
                )
            else:
                attrs['weekday_durations'] = build_weekday_durations(
                    current_workdays,
                    hours_per_day=current_hours,
                )
            return attrs

        derived_workdays = [int(day) for day, duration in weekday_durations.items() if Decimal(str(duration)) > Decimal('0')]
        attrs['workdays'] = normalize_workdays(derived_workdays)
        return attrs

    def get_half_day_hours(self, obj: CompanyWorkdayConfiguration) -> str:
        half = (Decimal(str(obj.hours_per_day)) / Decimal('2')).quantize(Decimal('0.1'))
        return str(half)

    def to_representation(self, instance: CompanyWorkdayConfiguration) -> dict[str, Any]:
        data = super().to_representation(instance)
        data['weekday_durations'] = normalize_weekday_durations(
            getattr(instance, 'weekday_durations', None),
            workdays=instance.workdays,
            hours_per_day=instance.hours_per_day,
        )
        return data


class ShiftListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        data = ShiftSerializer(Shift.objects.all(), many=True).data
        return Response(data)

    def post(self, request) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        ser = ShiftSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)


class ShiftDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        shift = Shift.objects.filter(pk=pk).first()
        if not shift:
            return Response({"detail": "Shift not found."}, status=status.HTTP_404_NOT_FOUND)
        ser = ShiftSerializer(shift, data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        try:
            deleted, _ = Shift.objects.filter(pk=pk).delete()
        except (ProtectedError, IntegrityError):
            return _delete_conflict_response("shift")
        if not deleted:
            return Response({"detail": "Shift not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OfficeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        data = OfficeReadSerializer(Office.objects.prefetch_related("shifts"), many=True).data
        return Response(data)

    def post(self, request) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        ser = OfficeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        office = ser.save()
        return Response(OfficeReadSerializer(office).data, status=status.HTTP_201_CREATED)


class OfficeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        office = Office.objects.filter(pk=pk).first()
        if not office:
            return Response({"detail": "Office not found."}, status=status.HTTP_404_NOT_FOUND)
        ser = OfficeSerializer(office, data=request.data)
        ser.is_valid(raise_exception=True)
        office = ser.save()
        return Response(OfficeReadSerializer(office).data)

    def delete(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        try:
            deleted, _ = Office.objects.filter(pk=pk).delete()
        except (ProtectedError, IntegrityError):
            return _delete_conflict_response("office")
        if not deleted:
            return Response({"detail": "Office not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DepartmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        qs = Department.objects.select_related("office").order_by("office", "name")
        return Response(DepartmentSerializer(qs, many=True).data)

    def post(self, request) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        ser = DepartmentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)


class DepartmentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        obj = Department.objects.filter(pk=pk).first()
        if not obj:
            return Response({"detail": "Department not found."}, status=status.HTTP_404_NOT_FOUND)
        ser = DepartmentSerializer(obj, data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        try:
            deleted, _ = Department.objects.filter(pk=pk).delete()
        except (ProtectedError, IntegrityError):
            return _delete_conflict_response("department")
        if not deleted:
            return Response({"detail": "Department not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class LineListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        qs = Line.objects.select_related("department").order_by("department", "name")
        department_id = request.query_params.get("department")
        if department_id:
            try:
                qs = qs.filter(department_id=int(department_id))
            except (TypeError, ValueError):
                return Response({"detail": "Invalid department id."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(LineSerializer(qs, many=True).data)

    def post(self, request) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        ser = LineSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)


class LineDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        obj = Line.objects.filter(pk=pk).first()
        if not obj:
            return Response({"detail": "Line not found."}, status=status.HTTP_404_NOT_FOUND)
        ser = LineSerializer(obj, data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        try:
            deleted, _ = Line.objects.filter(pk=pk).delete()
        except (ProtectedError, IntegrityError):
            return _delete_conflict_response("line")
        if not deleted:
            return Response({"detail": "Line not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PositionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        return Response(PositionSerializer(Position.objects.all().order_by("-level_of_approval", "name"), many=True).data)

    def post(self, request) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        ser = PositionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)


class PositionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        obj = Position.objects.filter(pk=pk).first()
        if not obj:
            return Response({"detail": "Position not found."}, status=status.HTTP_404_NOT_FOUND)
        ser = PositionSerializer(obj, data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        try:
            deleted, _ = Position.objects.filter(pk=pk).delete()
        except (ProtectedError, IntegrityError):
            return _delete_conflict_response("position")
        if not deleted:
            return Response({"detail": "Position not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmploymentTypeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        return Response(EmploymentTypeSerializer(EmploymentType.objects.all().order_by("name"), many=True).data)

    def post(self, request) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        ser = EmploymentTypeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)


class EmploymentTypeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        obj = EmploymentType.objects.filter(pk=pk).first()
        if not obj:
            return Response({"detail": "Employment type not found."}, status=status.HTTP_404_NOT_FOUND)
        ser = EmploymentTypeSerializer(obj, data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, pk: int) -> Response:
        err = _require_admin_or_hr(request)
        if err:
            return err
        try:
            deleted, _ = EmploymentType.objects.filter(pk=pk).delete()
        except (ProtectedError, IntegrityError):
            return _delete_conflict_response("employment type")
        if not deleted:
            return Response({"detail": "Employment type not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmailConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        err = _require_admin(request)
        if err:
            return err
        config = EmailConfiguration.objects.first()
        if not config:
            return Response(None)
        return Response(EmailConfigSerializer(config).data)

    def put(self, request) -> Response:
        err = _require_admin(request)
        if err:
            return err
        config = EmailConfiguration.objects.first()
        if config:
            ser = EmailConfigSerializer(config, data=request.data)
        else:
            ser = EmailConfigSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class MemoAdvertisementSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = MemoAdvertisementSettings
        fields = ("enabled",)


class MemoAdvertisementSerializer(serializers.ModelSerializer):
    class Meta:
        model = MemoAdvertisement
        fields = ("id", "title", "description", "active", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class MemoAdvertisementSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        settings = MemoAdvertisementSettings.get()
        return Response(MemoAdvertisementSettingsSerializer(settings).data)

    def put(self, request) -> Response:
        err = _require_admin(request)
        if err:
            return err
        settings = MemoAdvertisementSettings.get()
        ser = MemoAdvertisementSettingsSerializer(settings, data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class MemoAdvertisementListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        memos = list(MemoAdvertisement.objects.order_by("created_at").all())
        return Response(MemoAdvertisementSerializer(memos, many=True).data)

    def post(self, request) -> Response:
        err = _require_admin(request)
        if err:
            return err
        ser = MemoAdvertisementSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)


class MemoAdvertisementDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk: int) -> Response:
        err = _require_admin(request)
        if err:
            return err
        memo = MemoAdvertisement.objects.filter(pk=pk).first()
        if not memo:
            return Response({"detail": "Memo not found."}, status=status.HTTP_404_NOT_FOUND)
        ser = MemoAdvertisementSerializer(memo, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, pk: int) -> Response:
        err = _require_admin(request)
        if err:
            return err
        deleted, _ = MemoAdvertisement.objects.filter(pk=pk).delete()
        if not deleted:
            return Response({"detail": "Memo not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TestEmailView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request) -> Response:
        err = _require_admin(request)
        if err:
            return err

        config = EmailConfiguration.objects.first()
        if not config:
            return Response({"detail": "Email configuration is not set."}, status=status.HTTP_400_BAD_REQUEST)

        recipient = request.data.get("recipient")
        if not recipient:
            return Response({"detail": "recipient is required."}, status=status.HTTP_400_BAD_REQUEST)

        message = EmailMessage()
        message["Subject"] = "RepConnect SMTP Test"
        from_addr = config.from_address or config.username
        message["From"] = f"{config.from_name} <{from_addr}>" if config.from_name else from_addr
        message["To"] = recipient
        message.set_content(
            "This is a test message sent from the RepConnect system. "
            "If you received this email, your SMTP configuration is working correctly."
        )
        message.add_alternative(
            """
            <html>
              <body style=\"font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;\">
                <div style=\"max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;\">
                  <div style=\"background: #2845D6; color: #ffffff; padding: 16px 20px;\">
                    <h2 style=\"margin: 0; font-size: 18px;\">RepConnect SMTP Test Email</h2>
                  </div>
                  <div style=\"padding: 20px;\">
                    <p style=\"margin-top: 0;\">Hello,</p>
                    <p>
                      This is a <strong>test message</strong> sent from the RepConnect system to verify your
                      Email Configuration settings.
                    </p>
                    <p>
                      If you received this email successfully, your SMTP credentials and delivery settings are
                      configured correctly.
                    </p>
                    <p style=\"margin-bottom: 0;\">Regards,<br />RepConnect System</p>
                  </div>
                </div>
              </body>
            </html>
            """,
            subtype="html",
        )

        try:
            if config.use_ssl:
                with smtplib.SMTP_SSL(config.smtp_host, config.smtp_port, timeout=15) as server:
                    server.login(config.username, config.password)
                    server.send_message(message)
            else:
                with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=15) as server:
                    if config.use_tls:
                        server.starttls()
                    server.login(config.username, config.password)
                    server.send_message(message)
        except Exception as exc:
            return Response({"detail": f"Failed to send test email: {exc}"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": "Test email sent successfully."})


class PasswordPolicyReadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        return Response(PasswordPolicyReadSerializer(PasswordPolicy.get()).data)


class PasswordPolicyAdminView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        err = _require_admin(request)
        if err:
            return err
        return Response(PasswordPolicyAdminSerializer(PasswordPolicy.get()).data)

    def put(self, request) -> Response:
        err = _require_admin(request)
        if err:
            return err
        policy = PasswordPolicy.get()
        ser = PasswordPolicyAdminSerializer(policy, data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class CompanyWorkdayConfigurationView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _recalculate_leave_balances(old_hours: Decimal, new_hours: Decimal) -> int:
        if old_hours <= Decimal('0') or old_hours == new_hours:
            return 0

        from leave.models import LeaveBalance

        balances = list(LeaveBalance.objects.select_for_update().all())
        if not balances:
            return 0

        for balance in balances:
            entitled = Decimal(str(balance.entitled_leave))
            used = Decimal(str(balance.used_leave))
            balance.entitled_leave = ((entitled / old_hours) * new_hours).quantize(Decimal('0.1'))
            balance.used_leave = ((used / old_hours) * new_hours).quantize(Decimal('0.1'))

        LeaveBalance.objects.bulk_update(balances, ['entitled_leave', 'used_leave'])
        return len(balances)

    def get(self, request) -> Response:
        try:
            config = CompanyWorkdayConfiguration.get()
            return Response(CompanyWorkdayConfigurationSerializer(config).data)
        except Exception as exc:
            logger.exception("Failed to load workday schedule")
            return Response(
                {"detail": "Could not load workday schedule.", "error": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def put(self, request) -> Response:
        try:
            err = _require_admin(request)
            if err:
                return err

            with transaction.atomic():
                config = CompanyWorkdayConfiguration.get()
                old_hours = Decimal(str(config.hours_per_day)).quantize(Decimal('0.1'))

                ser = CompanyWorkdayConfigurationSerializer(config, data=request.data)
                ser.is_valid(raise_exception=True)
                updated_config = ser.save()

                new_hours = Decimal(str(updated_config.hours_per_day)).quantize(Decimal('0.1'))
                recalculated = self._recalculate_leave_balances(old_hours, new_hours)

                payload = CompanyWorkdayConfigurationSerializer(updated_config).data
                payload['balances_recalculated'] = recalculated
                return Response(payload)
        except serializers.ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Failed to update workday schedule")
            return Response(
                {"detail": "Could not update workday schedule.", "error": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def post(self, request) -> Response:
        return self.put(request)


class AdminAccountSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    idnumber = serializers.CharField(read_only=True)
    firstname = serializers.CharField(read_only=True, allow_null=True)
    lastname = serializers.CharField(read_only=True, allow_null=True)
    active = serializers.BooleanField(required=False)
    locked = serializers.BooleanField(read_only=True)
    failed_login_attempts = serializers.IntegerField(read_only=True)
    admin = serializers.BooleanField(required=False)
    hr = serializers.BooleanField(required=False)
    accounting = serializers.BooleanField(required=False)
    mis = serializers.BooleanField(required=False)
    iad = serializers.BooleanField(required=False)
    clinic = serializers.BooleanField(required=False)
    hr_manager = serializers.BooleanField(required=False)


class AdminAccountListUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        err = _require_admin(request)
        if err:
            return err

        from userLogin.models import loginCredentials

        users = loginCredentials.objects.all().order_by("lastname", "firstname", "idnumber")
        data = AdminAccountSerializer(users, many=True).data
        return Response(data)

    def patch(self, request, pk: int) -> Response:
        err = _require_admin(request)
        if err:
            return err

        from userLogin.models import loginCredentials

        user = loginCredentials.objects.filter(pk=pk).first()
        if not user:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        # Handle unlock action
        action = request.data.get("action", "").strip()
        if action == "unlock":
            if user.pk == request.user.pk:
                return Response({"detail": "You cannot unlock your own account."}, status=status.HTTP_400_BAD_REQUEST)
            user.locked = False
            user.locked_at = None
            user.failed_login_attempts = 0
            user.last_failed_attempt = None
            user.save(update_fields=["locked", "locked_at", "failed_login_attempts", "last_failed_attempt"])
            # Send email notification if email is configured
            try:
                from generalsettings.models import EmailConfiguration
                import smtplib
                from email.message import EmailMessage as StdEmailMessage
                config = EmailConfiguration.objects.first()
                if config and user.email:
                    msg = StdEmailMessage()
                    msg["Subject"] = "Your REPConnect Account Has Been Unlocked"
                    from_addr = config.from_address or config.username
                    msg["From"] = f"{config.from_name} <{from_addr}>" if config.from_name else from_addr
                    msg["To"] = user.email
                    msg.set_content(
                        f"Hello {user.firstname or user.idnumber},\n\n"
                        "Your REPConnect account has been unlocked by an administrator. "
                        "You may now log in again. If you did not expect this, please contact HR immediately.\n\n"
                        "— REPConnect System"
                    )
                    if config.use_ssl:
                        with smtplib.SMTP_SSL(config.smtp_host, config.smtp_port, timeout=10) as srv:
                            srv.login(config.username, config.password)
                            srv.send_message(msg)
                    else:
                        with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=10) as srv:
                            if config.use_tls:
                                srv.starttls()
                            srv.login(config.username, config.password)
                            srv.send_message(msg)
            except Exception:
                pass  # Notification failure must not block the unlock response
            return Response(AdminAccountSerializer(user).data)

        serializer = AdminAccountSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        payload_any: Any = serializer.validated_data
        payload: dict[str, Any] = payload_any if isinstance(payload_any, dict) else {}

        role_fields = ["admin", "hr", "accounting", "mis", "iad", "clinic", "hr_manager", "active"]

        for field in role_fields:
            if field in payload:
                setattr(user, field, bool(payload[field]))

        if user.pk == request.user.pk and not user.admin:
            return Response(
                {"detail": "You cannot remove your own admin role from this endpoint."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if "admin" in payload and not user.admin:
            admin_count = loginCredentials.objects.filter(admin=True).count()
            if admin_count <= 1:
                return Response(
                    {"detail": "At least one admin account must remain."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        update_fields = [f for f in role_fields if f in payload]
        if not update_fields:
            return Response({"detail": "No updatable fields provided."}, status=status.HTTP_400_BAD_REQUEST)

        user.save(update_fields=update_fields)
        return Response(AdminAccountSerializer(user).data)
