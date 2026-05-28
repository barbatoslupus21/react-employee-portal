"""Serializers for the MIS Ticket module."""
from __future__ import annotations

from rest_framework import serializers

from .models import MISChatMessage, MISChatSession, MISDevice, MISTicket, MISTicketDiagnosis


# ── Device ────────────────────────────────────────────────────────────────────

class MISDeviceSerializer(serializers.ModelSerializer):
    device_type_display = serializers.CharField(source='get_device_type_display', read_only=True)

    class Meta:
        model = MISDevice
        fields = [
            'id', 'device_name', 'device_type', 'device_type_display',
            'other_device_type', 'brand', 'model_name', 'serial_number',
            'asset_tag', 'location', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'device_type_display']

    def validate_device_type(self, value):
        valid = {v for v, _ in MISDevice.DEVICE_TYPES}
        if value not in valid:
            raise serializers.ValidationError('Invalid device type.')
        return value

    def validate(self, attrs):
        if attrs.get('device_type') == 'other' and not attrs.get('other_device_type', '').strip():
            raise serializers.ValidationError(
                {'other_device_type': 'Please specify the device type when "Other" is selected.'}
            )
        return attrs


# ── Diagnosis ─────────────────────────────────────────────────────────────────

class MISTicketDiagnosisSerializer(serializers.ModelSerializer):
    class Meta:
        model = MISTicketDiagnosis
        fields = [
            'id', 'technician_name', 'progress_note', 'diagnosis',
            'action_taken', 'possible_reason', 'recommendation',
            'requires_immediate_action', 'recommended_parts',
            'diagnosed_at', 'last_diagnosed_at',
        ]
        read_only_fields = ['id', 'technician_name', 'diagnosed_at', 'last_diagnosed_at']


# ── Ticket (user-facing) ──────────────────────────────────────────────────────

class MISTicketListSerializer(serializers.ModelSerializer):
    status_display   = serializers.CharField(source='get_status_display',   read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    has_diagnosis             = serializers.SerializerMethodField()
    device_display            = serializers.SerializerMethodField()
    diagnosis_note            = serializers.SerializerMethodField()
    requires_immediate_action = serializers.SerializerMethodField()
    has_recommended_parts     = serializers.SerializerMethodField()

    class Meta:
        model = MISTicket
        fields = [
            'id', 'ticket_number', 'employee_name', 'subject', 'device_name',
            'device_display',
            'category', 'category_display',
            'priority', 'priority_display', 'problem', 'status', 'status_display',
            'has_diagnosis', 'diagnosis_note',
            'requires_immediate_action', 'has_recommended_parts',
            'seen', 'created_at', 'resolved_at',
        ]

    def get_has_diagnosis(self, obj) -> bool:
        return hasattr(obj, 'diagnosis')

    def get_device_display(self, obj) -> str:
        device = obj.device
        if device:
            device_label = f'{device.brand} {device.model_name}'.strip()
            return device_label or device.device_name or obj.device_name or ''
        return obj.device_name or ''

    def get_diagnosis_note(self, obj) -> str:
        if hasattr(obj, 'diagnosis'):
            return obj.diagnosis.progress_note or ''
        return ''

    def get_requires_immediate_action(self, obj) -> bool:
        if hasattr(obj, 'diagnosis'):
            return obj.diagnosis.requires_immediate_action
        return False

    def get_has_recommended_parts(self, obj) -> bool:
        if hasattr(obj, 'diagnosis'):
            return bool(obj.diagnosis.recommended_parts)
        return False


class MISTicketDetailSerializer(MISTicketListSerializer):
    diagnosis = MISTicketDiagnosisSerializer(read_only=True)

    class Meta(MISTicketListSerializer.Meta):
        fields = MISTicketListSerializer.Meta.fields + [
            'department', 'diagnosis', 'updated_at',
        ]

    def get_requires_immediate_action(self, obj) -> bool:
        if hasattr(obj, 'diagnosis'):
            return obj.diagnosis.requires_immediate_action
        return False

    def get_has_recommended_parts(self, obj) -> bool:
        if hasattr(obj, 'diagnosis'):
            return bool(obj.diagnosis.recommended_parts)
        return False


class MISTicketCreateSerializer(serializers.Serializer):
    """Validates manual ticket creation payload from the user."""

    ALLOWED_CATEGORIES = {c[0] for c in MISTicket.CATEGORY_CHOICES}

    subject   = serializers.CharField(max_length=200)
    category  = serializers.ChoiceField(choices=list(MISTicket.CATEGORY_CHOICES))
    device_id = serializers.IntegerField(required=False, allow_null=True)
    problem   = serializers.CharField(max_length=5000)


# ── Ticket (admin-facing) ─────────────────────────────────────────────────────

class AdminMISTicketListSerializer(serializers.ModelSerializer):
    status_display   = serializers.CharField(source='get_status_display',   read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    has_diagnosis    = serializers.SerializerMethodField()
    diagnosis        = MISTicketDiagnosisSerializer(read_only=True)

    class Meta:
        model = MISTicket
        fields = [
            'id', 'ticket_number', 'employee_name', 'department', 'subject',
            'device_name', 'category', 'category_display',
            'priority', 'priority_display', 'problem',
            'status', 'status_display', 'has_diagnosis', 'diagnosis',
            'created_at', 'updated_at', 'resolved_at',
        ]

    def get_has_diagnosis(self, obj) -> bool:
        return hasattr(obj, 'diagnosis')


# ── Chat ──────────────────────────────────────────────────────────────────────

class MISChatSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = MISChatSession
        fields = ['id', 'session_id', 'created_at', 'last_active']


class MISChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = MISChatMessage
        fields = ['id', 'message', 'is_ai', 'is_ticket_creation', 'created_at']
