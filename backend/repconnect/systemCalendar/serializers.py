from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import CalendarEvent

User = get_user_model()


class CalendarMemberSerializer(serializers.ModelSerializer):
    """Lightweight user info embedded in event responses."""

    avatar = serializers.SerializerMethodField()

    def get_avatar(self, obj):
        if not obj.avatar:
            return None
        return f'/media/{obj.avatar.name}'

    class Meta:
        model = User
        fields = ['id', 'idnumber', 'firstname', 'lastname', 'avatar']
        read_only_fields = fields


class CalendarEventSerializer(serializers.ModelSerializer):
    # Write: accept list of user PKs.  Read: return nested user objects.
    members = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        many=True,
        required=False,
    )
    members_detail = CalendarMemberSerializer(source='members', many=True, read_only=True)
    owner = serializers.IntegerField(source='owner_id', read_only=True)
    owner_detail = CalendarMemberSerializer(read_only=True)

    class Meta:
        model = CalendarEvent
        fields = [
            'id',
            'title',
            'date',
            'event_type',
            'repetition',
            'note',
            'owner',
            'owner_detail',
            'members',
            'members_detail',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'owner', 'owner_detail', 'members_detail', 'created_at', 'updated_at']

    def validate_title(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Title cannot be blank.')
        return value
    # no additional validation required at the moment

