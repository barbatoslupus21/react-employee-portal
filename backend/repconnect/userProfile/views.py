"""
Views for the userProfile app.

All write endpoints:
  * Require IsAuthenticated.
  * Are wrapped in @transaction.atomic.
  * Accept an X-Idempotency-Key header (24-hour TTL check via Django cache).
  * Activity logging is handled automatically by ActivityLogMiddleware.

Endpoint map
------------
  GET    /api/user-profile/me                 ProfileGetView
  PATCH  /api/user-profile/personal-info      PersonalInfoUpdateView
  PATCH  /api/user-profile/present-address    PresentAddressUpdateView
  PATCH  /api/user-profile/provincial-address ProvincialAddressUpdateView
  PATCH  /api/user-profile/emergency-contact  EmergencyContactUpdateView
  PATCH  /api/user-profile/family-background  FamilyBackgroundUpdateView
  PUT    /api/user-profile/children           ChildRecordsUpdateView
  PUT    /api/user-profile/education          EducationRecordsUpdateView
  PATCH  /api/user-profile/work-info          WorkInfoUserUpdateView
  PATCH  /api/user-profile/avatar             AvatarUpdateView
  POST   /api/user-profile/change-password    ChangePasswordView
  GET    /api/user-profile/approvers          ApproverListView
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import calendar as _cal_mod
import datetime
import uuid as _uuid_mod
from typing import Any, cast

from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from userLogin.models import loginCredentials

from .models import (
    ChildRecord,
    EducationRecord,
    EmergencyContact,
    FamilyBackground,
    PersonalInformation,
    PresentAddress,
    ProvincialAddress,
    Skill,
    workInformation,
)
from .serializers import (
    AvatarSerializer,
    BasicInfoSerializer,
    ChangePasswordSerializer,
    ChildRecordSerializer,
    EducationRecordSerializer,
    EmergencyContactSerializer,
    FamilyBackgroundSerializer,
    PersonalInfoSerializer,
    PresentAddressSerializer,
    ProfileGetSerializer,
    ProvincialAddressSerializer,
    SkillSerializer,
    WorkInfoReadSerializer,
    WorkInfoAdminSerializer,
    WorkInfoUserSerializer,
)


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _idempotency_guard(request) -> Response | None:
    """
    If the request carries an X-Idempotency-Key header that was seen within
    the last 24 hours, return the cached response so the caller gets the exact
    same result without re-running the mutation.  Returns None when the key is
    new or absent.
    """
    key = request.headers.get('X-Idempotency-Key', '').strip()
    if not key:
        return None
    cache_key = f'idem:{key}'
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached, status=status.HTTP_200_OK)
    return None


def _cache_idempotency(request, data: Any) -> None:
    key = request.headers.get('X-Idempotency-Key', '').strip()
    if key:
        cache.set(f'idem:{key}', data, timeout=60 * 60 * 24)


def _normalize_idempotency_payload(data: Any) -> Any:
    if isinstance(data, Mapping):
        return dict(data)
    if isinstance(data, Sequence) and not isinstance(data, (str, bytes, bytearray)):
        return list(data)
    return data


def _assemble_profile(user) -> dict:
    """
    Build the aggregate dict consumed by ProfileGetSerializer.
    get_or_create ensures all OneToOne sub-models exist even for new users.
    """
    personal_info,      _ = PersonalInformation.objects.get_or_create(employee=user)
    present_address,    _ = PresentAddress.objects.get_or_create(employee=user)
    provincial_address, _ = ProvincialAddress.objects.get_or_create(employee=user)
    emergency_contact,  _ = EmergencyContact.objects.get_or_create(employee=user)
    family_background,  _ = FamilyBackground.objects.get_or_create(employee=user)
    children              = ChildRecord.objects.filter(employee=user)
    education_records     = EducationRecord.objects.filter(employee=user)
    work_info             = workInformation.objects.filter(employee=user).first()

    return {
        'employee':           user,
        'personal_info':      personal_info,
        'present_address':    present_address,
        'provincial_address': provincial_address,
        'emergency_contact':  emergency_contact,
        'family_background':  family_background,
        'children':           children,
        'education_records':  education_records,
        'work_info':          work_info,
    }


# ── PATCH /api/user-profile/basic-info ───────────────────────────────────────

class BasicInfoUpdateView(APIView):
    """Updates firstname, lastname, and email on the loginCredentials model."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request) -> Response:
        guard = _idempotency_guard(request)
        if guard:
            return guard

        user = loginCredentials.objects.select_for_update().get(pk=request.user.pk)
        ser = BasicInfoSerializer(user, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        ser.update(user, ser.validated_data)
        result = {'firstname': user.firstname, 'lastname': user.lastname, 'email': user.email}
        _cache_idempotency(request, result)
        return Response(result)


# ── GET /api/user-profile/me ───────────────────────────────────────────────────

class ProfileGetView(APIView):
    """Return the full profile aggregate for the authenticated user."""

    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        data = _assemble_profile(request.user)
        ser  = ProfileGetSerializer(data, context={'request': request})
        return Response(ser.data)


# ── PATCH /api/user-profile/personal-info ─────────────────────────────────────

class PersonalInfoUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request) -> Response:
        guard = _idempotency_guard(request)
        if guard:
            return guard

        obj, _ = PersonalInformation.objects.get_or_create(employee=request.user)
        ser = PersonalInfoSerializer(obj, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        ser.save()
        _cache_idempotency(request, _normalize_idempotency_payload(ser.data))
        return Response(ser.data)


# ── PATCH /api/user-profile/present-address ───────────────────────────────────

class PresentAddressUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request) -> Response:
        guard = _idempotency_guard(request)
        if guard:
            return guard

        obj, _ = PresentAddress.objects.get_or_create(employee=request.user)
        ser = PresentAddressSerializer(obj, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        ser.save()
        _cache_idempotency(request, _normalize_idempotency_payload(ser.data))
        return Response(ser.data)


# ── PATCH /api/user-profile/provincial-address ────────────────────────────────

class ProvincialAddressUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request) -> Response:
        guard = _idempotency_guard(request)
        if guard:
            return guard

        obj, _ = ProvincialAddress.objects.get_or_create(employee=request.user)
        ser = ProvincialAddressSerializer(obj, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        ser.save()
        _cache_idempotency(request, _normalize_idempotency_payload(ser.data))
        return Response(ser.data)


# ── PATCH /api/user-profile/emergency-contact ─────────────────────────────────

class EmergencyContactUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request) -> Response:
        guard = _idempotency_guard(request)
        if guard:
            return guard

        obj, _ = EmergencyContact.objects.get_or_create(employee=request.user)
        ser = EmergencyContactSerializer(obj, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        ser.save()
        _cache_idempotency(request, _normalize_idempotency_payload(ser.data))
        return Response(ser.data)


# ── PATCH /api/user-profile/family-background ─────────────────────────────────

class FamilyBackgroundUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request) -> Response:
        guard = _idempotency_guard(request)
        if guard:
            return guard

        obj, _ = FamilyBackground.objects.get_or_create(employee=request.user)
        ser = FamilyBackgroundSerializer(obj, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        ser.save()
        _cache_idempotency(request, ser.data)
        return Response(ser.data)


# ── PUT /api/user-profile/children ────────────────────────────────────────────

class ChildRecordsUpdateView(APIView):
    """
    Full replacement: deletes all existing child records for the user and
    recreates them from the submitted list.  An empty list clears all records.
    """

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def put(self, request) -> Response:
        guard = _idempotency_guard(request)
        if guard:
            return guard

        items = request.data
        if not isinstance(items, list):
            return Response(
                {'detail': 'Expected a list of child records.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = ChildRecordSerializer(data=items, many=True)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        ChildRecord.objects.filter(employee=request.user).delete()
        validated_items = cast(list[dict[str, Any]], ser.validated_data)
        ChildRecord.objects.bulk_create([
            ChildRecord(employee=request.user, name=item['name'])
            for item in validated_items
        ])

        result = ChildRecordSerializer(
            ChildRecord.objects.filter(employee=request.user), many=True
        ).data
        _cache_idempotency(request, _normalize_idempotency_payload(result))
        return Response(result)


# ── PUT /api/user-profile/education ───────────────────────────────────────────

class EducationRecordsUpdateView(APIView):
    """Full replacement of all education records for the authenticated user."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def put(self, request) -> Response:
        guard = _idempotency_guard(request)
        if guard:
            return guard

        items = request.data
        if not isinstance(items, list):
            return Response(
                {'detail': 'Expected a list of education records.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = EducationRecordSerializer(data=items, many=True)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        EducationRecord.objects.filter(employee=request.user).delete()
        validated_items = cast(list[dict[str, Any]], ser.validated_data)
        EducationRecord.objects.bulk_create([
            EducationRecord(
                employee=request.user,
                institution=item['institution'],
                education_level=item.get('education_level', ''),
                degree=item.get('degree', ''),
                year_attended=item.get('year_attended'),
            )
            for item in validated_items
        ])

        result = EducationRecordSerializer(
            EducationRecord.objects.filter(employee=request.user), many=True
        ).data
        _cache_idempotency(request, _normalize_idempotency_payload(result))
        return Response(result)


# ── PATCH /api/user-profile/work-info ─────────────────────────────────────────

class WorkInfoUserUpdateView(APIView):
    """
    Allows the user to update department, line, and approver only.
    Admin-only fields are never reachable through this endpoint.
    """

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request) -> Response:
        guard = _idempotency_guard(request)
        if guard:
            return guard

        obj = workInformation.objects.filter(employee=request.user).first()
        if obj is None:
            return Response(
                {'detail': 'No work information record exists for this user. Contact HR.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        ser = WorkInfoUserSerializer(obj, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        # Validate that the chosen approver meets eligibility rules:
        # • position level >= 5
        # • position level strictly above the current user's level
        # • not a privileged account (admin / hr / accounting)
        validated = ser.validated_data
        approver  = validated.get('approver')
        if approver is not None:
            current_level = (
                obj.position.level_of_approval if obj.position else 0
            )
            # Reject privileged accounts as approvers
            if getattr(approver, 'admin', False) or getattr(approver, 'hr', False) or getattr(approver, 'accounting', False):
                return Response(
                    {'approver': 'The selected approver cannot be a privileged account.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Resolve approver's work info to get their position level
            approver_wi = workInformation.objects.filter(employee=approver).first()
            approver_level = (
                approver_wi.position.level_of_approval
                if approver_wi and approver_wi.position
                else 0
            )
            if approver_level < 3 or approver_level <= current_level:
                return Response(
                    {'approver': 'The selected approver must be at position level 3 or above and have a higher position level than yours.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        ser.save()

        # Refresh and return full read view
        obj.refresh_from_db()
        read_data = WorkInfoReadSerializer(obj, context={'request': request}).data
        _cache_idempotency(request, read_data)
        return Response(read_data)


# ── PATCH /api/user-profile/avatar ────────────────────────────────────────────

class AvatarUpdateView(APIView):
    """
    Accepts multipart/form-data with an ``avatar`` file field.
    Pillow verification in the serializer blocks MIME-spoofed uploads.
    """

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request) -> Response:
        ser = AvatarSerializer(request.user, data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        ser.save()
        avatar_url = f'/media/{request.user.avatar}' if request.user.avatar else None
        return Response({'avatar': avatar_url})


# ── POST /api/user-profile/change-password ────────────────────────────────────

class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request) -> Response:
        ser = ChangePasswordSerializer(
            data=request.data,
            context={'employee': request.user},
        )
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user.__class__.objects.select_for_update().get(pk=request.user.pk)
        user.password = make_password(ser.validated_data['new_password'])
        user.change_password = False
        user.save(update_fields=['password', 'change_password'])

        return Response({'detail': 'Password changed successfully.'})


# ── GET /api/user-profile/approvers ───────────────────────────────────────────

class ApproverListView(APIView):
    """
    Returns users eligible to be the current user's approver.

    Eligibility rules:
      • Active, non-privileged employee (admin=False, hr=False, accounting=False)
      • In the same department as the current user (resolved from their own
        work-information record, not a query parameter)
      • Position level_of_approval >= 5  AND  strictly greater than the
        current user's own level_of_approval
    """

    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        current_wi = workInformation.objects.filter(employee=request.user).first()
        current_level = (
            current_wi.position.level_of_approval
            if current_wi and current_wi.position
            else 0
        )
        current_dept_id = current_wi.department_id if current_wi else None

        # Optionally accept ?department=<id> to override (used by frontend when
        # the user is changing their department in the edit form before saving).
        dept_id_param = request.query_params.get('department')
        if dept_id_param:
            try:
                filter_dept_id = int(dept_id_param)
            except (ValueError, TypeError):
                return Response(
                    {'detail': 'Invalid department id.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            filter_dept_id = current_dept_id

        qs = workInformation.objects.select_related(
            'employee', 'position', 'department'
        ).filter(
            employee__active=True,
            employee__admin=False,
            employee__hr=False,
            employee__accounting=False,
            position__level_of_approval__gte=3,
            position__level_of_approval__gt=current_level,
        )

        if filter_dept_id is not None:
            qs = qs.filter(department_id=filter_dept_id)

        results = []
        seen = set()
        for wi in qs.order_by('position__level_of_approval', 'employee__lastname'):
            emp = wi.employee
            if emp.pk in seen:
                continue
            seen.add(emp.pk)
            name_parts = [part for part in [emp.firstname, emp.lastname] if part]
            results.append({
                'id':             emp.pk,
                'idnumber':       emp.idnumber,
                'name':           ' '.join(name_parts) or emp.idnumber,
                'avatar':         (f'/media/{emp.avatar}' if emp.avatar else None),
                'position':       wi.position.name if wi.position else None,
                'position_level': wi.position.level_of_approval if wi.position else 0,
            })

        return Response(results)


# ── PUT /api/user-profile/skills ──────────────────────────────────────────────────

class SkillsUpdateView(APIView):
    """
    Full replacement of all skill entries for the authenticated user.
    Accepts a JSON list of {"name": "..."} objects.
    An empty list clears all skills.
    """

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def put(self, request) -> Response:
        guard = _idempotency_guard(request)
        if guard:
            return guard

        items = request.data
        if not isinstance(items, list):
            return Response(
                {'detail': 'Expected a list of skill objects.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Deduplicate and validate
        seen: set[str] = set()
        new_skills: list[Skill] = []
        for item in items:
            if not isinstance(item, dict) or 'name' not in item:
                return Response(
                    {'detail': 'Each skill must have a "name" field.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            name = str(item['name']).strip()[:100]
            if not name or name in seen:
                continue
            seen.add(name)
            new_skills.append(Skill(employee=request.user, name=name))

        Skill.objects.filter(employee=request.user).delete()
        Skill.objects.bulk_create(new_skills)

        result = SkillSerializer(
            Skill.objects.filter(employee=request.user), many=True
        ).data
        _cache_idempotency(request, list(result))
        return Response(result)


# ── GET /api/user-profile/admin-approvers ─────────────────────────────────────

class AdminAllApproversView(APIView):
    """
    GET /api/user-profile/admin-approvers
    Returns all active, non-privileged users that may be assigned as an
    approver in the admin-facing work-info edit form.

    Excluded users: admin=True, hr=True, accounting=True, or active=False.
    No department or position-level filter is applied here — cross-department
    approver assignment is explicitly allowed in the admin context.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        if not (request.user.admin or request.user.hr):
            return Response(
                {'detail': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = loginCredentials.objects.filter(
            active=True,
            admin=False,
            hr=False,
            accounting=False,
        ).order_by('lastname', 'firstname')

        results = []
        for emp in qs:
            name_parts = [part for part in [emp.firstname, emp.lastname] if part]
            results.append({
                'id':       emp.pk,
                'idnumber': emp.idnumber,
                'name':     ' '.join(name_parts) if name_parts else emp.idnumber,
            })

        return Response(results)


# ── GET /api/user-profile/<idnumber>/admin ────────────────────────────────────

class EmployeeProfileAdminView(APIView):
    """
    GET /api/user-profile/<idnumber>/admin
    Allows admin or HR to fetch the full profile of any employee by idnumber.
    Read-only — no mutations allowed on this endpoint.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, idnumber: str) -> Response:
        from userLogin.models import loginCredentials as EmpUser

        requester = request.user
        if not (requester.admin or requester.hr):
            return Response(
                {'detail': 'You do not have permission to view this profile.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            employee = EmpUser.objects.get(idnumber=idnumber)
        except EmpUser.DoesNotExist:
            return Response({'detail': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Block viewing privileged accounts' profiles
        if employee.admin or employee.hr or employee.accounting:
            return Response(
                {'detail': 'Cannot view the profile of a privileged account.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = _assemble_profile(employee)
        ser  = ProfileGetSerializer(data, context={'request': request})
        return Response(ser.data)


# ── Promotion notification helper ─────────────────────────────────────────────

def _send_promotion_notification(employee_pk: int, position_name: str) -> None:
    """
    Send an in-app notification to the employee after a transaction commit
    when their position has been promoted to a higher level.
    Falls back to immediate creation if called outside an active transaction.
    """
    def _create() -> None:
        try:
            from activityLog.models import Notification
            import logging as _log
            Notification.objects.create(
                recipient_id=employee_pk,
                notification_type='promotion',
                title='Congratulations on Your Promotion!',
                message=(
                    f'Your position has been updated to {position_name}. '
                    'This promotion recognises your hard work and dedication. '
                    'Congratulations, and thank you for your continued contribution to the team!'
                ),
                module='',
            )
        except Exception:
            import logging as _log2
            _log2.getLogger(__name__).exception(
                'Failed to create promotion notification for user_id=%d', employee_pk
            )

    try:
        transaction.on_commit(_create)
    except Exception:
        _create()


# ── PATCH /api/user-profile/<idnumber>/admin/work-info ────────────────────────

class EmployeeProfileAdminWorkInfoView(APIView):
    """
    PATCH /api/user-profile/<idnumber>/admin/work-info
    Allows admin or HR to update work info fields for any employee.
    Editable fields: department, line, approver, tin_number, sss_number,
    hdmf_number, philhealth_number, bank_account.
    """

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, idnumber: str) -> Response:
        from userLogin.models import loginCredentials as EmpUser

        requester = request.user
        if not (requester.admin or requester.hr):
            return Response(
                {'detail': 'You do not have permission to edit this profile.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            employee = EmpUser.objects.get(idnumber=idnumber)
        except EmpUser.DoesNotExist:
            return Response({'detail': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)

        obj = workInformation.objects.filter(employee=employee).first()
        is_new = obj is None

        if is_new:
            # Creating a new record — derive office from the selected department,
            # pick the first available shift for that office (or globally).
            from generalsettings.models import Department as DeptModel, Shift as ShiftModel

            dept_id = request.data.get('department')
            if not dept_id:
                return Response(
                    {'detail': 'Department is required to create work information.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                dept = DeptModel.objects.select_related('office').get(pk=int(dept_id))
            except (DeptModel.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'detail': 'Invalid department.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            shift = (
                ShiftModel.objects.filter(offices=dept.office).order_by('start_time').first()
                or ShiftModel.objects.order_by('id').first()
            )
            if shift is None:
                return Response(
                    {'detail': 'No shifts configured. Add a shift in General Settings first.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            obj = workInformation(
                employee=employee,
                office=dept.office,
                shift=shift,
                department=dept,
            )

        # Capture the old position level before applying changes.
        old_position_level: int = (
            obj.position.level_of_approval
            if (not is_new and obj.position_id is not None)
            else 0
        )

        ser = WorkInfoAdminSerializer(obj, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        ser.save()
        obj.refresh_from_db()

        # Promotion notification — only when the new level is strictly higher.
        new_position_level: int = (
            obj.position.level_of_approval if obj.position_id is not None else 0
        )
        if (not is_new) and (new_position_level > old_position_level) and obj.position_id is not None:
            _send_promotion_notification(employee.pk, obj.position.name)

        return Response(
            WorkInfoReadSerializer(obj, context={'request': request}).data,
            status=status.HTTP_201_CREATED if is_new else status.HTTP_200_OK,
        )


# ── Dashboard Overview ────────────────────────────────────────────────────────

class DashboardOverviewView(APIView):
    """
    GET /api/user-profile/dashboard-overview

    Aggregated endpoint for the main overview dashboard page.
    Returns in a single round-trip:
      profile       – completion_pct, birth_date
      notifications – missing_timelogs, upcoming_leaves, upcoming_events, unseen_certs
            birthdays     – active employees celebrating birthdays today
      calendar      – leave / event / holiday data for the mini calendar
                      (previous month, current month, next month)
    """

    permission_classes = [IsAuthenticated]

    _HOLIDAY_TYPES = frozenset({'legal', 'special', 'day_off', 'company'})
    _PERSONAL_EVENT_TYPES = frozenset({'important', 'meeting', 'task', 'reminder', 'deadline'})

    def get(self, request):
        # Lazy imports to avoid module-level circular-import risk
        from systemCalendar.models import CalendarEvent, Timelogs
        from systemCalendar.views import _pair_timelogs
        from certification.models import Certificate, CertificateView
        from leave.models import LeaveRequest

        user = request.user
        today = timezone.localdate()
        tz_obj = timezone.get_current_timezone()

        # ── 1. Profile completion & birth_date ───────────────────────────
        try:
            personal_info = user.personal_info
        except PersonalInformation.DoesNotExist:
            personal_info = None

        try:
            present_address = user.present_address
        except PresentAddress.DoesNotExist:
            present_address = None

        try:
            emergency_contact = user.emergency_contact
        except EmergencyContact.DoesNotExist:
            emergency_contact = None

        birth_date_str: str | None = None
        if personal_info and personal_info.birth_date:
            birth_date_str = personal_info.birth_date.isoformat()

        required_fields = [
            (user.firstname or '').strip(),
            (user.lastname or '').strip(),
            getattr(personal_info, 'gender', ''),
            getattr(personal_info, 'birth_date', None),
            (getattr(personal_info, 'birth_place', '') or '').strip(),
            (getattr(personal_info, 'contact_number', '') or '').strip(),
            (getattr(present_address, 'country', '') or '').strip(),
            (getattr(emergency_contact, 'name', '') or '').strip(),
            (getattr(emergency_contact, 'relationship', '') or '').strip(),
            (getattr(emergency_contact, 'contact_number', '') or '').strip(),
            (getattr(emergency_contact, 'address', '') or '').strip(),
        ]
        filled = sum(1 for f in required_fields if f)
        completion_pct = round(filled / len(required_fields) * 100)

        # ── 2. Missing timelogs ──────────────────────────────────────────
        # • Mon–Sat only, never today, never future dates.
        # • Holiday: skip if user has no time-in that day (they didn't work).
        #   If they clocked in despite the holiday, they're working → check for
        #   a paired time-out.
        # • "Absent" (no entries at all) is intentionally excluded per spec.
        # • Admin / HR / HR-manager / Accounting are exempt.
        missing_timelogs: list[dict] = []
        is_exempt = (
            getattr(user, 'admin', False)
            or getattr(user, 'hr', False)
            or getattr(user, 'hr_manager', False)
            or getattr(user, 'accounting', False)
        )

        if not is_exempt:
            lookback_start = today - datetime.timedelta(days=45)

            tl_fetch_start = timezone.make_aware(
                datetime.datetime.combine(
                    lookback_start - datetime.timedelta(days=1),
                    datetime.time.min,
                ),
                tz_obj,
            )
            # Exclude today — the employee may still be on shift
            tl_fetch_end = timezone.make_aware(
                datetime.datetime.combine(today, datetime.time.min),
                tz_obj,
            )

            raw_logs = list(
                Timelogs.objects
                .filter(employee=user, time__range=(tl_fetch_start, tl_fetch_end))
                .order_by('time')
                .values('time', 'entry')
            )
            local_logs = [
                {'dt': timezone.localtime(log['time'], tz_obj), 'entry': log['entry']}
                for log in raw_logs
            ]
            work_days = _pair_timelogs(local_logs)

            # Fetch holiday CalendarEvents visible to the user
            # (recurring events may have base dates far in the past)
            holiday_events = list(
                CalendarEvent.objects.filter(
                    Q(owner=user) | Q(members=user),
                    event_type__in=self._HOLIDAY_TYPES,
                    date__lte=today,
                ).distinct()
            )

            # Expand holidays into concrete dates within the lookback window
            holiday_dates: set[datetime.date] = set()
            for ev in holiday_events:
                d = lookback_start
                while d < today:
                    if d < ev.date:
                        d += datetime.timedelta(days=1)
                        continue
                    rep = ev.repetition
                    match = False
                    if   rep == 'once':    match = (d == ev.date)
                    elif rep == 'daily':   match = True
                    elif rep == 'weekly':  match = (d.weekday() == ev.date.weekday())
                    elif rep == 'monthly': match = (d.day == ev.date.day)
                    elif rep == 'yearly':  match = (d.month == ev.date.month and d.day == ev.date.day)
                    else:                  match = (d == ev.date)
                    if match:
                        holiday_dates.add(d)
                    d += datetime.timedelta(days=1)

            # Walk each past working day
            d = lookback_start
            while d < today:
                if d.weekday() == 6:            # Skip Sunday
                    d += datetime.timedelta(days=1)
                    continue

                slot = work_days.get(d)
                has_in  = slot is not None and slot.get('in')  is not None
                has_out = slot is not None and slot.get('out') is not None

                # Holiday with no time-in → user did not work, skip
                if d in holiday_dates and not has_in:
                    d += datetime.timedelta(days=1)
                    continue

                # Complete or fully absent → skip
                if (has_in and has_out) or (not has_in and not has_out):
                    d += datetime.timedelta(days=1)
                    continue

                missing_timelogs.append({
                    'date': d.isoformat(),
                    'missing': 'time_out' if has_in else 'time_in',
                })
                d += datetime.timedelta(days=1)

            # Keep only the 10 most recent (newest first)
            missing_timelogs = list(reversed(missing_timelogs[-10:]))

        # ── 3. Upcoming leaves (next 7 days, active status) ──────────────
        upcoming_leave_qs = (
            LeaveRequest.objects
            .filter(
                employee=user,
                status__in=['pending', 'routing', 'approved'],
                date_end__gte=today,
                date_start__lte=today + datetime.timedelta(days=7),
            )
            .select_related('leave_type')
            .order_by('date_start')[:10]
        )
        upcoming_leaves = [
            {
                'id': lr.pk,
                'control_number': lr.control_number,
                'leave_type_name': lr.leave_type.name,
                'date_start': lr.date_start.isoformat(),
                'date_end': lr.date_end.isoformat(),
                'status': lr.status,
                'status_display': lr.get_status_display(),
            }
            for lr in upcoming_leave_qs
        ]

        # ── 4. Upcoming personal calendar events (next 30 days) ──────────
        upcoming_events_qs = (
            CalendarEvent.objects
            .filter(
                Q(owner=user) | Q(members=user),
                event_type__in=self._PERSONAL_EVENT_TYPES,
                date__gte=today,
                date__lte=today + datetime.timedelta(days=30),
            )
            .distinct()
            .order_by('date')[:10]
        )
        upcoming_events = [
            {
                'id': ev.pk,
                'title': ev.title,
                'date': ev.date.isoformat(),
                'event_type': ev.event_type,
                'event_type_display': ev.get_event_type_display(),
            }
            for ev in upcoming_events_qs
        ]

        # ── 5. Unseen certificates ───────────────────────────────────────
        viewed_cert_ids = set(
            CertificateView.objects
            .filter(viewer=user)
            .values_list('certificate_id', flat=True)
        )
        unseen_certs_qs = (
            Certificate.objects
            .filter(employee=user)
            .exclude(pk__in=viewed_cert_ids)
            .select_related('category')
            .order_by('-created_at')[:10]
        )
        unseen_certs = [
            {
                'id': cert.pk,
                'title': cert.title,
                'category_name': cert.category.name,
                'created_at': cert.created_at.isoformat(),
            }
            for cert in unseen_certs_qs
        ]

        # ── 6. Birthdays today (active employees, excluding current user) ──
        birthdays_today_qs = (
            PersonalInformation.objects
            .select_related('employee')
            .filter(
                birth_date__month=today.month,
                birth_date__day=today.day,
                employee__active=True,
            )
            .exclude(employee=user)
            .order_by('employee__firstname', 'employee__lastname')[:10]
        )
        birthdays_today = []
        for info in birthdays_today_qs:
            employee = info.employee
            full_name = ' '.join(
                part for part in [employee.firstname, employee.lastname] if part
            ).strip() or employee.username
            birthdays_today.append({
                'id': employee.pk,
                'name': full_name,
                'firstname': employee.firstname or full_name,
            })

        # ── 7. Calendar data: prev / current / next month ─────────────────
        if today.month == 1:
            prev_month_start = datetime.date(today.year - 1, 12, 1)
        else:
            prev_month_start = datetime.date(today.year, today.month - 1, 1)

        if today.month == 12:
            nm_year, nm = today.year + 1, 1
        else:
            nm_year, nm = today.year, today.month + 1
        next_month_end = datetime.date(nm_year, nm, _cal_mod.monthrange(nm_year, nm)[1])

        cal_start = prev_month_start
        cal_end = next_month_end

        # Leaves
        cal_leaves = [
            {
                'date_start': lr.date_start.isoformat(),
                'date_end': lr.date_end.isoformat(),
                'status': lr.status,
                'leave_type_name': lr.leave_type.name,
            }
            for lr in LeaveRequest.objects.filter(
                employee=user,
                status__in=['pending', 'routing', 'approved'],
                date_end__gte=cal_start,
                date_start__lte=cal_end,
            ).select_related('leave_type')
        ]

        # Personal events for calendar dots
        cal_events_qs = CalendarEvent.objects.filter(
            Q(owner=user) | Q(members=user),
            event_type__in=self._PERSONAL_EVENT_TYPES,
        ).filter(
            Q(date__range=(cal_start, cal_end)) |
            (~Q(repetition='once') & Q(date__lte=cal_end))
        ).distinct()
        cal_events = [
            {
                'id': ev.pk,
                'date': ev.date.isoformat(),
                'event_type': ev.event_type,
                'title': ev.title,
                'repetition': ev.repetition,
            }
            for ev in cal_events_qs
        ]

        # Holidays for calendar dots
        cal_holidays_qs = CalendarEvent.objects.filter(
            Q(owner=user) | Q(members=user),
            event_type__in=self._HOLIDAY_TYPES,
        ).filter(
            Q(date__range=(cal_start, cal_end)) |
            (~Q(repetition='once') & Q(date__lte=cal_end))
        ).distinct()
        cal_holidays = [
            {
                'id': ev.pk,
                'date': ev.date.isoformat(),
                'title': ev.title,
                'event_type': ev.event_type,
                'repetition': ev.repetition,
            }
            for ev in cal_holidays_qs
        ]

        # ── 8. is_approver flag ───────────────────────────────────────────
        is_approver = (
            workInformation.objects
            .filter(approver=user, employee__active=True)
            .exclude(employee=user)
            .exists()
        )

        return Response({
            'is_approver': is_approver,
            'profile': {
                'birth_date': birth_date_str,
                'completion_pct': completion_pct,
            },
            'notifications': {
                'missing_timelogs': missing_timelogs,
                'upcoming_leaves': upcoming_leaves,
                'upcoming_events': upcoming_events,
                'unseen_certs': unseen_certs,
            },
            'birthdays_today': birthdays_today,
            'calendar': {
                'leaves': cal_leaves,
                'events': cal_events,
                'holidays': cal_holidays,
            },
        })


# ── Approver Overview ─────────────────────────────────────────────────────────

class ApproverOverviewView(APIView):
    """
    GET /api/user-profile/approver-overview

    Aggregated dashboard data for line managers / approvers.
    Scoped entirely to the requesting user's active direct reports.
    Returns 403 if the user has no active direct reports.

    Sections returned:
      summary         – stat card values (current + prev-month)
      timelog_anomalies – subordinates with missing time-in/out THIS WEEK (Mon–yesterday)
      pending_leaves  – leave steps awaiting THIS user's approval (activated, manager role)
      upcoming_leaves – approved leaves for subordinates in the next 30 days
      evaluation      – current evaluation period progress for subordinates
      open_tickets    – subordinate MIS tickets that are OPEN or IN_PROGRESS
      subordinates    – flat list of all direct reports
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Lazy imports to avoid circular-import risk
        from systemCalendar.models import Timelogs
        from systemCalendar.views import _pair_timelogs
        from leave.models import LeaveRequest, LeaveApprovalStep
        from certification.models import Certificate
        from mis_ticket.models import MISTicket
        from employee_evaluation.models import EvaluationEntry, EvaluationPeriod
        from training.models import TrainingSubmission

        user = request.user
        today = timezone.localdate()
        tz_obj = timezone.get_current_timezone()

        # ── Guard: caller must have at least one active direct report ────
        sub_work_infos = list(
            workInformation.objects
            .filter(approver=user, employee__active=True)
            .exclude(employee=user)
            .select_related('employee')
        )
        if not sub_work_infos:
            return Response(
                {'detail': 'You have no active direct reports.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        sub_ids: list[int] = [wi.employee_id for wi in sub_work_infos]

        # Build name map and exempt set in one pass (select_related already hit)
        emp_name_map: dict[int, str] = {}
        work_info_by_employee: dict[int, object] = {}
        exempt_sub_ids: set[int] = set()
        for wi in sub_work_infos:
            emp = wi.employee
            work_info_by_employee[wi.employee_id] = wi
            full_name = ' '.join(
                part for part in [emp.firstname, emp.lastname] if part
            ).strip() or emp.username
            emp_name_map[emp.pk] = full_name
            if (
                getattr(emp, 'admin', False)
                or getattr(emp, 'hr', False)
                or getattr(emp, 'hr_manager', False)
                or getattr(emp, 'accounting', False)
            ):
                exempt_sub_ids.add(emp.pk)

        # Date helpers
        month_start = today.replace(day=1)
        if today.month == 1:
            prev_month_start = datetime.date(today.year - 1, 12, 1)
            prev_month_end = datetime.date(today.year - 1, 12, 31)
        else:
            prev_last = _cal_mod.monthrange(today.year, today.month - 1)[1]
            prev_month_start = datetime.date(today.year, today.month - 1, 1)
            prev_month_end = datetime.date(today.year, today.month - 1, prev_last)

        week_labels = ['Wk1', 'Wk2', 'Wk3', 'Wk4']

        def _week_of_month(d: datetime.date) -> int:
            return min((d.day - 1) // 7, 3)

        def _empty_week_counts() -> list[int]:
            return [0, 0, 0, 0]

        # ── 1. Summary stat cards ────────────────────────────────────────
        pending_leave_count = LeaveApprovalStep.objects.filter(
            approver=user,
            role_group='manager',
            status='pending',
            activated_at__isnull=False,
        ).count()

        eval_this_month = EvaluationEntry.objects.filter(
            employee__in=sub_ids,
            submitted_at__date__gte=month_start,
        ).count()
        eval_prev_month = EvaluationEntry.objects.filter(
            employee__in=sub_ids,
            submitted_at__date__range=(prev_month_start, prev_month_end),
        ).count()

        trainings_this_month = TrainingSubmission.objects.filter(
            submitted_by__in=sub_ids,
            status='completed',
            confirmed_at__date__gte=month_start,
            confirmed_at__isnull=False,
        ).count()
        trainings_prev_month = TrainingSubmission.objects.filter(
            submitted_by__in=sub_ids,
            status='completed',
            confirmed_at__date__range=(prev_month_start, prev_month_end),
            confirmed_at__isnull=False,
        ).count()

        certs_this_month = Certificate.objects.filter(
            employee__in=sub_ids,
            created_at__date__gte=month_start,
        ).count()
        certs_prev_month = Certificate.objects.filter(
            employee__in=sub_ids,
            created_at__date__range=(prev_month_start, prev_month_end),
        ).count()

        eval_weekly = _empty_week_counts()
        for row in EvaluationEntry.objects.filter(
            employee__in=sub_ids,
            submitted_at__date__gte=month_start,
            submitted_at__date__lte=today,
        ).values('submitted_at'):
            submitted_at = row['submitted_at']
            if submitted_at is None:
                continue
            eval_weekly[_week_of_month(timezone.localtime(submitted_at, tz_obj).date())] += 1

        training_weekly = _empty_week_counts()
        for row in TrainingSubmission.objects.filter(
            submitted_by__in=sub_ids,
            status='completed',
            confirmed_at__isnull=False,
            confirmed_at__date__gte=month_start,
            confirmed_at__date__lte=today,
        ).values('confirmed_at'):
            confirmed_at = row['confirmed_at']
            if confirmed_at is None:
                continue
            training_weekly[_week_of_month(timezone.localtime(confirmed_at, tz_obj).date())] += 1

        cert_weekly = _empty_week_counts()
        for row in Certificate.objects.filter(
            employee__in=sub_ids,
            created_at__date__gte=month_start,
            created_at__date__lte=today,
        ).values('created_at'):
            created_at = row['created_at']
            if created_at is None:
                continue
            cert_weekly[_week_of_month(timezone.localtime(created_at, tz_obj).date())] += 1

        pending_approval_weekly = _empty_week_counts()
        for row in LeaveApprovalStep.objects.filter(
            approver=user,
            role_group='manager',
            status='pending',
            activated_at__isnull=False,
            activated_at__date__gte=month_start,
            activated_at__date__lte=today,
        ).values('activated_at'):
            activated_at = row['activated_at']
            if activated_at is None:
                continue
            pending_approval_weekly[_week_of_month(timezone.localtime(activated_at, tz_obj).date())] += 1

        # ── 2. Timelog anomalies (current week: Mon → yesterday) ────────
        # today.weekday() == 0 on Monday, so week_start = Monday
        week_start = today - datetime.timedelta(days=today.weekday())
        timelog_anomalies: list[dict] = []
        non_exempt_ids = [eid for eid in sub_ids if eid not in exempt_sub_ids]

        if week_start < today and non_exempt_ids:
            tl_fetch_start = timezone.make_aware(
                datetime.datetime.combine(week_start, datetime.time.min), tz_obj
            )
            tl_fetch_end = timezone.make_aware(
                datetime.datetime.combine(today, datetime.time.min), tz_obj
            )
            # Single batch query — no N+1 per employee
            all_week_logs = list(
                Timelogs.objects.filter(
                    employee__in=non_exempt_ids,
                    time__range=(tl_fetch_start, tl_fetch_end),
                ).order_by('employee_id', 'time').values('employee_id', 'time', 'entry')
            )
            # Group by employee
            logs_by_employee: dict[int, list[dict]] = {}
            for log in all_week_logs:
                eid = log['employee_id']
                logs_by_employee.setdefault(eid, []).append({
                    'dt': timezone.localtime(log['time'], tz_obj),
                    'entry': log['entry'],
                })

            for emp_id in non_exempt_ids:
                work_days = _pair_timelogs(logs_by_employee.get(emp_id, []))
                emp_anomalies: list[dict] = []
                d = week_start
                while d < today:
                    if d.weekday() == 6:       # Skip Sunday
                        d += datetime.timedelta(days=1)
                        continue
                    slot = work_days.get(d)
                    has_in  = slot is not None and slot.get('in')  is not None
                    has_out = slot is not None and slot.get('out') is not None
                    # Fully paired or fully absent → skip
                    if (has_in and has_out) or (not has_in and not has_out):
                        d += datetime.timedelta(days=1)
                        continue
                    emp_anomalies.append({
                        'date': d.isoformat(),
                        'missing': 'time_out' if has_in else 'time_in',
                    })
                    d += datetime.timedelta(days=1)
                if emp_anomalies:
                    timelog_anomalies.append({
                        'employee_id': emp_id,
                        'employee_name': emp_name_map.get(emp_id, str(emp_id)),
                        'anomalies': emp_anomalies,
                    })

        lacking_timelog_count = len(timelog_anomalies)

        timelog_weekly = _empty_week_counts()
        if non_exempt_ids:
            month_log_start = timezone.make_aware(
                datetime.datetime.combine(month_start, datetime.time.min), tz_obj
            )
            month_log_end = timezone.make_aware(
                datetime.datetime.combine(today + datetime.timedelta(days=1), datetime.time.min), tz_obj
            )
            all_month_logs = list(
                Timelogs.objects.filter(
                    employee__in=non_exempt_ids,
                    time__range=(month_log_start, month_log_end),
                ).order_by('employee_id', 'time').values('employee_id', 'time', 'entry')
            )
            month_logs_by_employee: dict[int, list[dict]] = {}
            for log in all_month_logs:
                eid = log['employee_id']
                month_logs_by_employee.setdefault(eid, []).append({
                    'dt': timezone.localtime(log['time'], tz_obj),
                    'entry': log['entry'],
                })
            for emp_id in non_exempt_ids:
                work_days = _pair_timelogs(month_logs_by_employee.get(emp_id, []))
                d = month_start
                while d < today:
                    if d.weekday() == 6:
                        d += datetime.timedelta(days=1)
                        continue
                    slot = work_days.get(d)
                    has_in = slot is not None and slot.get('in') is not None
                    has_out = slot is not None and slot.get('out') is not None
                    if not ((has_in and has_out) or (not has_in and not has_out)):
                        timelog_weekly[_week_of_month(d)] += 1
                    d += datetime.timedelta(days=1)

        summary_trends = {
            'weeks': week_labels,
            'total_subordinates': [len(sub_ids)] * 4,
            'pending_leave_approvals': pending_approval_weekly,
            'lacking_timelogs': timelog_weekly,
            'evaluations_submitted': eval_weekly,
            'trainings_completed': training_weekly,
            'certs_issued': cert_weekly,
        }

        # ── A. Timelog chart: last-week vs this-week anomaly count per day ─
        _day_labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        curr_week_counts = [0] * 6
        for _anomaly in timelog_anomalies:
            for _a in _anomaly['anomalies']:
                _dw = datetime.date.fromisoformat(_a['date']).weekday()
                if 0 <= _dw <= 5:
                    curr_week_counts[_dw] += 1
        last_week_counts = [0] * 6
        if non_exempt_ids:
            lw_start = week_start - datetime.timedelta(days=7)
            lw_fetch_start = timezone.make_aware(
                datetime.datetime.combine(lw_start, datetime.time.min), tz_obj
            )
            lw_fetch_end = timezone.make_aware(
                datetime.datetime.combine(week_start, datetime.time.min), tz_obj
            )
            all_lw_logs = list(
                Timelogs.objects.filter(
                    employee__in=non_exempt_ids,
                    time__range=(lw_fetch_start, lw_fetch_end),
                ).order_by('employee_id', 'time').values('employee_id', 'time', 'entry')
            )
            lw_logs_by_emp: dict[int, list[dict]] = {}
            for _log in all_lw_logs:
                _eid = _log['employee_id']
                lw_logs_by_emp.setdefault(_eid, []).append({
                    'dt': timezone.localtime(_log['time'], tz_obj),
                    'entry': _log['entry'],
                })
            for _emp_id in non_exempt_ids:
                _work_days = _pair_timelogs(lw_logs_by_emp.get(_emp_id, []))
                for _day_offset in range(6):
                    _d = lw_start + datetime.timedelta(days=_day_offset)
                    _slot = _work_days.get(_d)
                    _has_in  = _slot is not None and _slot.get('in')  is not None
                    _has_out = _slot is not None and _slot.get('out') is not None
                    if not ((_has_in and _has_out) or (not _has_in and not _has_out)):
                        last_week_counts[_day_offset] += 1
        timelog_chart = {
            'days': _day_labels,
            'last_week': last_week_counts,
            'current_week': curr_week_counts,
        }

        # ── 3. Pending leave steps awaiting this user's approval ─────────
        pending_steps_qs = (
            LeaveApprovalStep.objects.filter(
                approver=user,
                role_group='manager',
                status='pending',
                activated_at__isnull=False,
            )
            .select_related(
                'leave_request',
                'leave_request__employee',
                'leave_request__leave_type',
            )
            .order_by('leave_request__date_start')[:20]
        )
        pending_leaves: list[dict] = []
        for step in pending_steps_qs:
            lr = step.leave_request
            emp = lr.employee
            full_name = emp_name_map.get(emp.pk) or (
                ' '.join(p for p in [emp.firstname, emp.lastname] if p).strip()
                or emp.username
            )
            pending_leaves.append({
                'id': lr.pk,
                'control_number': lr.control_number,
                'employee_name': full_name,
                'leave_type': lr.leave_type.name,
                'date_start': lr.date_start.isoformat(),
                'date_end': lr.date_end.isoformat(),
                'days_count': lr.days_count,
                'days_pending': (
                    (today - step.activated_at.date()).days
                    if step.activated_at else None
                ),
            })

        # ── 4. Upcoming approved leaves for subordinates (next 30 days) ──
        upcoming_leaves_qs = (
            LeaveRequest.objects.filter(
                employee__in=sub_ids,
                status='approved',
                date_start__gte=today,
                date_start__lte=today + datetime.timedelta(days=30),
            )
            .select_related('employee', 'leave_type', 'reason', 'subreason')
            .order_by('date_start')[:20]
        )
        upcoming_leaves: list[dict] = []
        for lr in upcoming_leaves_qs:
            emp = lr.employee
            work_info = work_info_by_employee.get(emp.pk)
            full_name = emp_name_map.get(emp.pk) or (
                ' '.join(p for p in [emp.firstname, emp.lastname] if p).strip()
                or emp.username
            )
            upcoming_leaves.append({
                'id': lr.pk,
                'employee_name': full_name,
                'department_name': (
                    getattr(getattr(work_info, 'department', None), 'name', None)
                ),
                'line_name': getattr(getattr(work_info, 'line', None), 'name', None),
                'leave_type': lr.leave_type.name,
                'leave_category': getattr(lr.reason, 'title', ''),
                'leave_reason': getattr(lr.subreason, 'title', ''),
                'date_start': lr.date_start.isoformat(),
                'date_end': lr.date_end.isoformat(),
                'days_count': lr.days_count,
            })

        # ── B. Leave chart: subordinate leaves by start-date per week ────
        from collections import defaultdict as _dd

        _curr_leave_wk = [0, 0, 0, 0, 0]
        _prev_leave_wk = [0, 0, 0, 0, 0]
        for _lr_v in LeaveRequest.objects.filter(
            employee__in=sub_ids,
            date_start__gte=month_start,
            date_start__lte=today,
        ).values('date_start'):
            _curr_leave_wk[_week_of_month(_lr_v['date_start'])] += 1
        for _lr_v in LeaveRequest.objects.filter(
            employee__in=sub_ids,
            date_start__range=(prev_month_start, prev_month_end),
        ).values('date_start'):
            _prev_leave_wk[_week_of_month(_lr_v['date_start'])] += 1
        _max_wk = max(_week_of_month(today), _week_of_month(prev_month_end))
        leave_chart = {
            'weeks': [f'Wk {i + 1}' for i in range(_max_wk + 1)],
            'current_month': _curr_leave_wk[:_max_wk + 1],
            'previous_month': _prev_leave_wk[:_max_wk + 1],
        }

        # ── C. Pending leave chart: approval steps activated per month ───
        pending_prev_total = LeaveApprovalStep.objects.filter(
            approver=user,
            role_group='manager',
            activated_at__isnull=False,
            activated_at__date__range=(prev_month_start, prev_month_end),
        ).count()
        pending_curr_total = LeaveApprovalStep.objects.filter(
            approver=user,
            role_group='manager',
            activated_at__isnull=False,
            activated_at__date__gte=month_start,
            activated_at__date__lte=today,
        ).count()
        pending_leave_chart = {
            'months': [prev_month_start.strftime('%b'), month_start.strftime('%b')],
            'current_month': [0, pending_curr_total],
            'previous_month': [pending_prev_total, 0],
        }

        # ── D. MIS ticket chart: tickets created per month ───────────────
        mis_prev_total = MISTicket.objects.filter(
            employee__in=sub_ids,
            created_at__date__range=(prev_month_start, prev_month_end),
        ).count()
        mis_curr_total = MISTicket.objects.filter(
            employee__in=sub_ids,
            created_at__date__gte=month_start,
            created_at__date__lte=today,
        ).count()
        mis_chart = {
            'months': [prev_month_start.strftime('%b'), month_start.strftime('%b')],
            'current_month': [0, mis_curr_total],
            'previous_month': [mis_prev_total, 0],
        }

        # ── 5. Evaluation progress for the active period ─────────────────
        current_period = (
            EvaluationPeriod.objects.filter(status='active')
            .order_by('-start_date')
            .first()
        )
        evaluation: dict | None = None
        if current_period:
            status_label_map = {
                'pending': 'Pending',
                'supervisor_review': 'Supervisor Review',
                'user_confirmation': 'User Confirmation',
                'final_approval': 'Final Approval',
                'second_final_approval': 'Second Final Approval',
                'returned': 'Returned',
                'completed': 'Completed',
                'disapproved': 'Disapproved',
            }
            entry_status_map = {
                row['employee_id']: row['status']
                for row in EvaluationEntry.objects.filter(
                    employee__in=sub_ids,
                    evaluation_period=current_period,
                ).values('employee_id', 'status')
            }
            status_counts = {key: 0 for key in status_label_map}
            submitted_ids: set[int] = set()
            for wi in sub_work_infos:
                status_value = entry_status_map.get(wi.employee_id, 'pending')
                status_counts[status_value] = status_counts.get(status_value, 0) + 1
                if status_value != 'pending':
                    submitted_ids.add(wi.employee_id)
            not_submitted = [
                {
                    'employee_id': wi.employee_id,
                    'employee_name': emp_name_map[wi.employee_id],
                }
                for wi in sub_work_infos
                if wi.employee_id not in submitted_ids
            ]
            days_remaining = max((current_period.end_date - today).days, 0)
            evaluation = {
                'period_title': current_period.title,
                'period_start': current_period.start_date.isoformat(),
                'period_end': current_period.end_date.isoformat(),
                'frequency': current_period.frequency,
                'submitted_count': len(submitted_ids),
                'total_count': len(sub_ids),
                'not_submitted': not_submitted,
                'days_remaining': days_remaining,
                'status_breakdown': [
                    {
                        'key': key,
                        'label': label,
                        'count': status_counts[key],
                    }
                    for key, label in status_label_map.items()
                ],
            }

        # ── 6. Open MIS tickets for subordinates ─────────────────────────
        open_tickets_qs = (
            MISTicket.objects.filter(
                employee__in=sub_ids,
                status__in=['OPEN', 'IN_PROGRESS'],
            )
            .select_related('employee')
            .order_by('-created_at')[:20]
        )
        open_tickets: list[dict] = []
        for ticket in open_tickets_qs:
            emp = ticket.employee
            full_name = emp_name_map.get(emp.pk) or (
                ' '.join(p for p in [emp.firstname, emp.lastname] if p).strip()
                or emp.username
            )
            open_tickets.append({
                'id': ticket.pk,
                'ticket_number': ticket.ticket_number,
                'employee_name': full_name,
                'subject': ticket.subject,
                'category': ticket.category,
                'priority': ticket.priority,
                'status': ticket.status,
                'days_open': (
                    (today - ticket.created_at.date()).days
                    if ticket.created_at else None
                ),
            })

        # ── 7. Subordinate list ───────────────────────────────────────────
        subordinates = [
            {
                'employee_id': wi.employee_id,
                'employee_name': emp_name_map[wi.employee_id],
            }
            for wi in sub_work_infos
        ]

        return Response({
            'is_empty': len(sub_ids) == 0,
            'summary': {
                'total_subordinates': len(sub_ids),
                'pending_leave_approvals': {'current': pending_leave_count},
                'lacking_timelogs': {'current': lacking_timelog_count},
                'evaluations_submitted': {
                    'current': eval_this_month,
                    'previous': eval_prev_month,
                },
                'trainings_completed': {
                    'current': trainings_this_month,
                    'previous': trainings_prev_month,
                },
                'certs_issued': {
                    'current': certs_this_month,
                    'previous': certs_prev_month,
                },
                'trends': summary_trends,
            },
            'timelog_anomalies': timelog_anomalies,
            'pending_leaves': pending_leaves,
            'upcoming_leaves': upcoming_leaves,
            'evaluation': evaluation,
            'open_tickets': open_tickets,
            'subordinates': subordinates,
            'timelog_chart': timelog_chart,
            'leave_chart': leave_chart,
            'pending_leave_chart': pending_leave_chart,
            'mis_chart': mis_chart,
        })
