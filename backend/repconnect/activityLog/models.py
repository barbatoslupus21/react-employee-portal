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
        ('announcement',              'New Announcement'),
        ('calendar_event',            'Calendar Event'),
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
        ('survey_reminder',           'Survey Reminder'),
        ('training_assigned',         'Training Evaluation Assigned'),
        ('training_submitted',        'Training Evaluation Submitted'),
        ('training_supervisor_review','Training Ready for Supervisor Review'),
        ('training_user_confirmation','Training Ready for Your Confirmation'),
        ('training_final_approval',   'Training Needs Final Approval'),
        ('training_returned',         'Training Returned for Re-evaluation'),
        ('training_completed',        'Training Evaluation Completed'),
        ('mis_ticket_created',        'MIS Ticket Created'),
        ('mis_ticket_updated',        'MIS Ticket Updated'),
        ('finance_loan_uploaded',     'Loan Record Uploaded'),
        ('finance_deduction_uploaded','Loan Deduction Uploaded'),
        ('finance_savings_withdrawn', 'Savings Withdrawal Recorded'),
    ]

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


class SystemErrorLog(models.Model):
    """Captures application errors (4xx/5xx, unhandled exceptions, failed API calls).

    * Only admin=True users may view these records via the API.
    * stack_trace is stored but only exposed in the detail endpoint (never in
      the list) to prevent server internals from leaking.
    * Absolute file-system paths in stack_trace are stripped before saving.
    * resolved=False items appear prominently in the Admin dashboard.
    """

    ERROR_TYPE_CHOICES = [
        ('400', 'Bad Request'),
        ('401', 'Unauthorized'),
        ('403', 'Forbidden'),
        ('404', 'Not Found'),
        ('405', 'Method Not Allowed'),
        ('500', 'Internal Server Error'),
        ('502', 'Bad Gateway'),
        ('503', 'Service Unavailable'),
        ('unhandled_exception', 'Unhandled Exception'),
        ('validation_error', 'Validation Error'),
        ('database_error', 'Database Error'),
        ('other', 'Other'),
    ]

    timestamp  = models.DateTimeField(auto_now_add=True, db_index=True)
    error_type = models.CharField(max_length=30, choices=ERROR_TYPE_CHOICES, default='other', db_index=True)
    module     = models.CharField(max_length=100, blank=True, db_index=True)
    message    = models.TextField()
    # stack_trace: never returned in list endpoints; only in detail (admin only).
    stack_trace = models.TextField(blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='triggered_errors',
    )
    resolved = models.BooleanField(default=False, db_index=True)

    class Meta:
        db_table = 'system_error_logs'
        ordering = ['-timestamp']
        default_permissions = ('view',)
        verbose_name = 'System Error Log'
        verbose_name_plural = 'System Error Logs'

    def __str__(self) -> str:
        return f'[{self.timestamp:%Y-%m-%d %H:%M}] {self.error_type} – {self.module}'
