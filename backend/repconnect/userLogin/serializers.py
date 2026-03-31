import re
from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()

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

    def get_avatar(self, obj):
        if not obj.avatar:
            return None
        return f'/media/{obj.avatar.name}'

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
        ]
        read_only_fields = fields
