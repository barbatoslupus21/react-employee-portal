"""Serializers for the Announcement module."""
from __future__ import annotations

import mimetypes

from rest_framework import serializers

from .models import (
    Announcement,
    AnnouncementComment,
    AnnouncementMedia,
    AnnouncementReaction,
)

# --------------------------------------------------------------------------- #
#  Allowed file types (Risk 2)                                                 #
# --------------------------------------------------------------------------- #
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'webm', 'ogg'}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB

ALLOWED_IMAGE_MIMES = {
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
}
ALLOWED_VIDEO_MIMES = {
    'video/mp4', 'video/webm', 'video/ogg',
}
ALLOWED_MIMES = ALLOWED_IMAGE_MIMES | ALLOWED_VIDEO_MIMES


def _resolve_media_type(filename: str, content_type: str | None) -> str:
    """Return 'image' or 'video' based on file extension; fallback to content_type."""
    ext = filename.rsplit('.', 1)[-1].lower()
    if ext in ALLOWED_IMAGE_EXTENSIONS:
        return 'image'
    if ext in ALLOWED_VIDEO_EXTENSIONS:
        return 'video'
    # Fallback to MIME
    if content_type in ALLOWED_IMAGE_MIMES:
        return 'image'
    return 'video'


# --------------------------------------------------------------------------- #
#  AnnouncementMedia                                                           #
# --------------------------------------------------------------------------- #

class AnnouncementMediaSerializer(serializers.ModelSerializer):
    file = serializers.SerializerMethodField()

    class Meta:
        model = AnnouncementMedia
        fields = ['id', 'file', 'media_type', 'order']

    def get_file(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url if obj.file else None


class AnnouncementMediaWriteSerializer(serializers.Serializer):
    """Used when creating/updating media items (receives raw File objects)."""
    file = serializers.FileField()
    order = serializers.IntegerField(required=False, default=0)

    def validate_file(self, value):
        # Size check (Risk 1)
        if value.size > MAX_FILE_SIZE_BYTES:
            raise serializers.ValidationError(
                f'File "{value.name}" exceeds the 50 MB size limit.'
            )

        # Extension check (Risk 2)
        ext = value.name.rsplit('.', 1)[-1].lower() if '.' in value.name else ''
        if ext not in ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                f'Unsupported file type ".{ext}". '
                f'Allowed types: {", ".join(sorted(ALLOWED_EXTENSIONS))}.'
            )

        # MIME type check (Risk 2)
        guessed_mime, _ = mimetypes.guess_type(value.name)
        content_type = getattr(value, 'content_type', guessed_mime or '')
        if content_type and content_type not in ALLOWED_MIMES:
            raise serializers.ValidationError(
                f'Unsupported MIME type "{content_type}". '
                f'Upload images (jpg, jpeg, png, gif, webp) or '
                f'videos (mp4, webm, ogg) only.'
            )
        return value


# --------------------------------------------------------------------------- #
#  AnnouncementReaction                                                        #
# --------------------------------------------------------------------------- #

ALLOWED_EMOJIS = {'❤️', '😂', '😮', '😢', '👏'}


class AnnouncementReactionSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_avatar = serializers.SerializerMethodField()

    class Meta:
        model = AnnouncementReaction
        fields = ['id', 'user_name', 'user_avatar', 'emoji']

    def get_user_name(self, obj):
        u = obj.user
        parts = [u.firstname or '', u.lastname or '']
        return ' '.join(p for p in parts if p).strip() or u.email

    def get_user_avatar(self, obj):
        request = self.context.get('request')
        if obj.user.avatar and request:
            return request.build_absolute_uri(obj.user.avatar.url)
        return None


# --------------------------------------------------------------------------- #
#  AnnouncementComment                                                         #
# --------------------------------------------------------------------------- #

class AnnouncementCommentSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_avatar = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()

    class Meta:
        model = AnnouncementComment
        fields = [
            'id', 'user_name', 'user_avatar', 'user',
            'content', 'created_at', 'updated_at', 'parent', 'replies',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def get_user_name(self, obj):
        u = obj.user
        parts = [u.firstname or '', u.lastname or '']
        return ' '.join(p for p in parts if p).strip() or u.email

    def get_user_avatar(self, obj):
        request = self.context.get('request')
        if obj.user.avatar and request:
            return request.build_absolute_uri(obj.user.avatar.url)
        return None

    def get_replies(self, obj):
        # 1 level deep only
        if obj.parent_id is not None:
            return []
        qs = obj.replies.select_related('user').order_by('created_at')
        return AnnouncementCommentSerializer(qs, many=True, context=self.context).data


# --------------------------------------------------------------------------- #
#  Announcement List (lightweight)                                             #
# --------------------------------------------------------------------------- #

class AnnouncementListSerializer(serializers.ModelSerializer):
    media = AnnouncementMediaSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    created_by_avatar = serializers.SerializerMethodField()
    reaction_count = serializers.IntegerField(read_only=True)
    comment_count = serializers.IntegerField(read_only=True)
    user_reaction = serializers.CharField(allow_null=True, read_only=True)
    top_reactors = serializers.SerializerMethodField()
    reaction_emojis = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            'id', 'title', 'caption', 'is_published',
            'created_by_id', 'created_by_name', 'created_by_avatar',
            'created_at', 'updated_at',
            'media', 'reaction_count', 'comment_count',
            'user_reaction', 'top_reactors', 'reaction_emojis',
        ]

    def get_created_by_name(self, obj):
        u = obj.created_by
        parts = [u.firstname or '', u.lastname or '']
        return ' '.join(p for p in parts if p).strip() or u.email

    def get_created_by_avatar(self, obj):
        request = self.context.get('request')
        if obj.created_by.avatar and request:
            return request.build_absolute_uri(obj.created_by.avatar.url)
        return None

    def get_top_reactors(self, obj):
        request = self.context.get('request')
        reactors = []
        for reaction in obj.reactions.select_related('user').order_by('created_at')[:5]:
            avatar = None
            if reaction.user.avatar and request:
                avatar = request.build_absolute_uri(reaction.user.avatar.url)
            parts = [reaction.user.firstname or '', reaction.user.lastname or '']
            user_name = ' '.join(p for p in parts if p).strip() or reaction.user.email
            reactors.append({'avatar': avatar, 'name': user_name, 'emoji': reaction.emoji})
        return reactors

    def get_reaction_emojis(self, obj):
        emojis = []
        for emoji in obj.reactions.order_by('created_at').values_list('emoji', flat=True):
            if emoji and emoji not in emojis:
                emojis.append(emoji)
            if len(emojis) >= 3:
                break
        return emojis


# --------------------------------------------------------------------------- #
#  Announcement Write                                                          #
# --------------------------------------------------------------------------- #

class AnnouncementWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ['id', 'title', 'caption', 'is_published']

    def validate_caption(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Caption is required.')
        return value
