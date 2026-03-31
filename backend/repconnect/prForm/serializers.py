import re
import datetime as dt

from rest_framework import serializers

from .models import PRFRequest, EmergencyLoan

_BLOCKED_CHARS_RE = re.compile(r'[<>{}\[\]\\|^~`"]')


def _validate_safe_text(value: str, field_name: str, max_length: int) -> str:
    """Shared validator: strips, checks blocked chars, enforces max_length."""
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


class PRFRequestSerializer(serializers.ModelSerializer):
    prf_type_display     = serializers.CharField(source='get_prf_type_display',     read_only=True)
    prf_category_display = serializers.CharField(source='get_prf_category_display', read_only=True)
    status_display       = serializers.CharField(source='get_status_display',       read_only=True)

    class Meta:
        model  = PRFRequest
        fields = [
            'id',
            'prf_control_number',
            'prf_category',
            'prf_category_display',
            'prf_type',
            'prf_type_display',
            'purpose',
            'control_number',
            'status',
            'status_display',
            'admin_remarks',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'prf_control_number',
            'prf_type_display',
            'prf_category_display',
            'status_display',
            'status',
            'admin_remarks',
            'created_at',
            'updated_at',
        ]

    def validate_purpose(self, value: str) -> str:
        return _validate_safe_text(value, 'Purpose', 500)

    def validate_control_number(self, value: str) -> str:
        if not value:
            return value
        return _validate_safe_text(value, 'Control number', 50)


class EmergencyLoanCreateSerializer(serializers.Serializer):
    prf_category       = serializers.ChoiceField(choices=[v for v, _ in PRFRequest.PRF_CATEGORIES])
    purpose            = serializers.CharField(max_length=500)
    amount             = serializers.IntegerField()
    number_of_cutoff   = serializers.IntegerField(min_value=1, max_value=6)
    starting_date      = serializers.DateField()
    employee_full_name = serializers.CharField(max_length=255)

    def validate_amount(self, value):
        try:
            value = int(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError('Invalid amount.')
        if value not in (2000, 3000, 4000, 5000):
            raise serializers.ValidationError('Invalid amount.')
        return value

    def validate_purpose(self, value: str) -> str:
        return _validate_safe_text(value, 'Purpose', 500)

    def validate_employee_full_name(self, value: str) -> str:
        return _validate_safe_text(value, 'Full name', 255)

    def validate_starting_date(self, value: dt.date) -> dt.date:
        if value < dt.date.today():
            raise serializers.ValidationError('Starting date cannot be in the past.')
        if value.day not in (9, 24):
            raise serializers.ValidationError('Starting date must be the 9th or 24th of the month.')
        return value

    def validate(self, data):
        amount = data.get('amount')
        cutoff = data.get('number_of_cutoff')
        if amount and cutoff:
            valid = [c for c, _ in EmergencyLoan.get_cutoff_choices(amount)]
            if cutoff not in valid:
                raise serializers.ValidationError(
                    {'number_of_cutoff': 'Invalid cut-off count for the selected amount.'}
                )
        return data


class PRFAdminSerializer(serializers.ModelSerializer):
    prf_type_display     = serializers.CharField(source='get_prf_type_display',     read_only=True)
    prf_category_display = serializers.CharField(source='get_prf_category_display', read_only=True)
    status_display       = serializers.CharField(source='get_status_display',       read_only=True)
    employee_idnumber    = serializers.CharField(source='employee.idnumber',        read_only=True)
    employee_firstname   = serializers.CharField(source='employee.firstname',       read_only=True)
    employee_lastname    = serializers.CharField(source='employee.lastname',        read_only=True)

    class Meta:
        model  = PRFRequest
        fields = [
            'id',
            'prf_control_number',
            'prf_category',
            'prf_category_display',
            'prf_type',
            'prf_type_display',
            'purpose',
            'control_number',
            'status',
            'status_display',
            'admin_remarks',
            'employee_idnumber',
            'employee_firstname',
            'employee_lastname',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class PRFAdminActionSerializer(serializers.Serializer):
    """Validates an admin approve / disapprove / cancel action."""

    status = serializers.ChoiceField(choices=[v for v, _ in PRFRequest.STATUS_CHOICES])
    admin_remarks = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')

    def validate_admin_remarks(self, value: str) -> str:
        if not value:
            return value
        return _validate_safe_text(value, 'Admin remarks', 1000)

    def validate(self, data):
        if data.get('status') == 'disapproved' and not data.get('admin_remarks', '').strip():
            raise serializers.ValidationError(
                {'admin_remarks': 'Remarks are required when disapproving a request.'}
            )
        return data
