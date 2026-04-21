import re

from rest_framework import serializers

from .models import Certificate, CertificateCategory, CertificateView

_NO_SPECIAL_CHARS_RE = re.compile(r'^[^<>{}\[\]\\|^~`"]*$')


def _validate_text(value: str) -> str:
    if not _NO_SPECIAL_CHARS_RE.match(value):
        raise serializers.ValidationError('Field contains invalid characters.')
    return value


class CertificateCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model  = CertificateCategory
        fields = ('id', 'name', 'icon_key')


class CertificateSerializer(serializers.ModelSerializer):
    category_name    = serializers.CharField(source='category.name',     read_only=True)
    category_icon    = serializers.CharField(source='category.icon_key', read_only=True)
    employee_idnumber  = serializers.CharField(source='employee.idnumber',  read_only=True)
    employee_firstname = serializers.CharField(source='employee.firstname', read_only=True)
    employee_lastname  = serializers.CharField(source='employee.lastname',  read_only=True)
    file_url = serializers.SerializerMethodField()
    is_new   = serializers.SerializerMethodField()

    class Meta:
        model  = Certificate
        fields = (
            'id', 'title', 'objective',
            'category', 'category_name', 'category_icon',
            'file_url', 'original_filename',
            'employee_idnumber', 'employee_firstname', 'employee_lastname',
            'is_new',
            'created_at', 'updated_at',
        )

    def get_file_url(self, obj: Certificate) -> str:
        request = self.context.get('request')
        if request and obj.file:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url if obj.file else ''

    def get_is_new(self, obj: Certificate) -> bool:
        """True when the authenticated user has not yet viewed this certificate."""
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        return not CertificateView.objects.filter(
            certificate=obj, viewer=request.user
        ).exists()


class CertificateEditSerializer(serializers.ModelSerializer):
    """Allows editing title, objective, category, and optionally replacing the file."""

    title     = serializers.CharField(max_length=255, validators=[_validate_text])
    objective = serializers.CharField(max_length=500)

    class Meta:
        model  = Certificate
        fields = ('title', 'objective', 'category', 'file')
        extra_kwargs = {'file': {'required': False}}

    def validate_title(self, value: str) -> str:
        return _validate_text(value)
