from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


# ── Feedback Settings (singleton) ─────────────────────────────────────────────

class FeedbackSettings(models.Model):
    """
    Singleton — controls whether the feedback modal is shown system-wide.
    """
    enabled = models.BooleanField(
        default=False,
        help_text='Show the feedback modal to all non-admin users.',
    )

    class Meta:
        verbose_name = 'Feedback Settings'
        verbose_name_plural = 'Feedback Settings'

    def __str__(self) -> str:
        return 'Feedback Settings'

    def save(self, *args, **kwargs) -> None:
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls) -> 'FeedbackSettings':
        obj, _ = cls.objects.get_or_create(pk=1, defaults={'enabled': False})
        return obj


# ── System Feedback ────────────────────────────────────────────────────────────

class SystemFeedback(models.Model):
    """
    A feedback submission from a non-admin user.
    One submission per user per calendar month is enforced in the view.
    """
    employee = models.ForeignKey(
        'userLogin.loginCredentials',
        on_delete=models.CASCADE,
        related_name='system_feedbacks',
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    feedback_text = models.TextField(max_length=2000, blank=True, default='')
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'system_feedback'
        ordering = ['-submitted_at']

    def __str__(self) -> str:
        return f'{self.employee} — {self.rating}★'


class SystemFeedbackModalState(models.Model):
    """
    Tracks per-user monthly feedback modal state and appearances.
    """
    employee = models.ForeignKey(
        'userLogin.loginCredentials',
        on_delete=models.CASCADE,
        related_name='feedback_modal_states',
    )
    month = models.DateField(help_text='First day of the current calendar month.')
    appearance_count = models.PositiveSmallIntegerField(default=0)
    submitted = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'system_feedback_modal_state'
        unique_together = ('employee', 'month')

    def __str__(self) -> str:
        return f'{self.employee} — {self.month.isoformat()}'


# ── Update Settings (singleton) ────────────────────────────────────────────────

class UpdateSettings(models.Model):
    """
    Singleton — controls whether the What's New modal is shown system-wide.
    """
    enabled = models.BooleanField(
        default=False,
        help_text="Show the What's New modal to all non-admin users.",
    )

    class Meta:
        verbose_name = 'Update Settings'
        verbose_name_plural = 'Update Settings'

    def __str__(self) -> str:
        return 'Update Settings'

    def save(self, *args, **kwargs) -> None:
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls) -> 'UpdateSettings':
        obj, _ = cls.objects.get_or_create(pk=1, defaults={'enabled': False})
        return obj


# ── System Update ──────────────────────────────────────────────────────────────

class SystemUpdate(models.Model):
    """
    An admin-created update entry displayed in the What's New modal.
    Version must follow semantic versioning (x.y.z) and is unique.
    """
    version = models.CharField(max_length=20, unique=True)
    description = models.TextField(max_length=5000)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'system_update'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'v{self.version}'


# ── System Update Seen ─────────────────────────────────────────────────────────

class SystemUpdateSeen(models.Model):
    """
    Tracks which users have acknowledged which system updates.
    """
    employee = models.ForeignKey(
        'userLogin.loginCredentials',
        on_delete=models.CASCADE,
        related_name='seen_updates',
    )
    update = models.ForeignKey(
        SystemUpdate,
        on_delete=models.CASCADE,
        related_name='seen_by',
    )
    seen_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'system_update_seen'
        unique_together = ('employee', 'update')

    def __str__(self) -> str:
        return f'{self.employee} saw v{self.update.version}'
