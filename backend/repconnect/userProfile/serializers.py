"""
Serializers for the userProfile app.

Split into three logical groups:
  1. Sub-model serializers    — one per profile sub-model
  2. Aggregate GET serializer — returns the full profile in one payload
  3. Security serializers     — ChangePasswordSerializer
"""

import re
from datetime import date

from django.contrib.auth.hashers import check_password, make_password
from django.core.validators import RegexValidator
from rest_framework import serializers

from generalsettings.models import Department, EmploymentType, Line, PasswordPolicy, Position
from userLogin.models import loginCredentials

from certification.models import Certificate

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

# ── Shared field validators ────────────────────────────────────────────────────

_NO_SPECIAL_CHARS_RE = re.compile(r'^[^<>{}\[\]\\|^~`"]*$')
_PH_CONTACT_RE       = re.compile(r'^(\+63|0)\d{10}$')

_NO_SPECIAL_CHARS = RegexValidator(
    regex=r'^[^<>{}\[\]\\|^~`"]*$',
    message='Field contains invalid characters.',
)

_THIS_YEAR = date.today().year


def _validate_no_special(value: str) -> str:
    if value and not _NO_SPECIAL_CHARS_RE.match(value):
        raise serializers.ValidationError('Field contains invalid characters.')
    return value


def _validate_ph_contact(value: str) -> str:
    if value and not _PH_CONTACT_RE.match(value):
        raise serializers.ValidationError(
            'Enter a valid Philippine mobile number (e.g. 09171234567 or +639171234567).'
        )
    return value


# ── 1. Sub-model serializers ───────────────────────────────────────────────────

class BasicInfoSerializer(serializers.Serializer):
    """Updates firstname, lastname, and email on the loginCredentials model."""

    firstname = serializers.CharField(max_length=20, required=False, allow_blank=True)
    lastname  = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email     = serializers.EmailField(max_length=254, required=False, allow_blank=True)

    def validate_firstname(self, v): return _validate_no_special(v)
    def validate_lastname(self, v):  return _validate_no_special(v)

    def update(self, instance, validated_data):
        fields_to_update = []
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
            fields_to_update.append(attr)
        if fields_to_update:
            instance.save(update_fields=fields_to_update)
        return instance


class PersonalInfoSerializer(serializers.ModelSerializer):
    """
    User-editable personal information.
    First name, last name, and email are stored on loginCredentials and are
    read-only from the user's perspective — they are excluded here.
    """

    contact_number = serializers.CharField(
        max_length=15, required=False, allow_blank=True, default=''
    )

    class Meta:
        model  = PersonalInformation
        fields = (
            'middle_name', 'nickname', 'work_email',
            'gender', 'birth_date', 'birth_place', 'contact_number',
        )
        extra_kwargs = {
            'middle_name':    {'max_length': 50,  'required': False, 'allow_blank': True},
            'nickname':       {'max_length': 50,  'required': False, 'allow_blank': True},
            'work_email':     {'max_length': 254, 'required': False, 'allow_blank': True},
            'gender':         {'required': False, 'allow_blank': True},
            'birth_date':     {'required': False, 'allow_null': True},
            'birth_place':    {'max_length': 150, 'required': False, 'allow_blank': True},
        }

    def validate_middle_name(self, v):   return _validate_no_special(v)
    def validate_nickname(self, v):      return _validate_no_special(v)
    def validate_birth_place(self, v):   return _validate_no_special(v)
    def validate_contact_number(self, v): return _validate_ph_contact(v) if v else v


class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Skill
        fields = ('id', 'name')
        extra_kwargs = {'name': {'max_length': 100}}

    def validate_name(self, v): return _validate_no_special(v)


class CertificateSimpleSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_icon = serializers.CharField(source='category.icon_key', read_only=True)

    class Meta:
        model  = Certificate
        fields = ('id', 'title', 'category_name', 'category_icon', 'created_at')


class PresentAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PresentAddress
        fields = ('country', 'province', 'city', 'barangay', 'street', 'block_lot')
        extra_kwargs = {
            'country':   {'max_length': 100, 'required': False, 'allow_blank': True},
            'province':  {'max_length': 100, 'required': False, 'allow_blank': True},
            'city':      {'max_length': 100, 'required': False, 'allow_blank': True},
            'barangay':  {'max_length': 150, 'required': False, 'allow_blank': True},
            'street':    {'max_length': 200, 'required': False, 'allow_blank': True},
            'block_lot': {'max_length': 50,  'required': False, 'allow_blank': True},
        }

    def validate_country(self, v):  return _validate_no_special(v)
    def validate_province(self, v): return _validate_no_special(v)
    def validate_city(self, v):     return _validate_no_special(v)
    def validate_barangay(self, v): return _validate_no_special(v)
    def validate_street(self, v):   return _validate_no_special(v)
    def validate_block_lot(self, v): return _validate_no_special(v)


class ProvincialAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ProvincialAddress
        fields = (
            'same_as_present',
            'country', 'province', 'city', 'barangay', 'street', 'block_lot',
        )
        extra_kwargs = {
            'same_as_present': {'required': False},
            'country':   {'max_length': 100, 'required': False, 'allow_blank': True},
            'province':  {'max_length': 100, 'required': False, 'allow_blank': True},
            'city':      {'max_length': 100, 'required': False, 'allow_blank': True},
            'barangay':  {'max_length': 150, 'required': False, 'allow_blank': True},
            'street':    {'max_length': 200, 'required': False, 'allow_blank': True},
            'block_lot': {'max_length': 50,  'required': False, 'allow_blank': True},
        }

    def validate_country(self, v):  return _validate_no_special(v)
    def validate_province(self, v): return _validate_no_special(v)
    def validate_city(self, v):     return _validate_no_special(v)
    def validate_barangay(self, v): return _validate_no_special(v)
    def validate_street(self, v):   return _validate_no_special(v)
    def validate_block_lot(self, v): return _validate_no_special(v)


class EmergencyContactSerializer(serializers.ModelSerializer):
    contact_number = serializers.CharField(
        max_length=15, required=False, allow_blank=True, default=''
    )

    class Meta:
        model  = EmergencyContact
        fields = ('name', 'relationship', 'contact_number', 'address')
        extra_kwargs = {
            'name':         {'max_length': 100, 'required': False, 'allow_blank': True},
            'relationship': {'max_length': 50,  'required': False, 'allow_blank': True},
            'address':      {'max_length': 300, 'required': False, 'allow_blank': True},
        }

    def validate_name(self, v):         return _validate_no_special(v)
    def validate_relationship(self, v): return _validate_no_special(v)
    def validate_address(self, v):      return _validate_no_special(v)
    def validate_contact_number(self, v): return _validate_ph_contact(v) if v else v


class FamilyBackgroundSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FamilyBackground
        fields = ('mother_name', 'father_name', 'spouse_name')
        extra_kwargs = {
            'mother_name': {'max_length': 100, 'required': False, 'allow_blank': True},
            'father_name': {'max_length': 100, 'required': False, 'allow_blank': True},
            'spouse_name': {'max_length': 100, 'required': False, 'allow_blank': True},
        }

    def validate_mother_name(self, v): return _validate_no_special(v)
    def validate_father_name(self, v): return _validate_no_special(v)
    def validate_spouse_name(self, v): return _validate_no_special(v)


class ChildRecordSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True)

    class Meta:
        model  = ChildRecord
        fields = ('id', 'name')
        extra_kwargs = {
            'name': {'max_length': 100},
        }

    def validate_name(self, v): return _validate_no_special(v)


class EducationRecordSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True)
    education_level = serializers.ChoiceField(
        choices=EducationRecord.EDUCATION_LEVEL_CHOICES,
        required=False,
        allow_blank=True,
    )

    class Meta:
        model  = EducationRecord
        fields = ('id', 'institution', 'education_level', 'degree', 'year_attended')
        extra_kwargs = {
            'institution':   {'max_length': 200},
            'education_level': {'required': False, 'allow_blank': True},
            'degree':        {'max_length': 200, 'required': False, 'allow_blank': True},
            'year_attended': {'required': False, 'allow_null': True},
        }

    def validate_institution(self, v):  return _validate_no_special(v)
    def validate_degree(self, v):       return _validate_no_special(v)

    def validate_year_attended(self, v):
        if v is not None:
            if v < 1900 or v > _THIS_YEAR + 5:
                raise serializers.ValidationError(
                    f'Year attended must be between 1900 and {_THIS_YEAR + 5}.'
                )
        return v


# ── Work information serializers ───────────────────────────────────────────────

class WorkInfoUserSerializer(serializers.ModelSerializer):
    """
    PATCH serializer — only exposes the three user-editable fields.
    Admin-only fields (position, employment_type, date_hired, tin_number, etc.)
    are physically absent and cannot be set through this serializer.
    """

    class Meta:
        model  = workInformation
        fields = ('department', 'line', 'approver')
        extra_kwargs = {
            'department': {'required': False},
            'line':       {'required': False, 'allow_null': True},
            'approver':   {'required': False, 'allow_null': True},
        }


class WorkInfoAdminSerializer(serializers.ModelSerializer):
    """
    PATCH serializer for admin/HR — allows updating department, line, approver,
    position, employment type, date hired, and all sensitive numeric ID fields.
    """

    class Meta:
        model  = workInformation
        fields = (
            'department', 'line', 'approver',
            'position', 'employment_type', 'date_hired',
            'tin_number', 'sss_number', 'hdmf_number',
            'philhealth_number', 'bank_account',
        )
        extra_kwargs = {
            'department':       {'required': False, 'allow_null': True},
            'line':             {'required': False, 'allow_null': True},
            'approver':         {'required': False, 'allow_null': True},
            'position':         {'required': False, 'allow_null': True},
            'employment_type':  {'required': False, 'allow_null': True},
            'date_hired':       {'required': False, 'allow_null': True},
            'tin_number':       {'required': False, 'allow_blank': True},
            'sss_number':       {'required': False, 'allow_blank': True},
            'hdmf_number':      {'required': False, 'allow_blank': True},
            'philhealth_number':{'required': False, 'allow_blank': True},
            'bank_account':     {'required': False, 'allow_blank': True},
        }


class WorkInfoReadSerializer(serializers.ModelSerializer):
    """
    Full read serializer returned via GET /api/user-profile/me.
    Provides flat FK names for the frontend.
    """

    department_id        = serializers.IntegerField(source='department.id',       read_only=True, allow_null=True)
    department_name      = serializers.CharField(source='department.name',        read_only=True, allow_null=True)
    line_id              = serializers.IntegerField(source='line.id',             read_only=True, allow_null=True)
    line_name            = serializers.CharField(source='line.name',              read_only=True, allow_null=True)
    approver_id          = serializers.IntegerField(source='approver.id',         read_only=True, allow_null=True)
    approver_name        = serializers.SerializerMethodField()
    position_id          = serializers.IntegerField(source='position.id',         read_only=True, allow_null=True)
    position_name        = serializers.CharField(source='position.name',          read_only=True, allow_null=True)
    position_level       = serializers.IntegerField(source='position.level_of_approval', read_only=True, allow_null=True)
    employment_type_id   = serializers.IntegerField(source='employment_type.id',  read_only=True, allow_null=True)
    employment_type_name = serializers.CharField(source='employment_type.name',   read_only=True, allow_null=True)
    office_id            = serializers.IntegerField(source='office.id',           read_only=True, allow_null=True)
    office_name          = serializers.CharField(source='office.name',            read_only=True, allow_null=True)
    shift_id             = serializers.IntegerField(source='shift.id',            read_only=True, allow_null=True)
    shift_name           = serializers.CharField(source='shift.name',             read_only=True, allow_null=True)

    class Meta:
        model  = workInformation
        fields = (
            'id',
            'department_id', 'department_name',
            'line_id', 'line_name',
            'approver_id', 'approver_name',
            'position_id', 'position_name', 'position_level',
            'employment_type_id', 'employment_type_name',
            'office_id', 'office_name',
            'shift_id', 'shift_name',
            'date_hired',
            'tin_number', 'sss_number', 'hdmf_number',
            'philhealth_number', 'bank_account',
        )

    def get_approver_name(self, obj) -> str | None:
        if obj.approver is None:
            return None
        parts = filter(None, [obj.approver.firstname, obj.approver.lastname])
        return ' '.join(parts) or obj.approver.idnumber


# ── 2. Aggregate GET serializer ────────────────────────────────────────────────

class ProfileGetSerializer(serializers.Serializer):
    """
    Read-only aggregate that assembles the full user profile from all
    sub-models.  The view calls get_or_create on each OneToOne sub-model
    before passing them here.
    """

    # Core identity fields from loginCredentials (always read-only for user)
    id         = serializers.IntegerField(source='employee.id')
    idnumber   = serializers.CharField(source='employee.idnumber')
    firstname  = serializers.CharField(source='employee.firstname', allow_null=True)
    lastname   = serializers.CharField(source='employee.lastname',  allow_null=True)
    email      = serializers.EmailField(source='employee.email',    allow_null=True)
    avatar     = serializers.SerializerMethodField()

    personal_info      = PersonalInfoSerializer()
    present_address    = PresentAddressSerializer()
    provincial_address = ProvincialAddressSerializer()
    emergency_contact  = EmergencyContactSerializer()
    family_background  = FamilyBackgroundSerializer()
    children           = ChildRecordSerializer(many=True)
    education_records  = EducationRecordSerializer(many=True)
    work_info          = serializers.SerializerMethodField()
    skills             = serializers.SerializerMethodField()
    certificates       = serializers.SerializerMethodField()

    def get_avatar(self, obj) -> str | None:
        request = self.context.get('request')
        av = obj['employee'].avatar
        if not av:
            return None
        if request:
            return request.build_absolute_uri(f'/media/{av}')
        return f'/media/{av}'

    def get_work_info(self, obj) -> dict | None:
        wi = obj.get('work_info')
        if wi is None:
            return None
        return WorkInfoReadSerializer(wi, context=self.context).data

    def get_skills(self, obj) -> list:
        user = obj['employee']
        return SkillSerializer(
            Skill.objects.filter(employee=user), many=True
        ).data

    def get_certificates(self, obj) -> list:
        user = obj['employee']
        return CertificateSimpleSerializer(
            Certificate.objects.filter(employee=user).select_related('category'),
            many=True,
            context=self.context,
        ).data

    def to_representation(self, instance):
        # ``instance`` is expected to be the dict assembled by the view.
        return super().to_representation(instance)


# ── 3. Security serializers ────────────────────────────────────────────────────

class ChangePasswordSerializer(serializers.Serializer):
    """
    Validates a password change request against the live PasswordPolicy.
    The ``employee`` context key must be set to the loginCredentials instance.
    """

    current_password = serializers.CharField(write_only=True, min_length=1, max_length=128)
    new_password     = serializers.CharField(write_only=True, min_length=1, max_length=128)
    confirm_password = serializers.CharField(write_only=True, min_length=1, max_length=128)

    def validate_current_password(self, value: str) -> str:
        user = self.context['employee']
        if not check_password(value, user.password):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate(self, attrs: dict) -> dict:
        new_pw  = attrs.get('new_password', '')
        confirm = attrs.get('confirm_password', '')

        if new_pw != confirm:
            raise serializers.ValidationError(
                {'confirm_password': 'Passwords do not match.'}
            )

        policy: PasswordPolicy = PasswordPolicy.get()
        errors = []

        if len(new_pw) < policy.min_length:
            errors.append(f'Password must be at least {policy.min_length} characters long.')
        if policy.require_uppercase and not re.search(r'[A-Z]', new_pw):
            errors.append('Password must contain at least one uppercase letter.')
        if policy.require_lowercase and not re.search(r'[a-z]', new_pw):
            errors.append('Password must contain at least one lowercase letter.')
        if policy.require_number and not re.search(r'\d', new_pw):
            errors.append('Password must contain at least one digit.')
        if policy.require_special_character and not re.search(r'[!@#$%^&*()\-_=+\[\]{};:\'",.<>?/\\|`~]', new_pw):
            errors.append('Password must contain at least one special character.')

        if errors:
            raise serializers.ValidationError({'new_password': errors})

        return attrs


# ── Avatar serializer ──────────────────────────────────────────────────────────

class AvatarSerializer(serializers.ModelSerializer):
    """Validates and saves a new avatar image on the loginCredentials model."""

    avatar = serializers.ImageField(
        max_length=None,
        use_url=False,
        required=True,
    )

    class Meta:
        model  = loginCredentials
        fields = ('avatar',)

    def validate_avatar(self, image):
        # 2 MB hard cap
        max_bytes = 2 * 1024 * 1024
        if image.size > max_bytes:
            raise serializers.ValidationError('Avatar image must not exceed 2 MB.')

        # Verify it is a real image via Pillow to block MIME-spoofing attacks
        try:
            from PIL import Image as PilImage
            img = PilImage.open(image)
            img.verify()
        except Exception:
            raise serializers.ValidationError('Uploaded file is not a valid image.')
        finally:
            # verify() consumes the file pointer — reset for downstream saving
            image.seek(0)

        return image
