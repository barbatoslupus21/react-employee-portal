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

import uuid as _uuid_mod

from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.db import transaction
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


def _cache_idempotency(request, data: dict) -> None:
    key = request.headers.get('X-Idempotency-Key', '').strip()
    if key:
        cache.set(f'idem:{key}', data, timeout=60 * 60 * 24)


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
        _cache_idempotency(request, ser.data)
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
        _cache_idempotency(request, ser.data)
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
        _cache_idempotency(request, ser.data)
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
        _cache_idempotency(request, ser.data)
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
        ChildRecord.objects.bulk_create([
            ChildRecord(employee=request.user, name=item['name'])
            for item in ser.validated_data
        ])

        result = ChildRecordSerializer(
            ChildRecord.objects.filter(employee=request.user), many=True
        ).data
        _cache_idempotency(request, list(result))
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
        EducationRecord.objects.bulk_create([
            EducationRecord(
                employee=request.user,
                institution=item['institution'],
                education_level=item.get('education_level', ''),
                degree=item.get('degree', ''),
                year_attended=item.get('year_attended'),
            )
            for item in ser.validated_data
        ])

        result = EducationRecordSerializer(
            EducationRecord.objects.filter(employee=request.user), many=True
        ).data
        _cache_idempotency(request, list(result))
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

        # Validate that the chosen approver has a higher position level
        validated = ser.validated_data
        approver  = validated.get('approver')
        if approver is not None:
            current_level = (
                obj.position.level_of_approval if obj.position else 0
            )
            # Resolve approver's work info to get their position level
            approver_wi = workInformation.objects.filter(employee=approver).first()
            approver_level = (
                approver_wi.position.level_of_approval
                if approver_wi and approver_wi.position
                else 0
            )
            if approver_level <= current_level:
                return Response(
                    {'approver': 'The selected approver must have a higher position level than yours.'},
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
        avatar_url = None
        if request.user.avatar:
            avatar_url = request.build_absolute_uri(f'/media/{request.user.avatar}')
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
    Returns users who are eligible to be the current user's approver.
    Eligibility: they have a workInformation record whose position
    has a level_of_approval strictly greater than the current user's.
    An optional ``?department=<id>`` filter further narrows the list.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request) -> Response:
        current_wi = workInformation.objects.filter(employee=request.user).first()
        current_level = (
            current_wi.position.level_of_approval
            if current_wi and current_wi.position
            else 0
        )

        dept_id = request.query_params.get('department')

        qs = workInformation.objects.select_related(
            'employee', 'position', 'department'
        ).filter(
            position__level_of_approval__gt=current_level,
            employee__active=True,
        )

        if dept_id:
            try:
                qs = qs.filter(department_id=int(dept_id))
            except (ValueError, TypeError):
                return Response(
                    {'detail': 'Invalid department id.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        results = []
        seen = set()
        for wi in qs.order_by('position__level_of_approval', 'employee__lastname'):
            emp = wi.employee
            if emp.pk in seen:
                continue
            seen.add(emp.pk)
            name_parts = filter(None, [emp.firstname, emp.lastname])
            results.append({
                'id':       emp.pk,
                'idnumber': emp.idnumber,
                'name':     ' '.join(name_parts) or emp.idnumber,
                'avatar':   (
                    request.build_absolute_uri(f'/media/{emp.avatar}')
                    if emp.avatar else None
                ),
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
            name_parts = list(filter(None, [emp.firstname, emp.lastname]))
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
