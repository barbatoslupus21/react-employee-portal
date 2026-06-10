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
    seen = serializers.SerializerMethodField(read_only=True)
    member_scope = serializers.ChoiceField(
        choices=['all', 'selected'],
        required=False,
    )

    def get_seen(self, obj) -> bool:
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return True

        if obj.owner_id == user.id:
            return True

        seen_map = self.context.get('seen_map')
        if isinstance(seen_map, dict):
            return seen_map.get(obj.id, False)

        rec = obj.participant_seen_records.filter(user=user).only('seen').first()
        return bool(rec.seen) if rec else False

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
            'seen',
            'member_scope',
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

