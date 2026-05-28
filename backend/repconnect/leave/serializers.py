import re
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from rest_framework import serializers

from generalsettings.workdays import (
    get_configured_weekday_durations,
    get_configured_hours_per_day,
    get_configured_workdays,
    is_configured_workday,
)
from systemCalendar.models import CalendarEvent

from .models import (
    LeaveApprovalStep,
    LeaveBalance,
    LeaveReason,
    LeaveRequest,
    LeaveSubreason,
    SundayExemption,
    LeaveType,
)

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


class LeaveSubreasonOrTextField(serializers.Field):
    default_error_messages = {
        'invalid': 'Invalid subreason.',
        'not_found': 'Selected subreason does not exist.',
    }

    def to_internal_value(self, data):
        if data is None or data == '':
            return None

        if isinstance(data, int):
            try:
                return LeaveSubreason.objects.get(pk=data)
            except LeaveSubreason.DoesNotExist:
                self.fail('not_found')

        if isinstance(data, str):
            stripped = data.strip()
            if not stripped:
                return None
            if stripped.isdigit():
                try:
                    return LeaveSubreason.objects.get(pk=int(stripped))
                except LeaveSubreason.DoesNotExist:
                    pass
            return stripped

        self.fail('invalid')

    def to_representation(self, value):
        if isinstance(value, LeaveSubreason):
            return value.pk
        return value


# ── Configuration serializers ──────────────────────────────────────────────────

class LeaveSubreasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveSubreason
        fields = ['id', 'title']


class LeaveReasonSerializer(serializers.ModelSerializer):
    subreasons = LeaveSubreasonSerializer(many=True, read_only=True)

    class Meta:
        model = LeaveReason
        fields = ['id', 'title', 'subreasons']


class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = [
            'id', 'name', 'has_balance', 'deductible',
            'requires_clinic_approval', 'is_active',
        ]


class LeaveTypeAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = [
            'id', 'name', 'has_balance', 'deductible',
            'requires_clinic_approval', 'is_active',
        ]

    def validate_name(self, value: str) -> str:
        return _validate_safe_text(value, 'Name', 100)


class LeaveReasonAdminSerializer(serializers.ModelSerializer):
    subreasons = LeaveSubreasonSerializer(many=True, read_only=True)
    leave_types = serializers.PrimaryKeyRelatedField(
        queryset=LeaveType.objects.filter(is_active=True), many=True,
    )
    leave_type_names = serializers.SerializerMethodField()

    class Meta:
        model = LeaveReason
        fields = [
            'id', 'leave_types', 'leave_type_names', 'title', 'subreasons',
        ]

    def get_leave_type_names(self, obj):
        return [lt.name for lt in obj.leave_types.all()]

    def validate_leave_types(self, value):
        if not value:
            raise serializers.ValidationError('At least one leave type is required.')
        return value

    def validate_title(self, value: str) -> str:
        return _validate_safe_text(value, 'Title', 200)


class LeaveSubreasonAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveSubreason
        fields = ['id', 'reason', 'title']

    def validate_title(self, value: str) -> str:
        return _validate_safe_text(value, 'Title', 200)


# ── Balance serializer ─────────────────────────────────────────────────────────

class LeaveBalanceSerializer(serializers.ModelSerializer):
    leave_type = serializers.CharField(source='leave_type.name', read_only=True)
    leave_type_id = serializers.IntegerField(read_only=True)
    entitled_leave = serializers.SerializerMethodField()
    used_leave = serializers.SerializerMethodField()
    remaining_leave = serializers.SerializerMethodField()
    entitled_leave_hours = serializers.SerializerMethodField()
    used_leave_hours = serializers.SerializerMethodField()
    remaining_leave_hours = serializers.SerializerMethodField()
    pending_leave = serializers.SerializerMethodField()
    pending_leave_hours = serializers.SerializerMethodField()

    class Meta:
        model = LeaveBalance
        fields = [
            'id', 'leave_type', 'leave_type_id',
            'period_start', 'period_end',
            'entitled_leave', 'used_leave', 'remaining_leave',
            'entitled_leave_hours', 'used_leave_hours', 'remaining_leave_hours',
            'pending_leave', 'pending_leave_hours',
        ]

    def _to_display_days(self, hours: Decimal) -> str:
        hours_per_day = get_configured_hours_per_day()
        days = (hours / hours_per_day).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        return str(days)

    def get_entitled_leave(self, obj):
        if not getattr(obj, 'employee', None) or not getattr(obj, 'leave_type', None):
            return '0'
        return self._to_display_days(Decimal(str(obj.entitled_leave)))

    def get_used_leave(self, obj):
        if not getattr(obj, 'employee', None) or not getattr(obj, 'leave_type', None):
            return '0'
        return self._to_display_days(Decimal(str(obj.used_leave)))

    def get_remaining_leave(self, obj):
        if not getattr(obj, 'employee', None) or not getattr(obj, 'leave_type', None):
            return '0'
        return self._to_display_days(Decimal(str(obj.remaining_leave)))

    def get_entitled_leave_hours(self, obj):
        if not getattr(obj, 'employee', None) or not getattr(obj, 'leave_type', None):
            return '0.0'
        return str(Decimal(str(obj.entitled_leave)).quantize(Decimal('0.1')))

    def get_used_leave_hours(self, obj):
        if not getattr(obj, 'employee', None) or not getattr(obj, 'leave_type', None):
            return '0.0'
        return str(Decimal(str(obj.used_leave)).quantize(Decimal('0.1')))

    def get_remaining_leave_hours(self, obj):
        if not getattr(obj, 'employee', None) or not getattr(obj, 'leave_type', None):
            return '0.0'
        return str(Decimal(str(obj.remaining_leave)).quantize(Decimal('0.1')))

    def get_pending_leave(self, obj):
        """
        Sum the prorated days_count of all pending, deductible leave requests
        for this employee × leave type whose date range overlaps this balance
        period.  For requests that span a period boundary, only the portion
        that falls inside the period is counted (prorated by calendar days).
        """
        employee = getattr(obj, 'employee', None)
        leave_type = getattr(obj, 'leave_type', None)
        if not employee or not leave_type:
            return '0'

        pending_qs = LeaveRequest.objects.filter(
            employee=employee,
            leave_type=leave_type,
            status='pending',
            is_deductible=True,
            date_start__lte=obj.period_end,
            date_end__gte=obj.period_start,
        )
        total = Decimal('0')
        for req in pending_qs:
            overlap_start = max(req.date_start, obj.period_start)
            overlap_end = min(req.date_end, obj.period_end)
            total_cal = (req.date_end - req.date_start).days + 1
            overlap_cal = (overlap_end - overlap_start).days + 1
            if total_cal > 0:
                base_hours = Decimal(str(getattr(req, 'total_hours', req.hours)))
                prorated = base_hours * Decimal(overlap_cal) / Decimal(total_cal)
                total += prorated

        return self._to_display_days(total)

    def get_pending_leave_hours(self, obj):
        employee = getattr(obj, 'employee', None)
        leave_type = getattr(obj, 'leave_type', None)
        if not employee or not leave_type:
            return '0.0'

        pending_qs = LeaveRequest.objects.filter(
            employee=employee,
            leave_type=leave_type,
            status='pending',
            is_deductible=True,
            date_start__lte=obj.period_end,
            date_end__gte=obj.period_start,
        )
        total = Decimal('0')
        for req in pending_qs:
            overlap_start = max(req.date_start, obj.period_start)
            overlap_end = min(req.date_end, obj.period_end)
            total_cal = (req.date_end - req.date_start).days + 1
            overlap_cal = (overlap_end - overlap_start).days + 1
            if total_cal > 0:
                base_hours = Decimal(str(getattr(req, 'total_hours', req.hours)))
                prorated = base_hours * Decimal(overlap_cal) / Decimal(total_cal)
                total += prorated
        return str(total.quantize(Decimal('0.1')))


class LeaveBalanceAdminUpdateSerializer(serializers.Serializer):
    leave_type_id = serializers.IntegerField()
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    balance_hours = serializers.DecimalField(max_digits=6, decimal_places=1)
    used_hours = serializers.DecimalField(max_digits=6, decimal_places=1)

    def validate_leave_type_id(self, value):
        if not LeaveType.objects.filter(pk=value).exists():
            raise serializers.ValidationError('Selected leave type does not exist.')
        return value

    def validate(self, attrs):
        if attrs['balance_hours'] < Decimal('0'):
            raise serializers.ValidationError({'balance_hours': 'Entitled hours must be zero or greater.'})
        if attrs['used_hours'] < Decimal('0'):
            raise serializers.ValidationError({'used_hours': 'Used hours must be zero or greater.'})
        if attrs['used_hours'] > attrs['balance_hours']:
            raise serializers.ValidationError({'used_hours': 'Used hours cannot exceed entitled hours.'})
        if attrs['period_end'] < attrs['period_start']:
            raise serializers.ValidationError({'period_end': 'Period end must be the same as or after period start.'})
        return attrs


# ── Approval step serializer ───────────────────────────────────────────────────

class LeaveApprovalStepSerializer(serializers.ModelSerializer):
    approver_name     = serializers.SerializerMethodField()
    acted_by_name     = serializers.SerializerMethodField()
    approver_position = serializers.SerializerMethodField()
    acted_by_position = serializers.SerializerMethodField()
    role_group_display = serializers.CharField(source='get_role_group_display', read_only=True)

    class Meta:
        model = LeaveApprovalStep
        fields = [
            'id', 'sequence', 'role_group', 'role_group_display', 'status',
            'approver', 'approver_name', 'approver_position',
            'acted_by', 'acted_by_name', 'acted_by_position',
            'remarks', 'acted_at', 'activated_at',
        ]

    def _fmt_name(self, u):
        last  = (u.lastname  or '').strip()
        first = (u.firstname or '').strip()
        if last and first:
            return f'{last}, {first}'
        return last or first or u.idnumber

    def _get_position(self, u):
        if not u:
            return None
        wi = u.workinformation_set.select_related('position').first()
        return wi.position.name if wi and wi.position else None

    def get_approver_name(self, obj):
        if not obj.approver:
            labels = {'clinic': 'Clinic', 'iad': 'IAD', 'hr': 'HR'}
            return labels.get(obj.role_group, obj.role_group.upper())
        return self._fmt_name(obj.approver)

    def get_acted_by_name(self, obj):
        if not obj.acted_by:
            return None
        name = self._fmt_name(obj.acted_by)
        tags = {'clinic': 'Clinic', 'iad': 'IAD', 'hr': 'HR'}
        tag = tags.get(obj.role_group)
        return f'{name} ({tag})' if tag else name

    def get_approver_position(self, obj):
        return self._get_position(obj.approver)

    def get_acted_by_position(self, obj):
        return self._get_position(obj.acted_by)


# ── Leave request serializers ──────────────────────────────────────────────────

class LeaveRequestListSerializer(serializers.ModelSerializer):
    leave_type_name = serializers.CharField(source='leave_type.name', read_only=True)
    reason_title = serializers.CharField(source='reason.title', read_only=True)
    reason_id = serializers.IntegerField(source='reason.id', read_only=True)
    subreason_title = serializers.SerializerMethodField()
    subreason_id = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    duration_display = serializers.SerializerMethodField()
    date_prepared_display = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()
    employee_name = serializers.SerializerMethodField()
    employee_id_number = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()
    total_hours = serializers.DecimalField(max_digits=6, decimal_places=1, read_only=True)
    total_days = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)

    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'control_number', 'leave_type', 'leave_type_name',
            'reason_id', 'reason_title', 'subreason_id', 'subreason_title',
            'status', 'status_display',
            'date_start', 'date_end', 'days_count', 'hours', 'total_hours', 'total_days',
            'duration_display', 'date_prepared', 'date_prepared_display',
            'remarks', 'hr_approved_at', 'can_cancel', 'created_at',
            'employee_name', 'employee_id_number', 'can_review', 'seen',
        ]

    def get_duration_display(self, obj):
        total_days = Decimal(str(getattr(obj, 'total_days', obj.days_count))).quantize(Decimal('0.01'))
        total_hours = Decimal(str(getattr(obj, 'total_hours', obj.hours))).quantize(Decimal('0.1'))
        return f'{total_days} day(s) / {total_hours} hour(s)'

    def get_date_prepared_display(self, obj):
        return obj.date_prepared.strftime('%B %d, %Y')

    def get_subreason_id(self, obj):
        return obj.subreason_id  # Django FK column — None when subreason is free text

    def get_subreason_title(self, obj):
        if obj.subreason:
            return obj.subreason.title
        return obj.remarks or None

    def get_can_cancel(self, obj):
        """Evaluate cancellation eligibility for the requesting user context."""
        if obj.status not in ('pending', 'approved'):
            return False
        request = self.context.get('request')
        if not request:
            return False
        user = request.user
        # HR always can cancel when the request is still cancellable
        if getattr(user, 'hr', False):
            return True
        # Owner rules
        if obj.employee_id != user.pk:
            return False
        if obj.status == 'pending':
            return True
        if obj.status == 'approved' and obj.hr_approved_at:
            from django.utils import timezone
            delta = timezone.now() - obj.hr_approved_at
            return delta.total_seconds() <= 3 * 24 * 3600
        return False

    def get_employee_name(self, obj):
        last  = (obj.employee.lastname  or '').strip()
        first = (obj.employee.firstname or '').strip()
        if last and first:
            return f'{last}, {first}'
        return last or first or obj.employee.idnumber

    def get_employee_id_number(self, obj):
        return obj.employee.idnumber

    def get_employee_department(self, obj):
        wi = obj.employee.workinformation_set.select_related('department').order_by('-created_at').first()
        if wi and wi.department:
            return wi.department.name
        return None

    def get_employee_line(self, obj):
        wi = obj.employee.workinformation_set.select_related('line').order_by('-created_at').first()
        if wi and wi.line:
            return wi.line.name
        return None

    def get_can_review(self, obj):
        """True if the requesting user is the current active approver on this request."""
        request = self.context.get('request')
        if not request:
            return False
        user = request.user
        # Find the lowest-sequence pending step (use prefetched data if available)
        try:
            steps = obj.approval_steps.all()
        except Exception:
            return False
        active_step = None
        for step in sorted(steps, key=lambda s: s.sequence):
            if step.status == 'pending':
                active_step = step
                break
        if active_step is None:
            return False
        rg = active_step.role_group
        if rg == 'manager':
            return active_step.approver_id == user.pk
        if rg == 'clinic':
            return getattr(user, 'clinic', False)
        if rg == 'iad':
            return getattr(user, 'iad', False)
        if rg == 'hr':
            return getattr(user, 'hr', False)
        return False


class LeaveRequestDetailSerializer(LeaveRequestListSerializer):
    approval_steps = LeaveApprovalStepSerializer(many=True, read_only=True)
    cancelled_by_name = serializers.SerializerMethodField()
    employee_department = serializers.SerializerMethodField()
    employee_line = serializers.SerializerMethodField()

    class Meta(LeaveRequestListSerializer.Meta):
        fields = LeaveRequestListSerializer.Meta.fields + [
            'approval_steps', 'cancelled_at', 'cancelled_by_name',
            'employee_department', 'employee_line',
        ]

    def get_cancelled_by_name(self, obj):
        if not obj.cancelled_by:
            return None
        u = obj.cancelled_by
        last  = (u.lastname  or '').strip()
        first = (u.firstname or '').strip()
        if last and first:
            return f'{last}, {first}'
        return last or first or u.idnumber


class LeaveRequestCreateSerializer(serializers.Serializer):
    leave_type = serializers.PrimaryKeyRelatedField(
        queryset=LeaveType.objects.filter(is_active=True),
    )
    reason = serializers.PrimaryKeyRelatedField(queryset=LeaveReason.objects.all())
    subreason = LeaveSubreasonOrTextField(required=False, allow_null=True)
    date_start = serializers.DateField()
    date_end = serializers.DateField()
    hours = serializers.DecimalField(max_digits=6, decimal_places=1, required=False)
    per_date_hours = serializers.DictField(
        child=serializers.DecimalField(max_digits=4, decimal_places=1),
        required=False,
        default=dict,
    )
    remarks = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')

    def validate_remarks(self, value: str) -> str:
        if value:
            return _validate_safe_text(value, 'Remarks', 500)
        return value

    def validate(self, attrs):
        leave_type = attrs['leave_type']
        reason = attrs['reason']
        subreason = attrs.get('subreason')
        date_start = attrs['date_start']
        date_end = attrs['date_end']
        per_date_hours = attrs.get('per_date_hours') or {}
        hours_per_day = get_configured_hours_per_day()
        weekday_durations = get_configured_weekday_durations()

        # Reason must belong to leave_type
        if not reason.leave_types.filter(pk=leave_type.pk).exists():
            raise serializers.ValidationError(
                {'reason': 'This reason does not belong to the selected leave type.'}
            )
        # Subreason must belong to reason when supplied as a PK.
        if isinstance(subreason, LeaveSubreason) and subreason.reason_id != reason.pk:
            raise serializers.ValidationError(
                {'subreason': 'This sub-reason does not belong to the selected reason.'}
            )
        if isinstance(subreason, str):
            attrs['remarks'] = subreason
            attrs['subreason'] = None
        # Date range
        if date_end < date_start:
            raise serializers.ValidationError(
                {'date_end': 'End date cannot be earlier than start date.'}
            )
        holiday_dates = set(
            CalendarEvent.objects
            .filter(
                event_type__in=['legal', 'special', 'day_off', 'company'],
                date__range=[date_start, date_end],
            )
            .values_list('date', flat=True)
        )
        sunday_exemptions = set(
            SundayExemption.objects
            .filter(date__range=[date_start, date_end])
            .values_list('date', flat=True)
        )
        configured_workdays = get_configured_workdays()

        days_count = 0
        total_hours = Decimal('0')
        total_days_equivalent = Decimal('0')
        day = date_start
        while day <= date_end:
            if day not in holiday_dates and is_configured_workday(
                day,
                configured_workdays=configured_workdays,
                sunday_exemptions=sunday_exemptions,
            ):
                days_count += 1
                iso = day.isoformat()
                day_hours = weekday_durations.get(day.weekday(), hours_per_day)
                if day_hours <= Decimal('0'):
                    day_hours = hours_per_day
                selected = per_date_hours.get(iso, day_hours)
                selected_hours = Decimal(str(selected)).quantize(Decimal('0.1'))
                if selected_hours < Decimal('1') or selected_hours > day_hours:
                    raise serializers.ValidationError(
                        {
                            'per_date_hours': (
                                f'Duration for {iso} must be between 1 and {day_hours} hours.'
                            )
                        }
                    )
                total_hours += selected_hours
                total_days_equivalent += (selected_hours / day_hours)
            day += timedelta(days=1)

        if days_count == 0:
            raise serializers.ValidationError(
                {'date_start': 'Selected date range has no working days after holidays and non-working days are excluded.'}
            )

        attrs['days_count'] = days_count
        attrs['total_hours'] = total_hours.quantize(Decimal('0.1'))
        attrs['total_days'] = total_days_equivalent.quantize(Decimal('0.01'))
        # Keep legacy field populated for backward-compatible consumers.
        attrs['hours'] = attrs['total_hours']

        return attrs


# ── Approval action serializer ─────────────────────────────────────────────────

class LeaveApprovalActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['approved', 'disapproved'])
    # Remarks are free-form human comments — only length is enforced.
    # Character-level sanitisation is intentionally omitted here because
    # React renders these values as escaped text (no XSS risk).
    remarks = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default='',
    )

    def validate(self, attrs):
        if attrs.get('action') == 'disapproved' and not attrs.get('remarks', '').strip():
            raise serializers.ValidationError(
                {'remarks': 'Remarks are required when disapproving a leave request.'}
            )
        return attrs
