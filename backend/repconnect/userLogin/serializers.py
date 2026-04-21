import re
from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _avatar_url(obj) -> str | None:
    if not obj.avatar or not obj.avatar.name:
        return None
    return f'/media/{obj.avatar.name}'

_USERNAME_RE = re.compile(r'^[\w.@+-]+$')


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128, write_only=True)

    def validate_username(self, value):
        if not _USERNAME_RE.match(value):
            raise serializers.ValidationError('Username contains invalid characters.')
        return value


class UserSerializer(serializers.ModelSerializer):
    avatar = serializers.SerializerMethodField()
    is_approver = serializers.SerializerMethodField()

    def get_avatar(self, obj):
        return _avatar_url(obj)

    def get_is_approver(self, obj):
        """True if this user is designated as the approver for at least one other employee."""
        from userProfile.models import workInformation
        return workInformation.objects.filter(approver=obj).exists()

    class Meta:
        model = User
        fields = [
            'id',
            'idnumber',
            'firstname',
            'lastname',
            'email',
            'avatar',
            'active',
            'locked',
            'change_password',
            'admin',
            'news',
            'clinic',
            'iad',
            'accounting',
            'hr',
            'hr_manager',
            'mis',
            'theme',
            'is_staff',
            'is_superuser',
            'date_joined',
            'last_login',
            'is_approver',
        ]
        read_only_fields = fields


# ── Employee admin serializer ──────────────────────────────────────────────────

class EmployeeAdminSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for the Employees admin page.
    Includes work information from the most-recent workInformation record
    (pre-fetched by the view using to_attr='_work_records').
    """

    avatar               = serializers.SerializerMethodField()
    department_id        = serializers.SerializerMethodField()
    department_name      = serializers.SerializerMethodField()
    line_id              = serializers.SerializerMethodField()
    line_name            = serializers.SerializerMethodField()
    employment_type_id   = serializers.SerializerMethodField()
    employment_type_name = serializers.SerializerMethodField()
    date_hired           = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'idnumber',
            'firstname',
            'lastname',
            'email',
            'avatar',
            'active',
            'locked',
            'date_joined',
            'department_id',
            'department_name',
            'line_id',
            'line_name',
            'employment_type_id',
            'employment_type_name',
            'date_hired',
        ]
        read_only_fields = fields

    def _work(self, obj):
        records = getattr(obj, '_work_records', None)
        return records[0] if records else None

    def get_avatar(self, obj):
        return _avatar_url(obj)

    def get_department_id(self, obj):
        w = self._work(obj)
        return w.department_id if w else None

    def get_department_name(self, obj):
        w = self._work(obj)
        return w.department.name if w and w.department_id else None

    def get_line_id(self, obj):
        w = self._work(obj)
        return w.line_id if w else None

    def get_line_name(self, obj):
        w = self._work(obj)
        return w.line.name if w and w.line_id else None

    def get_employment_type_id(self, obj):
        w = self._work(obj)
        return w.employment_type_id if w else None

    def get_employment_type_name(self, obj):
        w = self._work(obj)
        return w.employment_type.name if w and w.employment_type_id else None

    def get_date_hired(self, obj):
        w = self._work(obj)
        return str(w.date_hired) if w and w.date_hired else None
