from django.conf import settings
from django.db import models
from django.utils import timezone


class ActivityLog(models.Model):
    """Immutable record of every authenticated user action.

    No add / change / delete permissions are exposed — only superusers may
    view and export logs via the admin interface.  MAC-address resolution is
    best-effort: HTTP does not carry client MAC addresses, so the server's own
    primary interface MAC is stored unless the client sends ``X-MAC-Address``.
    """

    # ── User ──────────────────────────────────────────────────────────────────
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='activity_logs',
    )
    # Denormalised so the record stays meaningful even if the account is deleted.
    username = models.CharField(max_length=150, blank=True, db_index=True)
    employee_id = models.CharField(max_length=15, blank=True, db_index=True)

    # ── Network ───────────────────────────────────────────────────────────────
    ip_address = models.GenericIPAddressField(null=True, blank=True, db_index=True)
    # "XX:XX:XX:XX:XX:XX" – 17 chars max.
    mac_address = models.CharField(max_length=17, blank=True, db_index=True)

    # ── Action ────────────────────────────────────────────────────────────────
    module = models.CharField(max_length=100, blank=True, db_index=True)
    action = models.CharField(max_length=255, blank=True, db_index=True)
    http_method = models.CharField(max_length=10, db_index=True)
    endpoint = models.CharField(max_length=500)

    # ── Timestamp (always UTC — display in the user's local TZ on the FE) ─────
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'activity_logs'
        ordering = ['-timestamp']
        # Only the 'view' permission is created automatically; no add/change/delete.
        default_permissions = ('view',)
        verbose_name = 'Activity Log'
        verbose_name_plural = 'Activity Logs'

    def __str__(self) -> str:
        return f'[{self.timestamp:%Y-%m-%d %H:%M UTC}] {self.username} – {self.action}'


class Notification(models.Model):
    """In-app notification delivered to a specific user when their PRF status changes."""

    TYPE_CHOICES = [
        ('prf_approved',              'PRF Request Approved'),
        ('prf_disapproved',           'PRF Request Disapproved'),
        ('prf_cancelled',             'PRF Request Cancelled'),
        ('certificate_issued',        'Certificate Issued'),
        ('password_reset',            'Password Reset by Administrator'),
        ('promotion',                 'Position Promotion'),
        ('leave_approved',            'Leave Request Approved'),
        ('leave_disapproved',         'Leave Request Disapproved'),
        ('leave_pending_approval',    'Leave Request Pending Approval'),
        ('leave_cancelled',           'Leave Request Cancelled'),        ('survey_assigned',           'Survey Assigned'),
        ('survey_reminder',           'Survey Reminder'),    ]

    SCOPE_CHOICES = [
        ('specific_user', 'Specific User'),
        ('general',       'General'),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications',
    )
    notification_scope = models.CharField(
        max_length=20, choices=SCOPE_CHOICES, default='specific_user', db_index=True
    )
    notification_type = models.CharField(max_length=30, choices=TYPE_CHOICES, db_index=True)
    title    = models.CharField(max_length=255)
    message  = models.TextField()
    is_read  = models.BooleanField(default=False, db_index=True)
    # Generic module reference used by the frontend to route the user when
    # they click a notification.  Use snake-case slugs, e.g. 'pr-form',
    # 'certification'.  Blank means the notification is not module-specific.
    module            = models.CharField(max_length=50, blank=True, db_index=True)
    # Generic reference to the primary key of the related object (PRF id,
    # Certificate id, etc.).  Replaces the former PRF-specific fields so that
    # the notification system remains module-agnostic.
    related_object_id = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'notifications'
        ordering  = ['-created_at']
        default_permissions = ()
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'

    def __str__(self) -> str:
        return f'[{self.created_at:%Y-%m-%d}] {self.recipient} – {self.title}'
