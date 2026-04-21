from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator
from django.db import models

_NO_SPECIAL_CHARS = RegexValidator(
    regex=r'^[^<>{}\[\]\\|^~`"]*$',
    message='Name contains invalid characters.',
)


# ── Shift ──────────────────────────────────────────────────────────────────────

class Shift(models.Model):
    """A named work shift with defined start and end times."""

    name = models.CharField(
        max_length=50,
        unique=True,
        validators=[_NO_SPECIAL_CHARS],
    )
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ['start_time', 'name']

    def __str__(self) -> str:
        return f'{self.name}  ({self.start_time:%H:%M} – {self.end_time:%H:%M})'


# ── Office ─────────────────────────────────────────────────────────────────────

class Office(models.Model):
    """
    A physical or logical office location.
    Each office may run one or more shifts.
    """

    name = models.CharField(
        max_length=100,
        unique=True,
        validators=[_NO_SPECIAL_CHARS],
    )
    shifts = models.ManyToManyField(
        Shift,
        blank=True,
        related_name='offices',
        help_text='Shifts that are active in this office.',
    )

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        return self.name


# ── Department ─────────────────────────────────────────────────────────────────

class Department(models.Model):
    """A department that belongs to one office."""

    name = models.CharField(
        max_length=100,
        validators=[_NO_SPECIAL_CHARS],
    )
    office = models.ForeignKey(
        Office,
        on_delete=models.CASCADE,
        related_name='departments',
    )

    class Meta:
        ordering = ['office', 'name']
        unique_together = [('name', 'office')]

    def __str__(self) -> str:
        return f'{self.name} — {self.office}'


# ── Line ───────────────────────────────────────────────────────────────────────

class Line(models.Model):
    """A production / work line that belongs to one department."""

    name = models.CharField(
        max_length=100,
        validators=[_NO_SPECIAL_CHARS],
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        related_name='lines',
    )

    class Meta:
        ordering = ['department', 'name']
        unique_together = [('name', 'department')]

    def __str__(self) -> str:
        return f'{self.name} — {self.department}'


# ── Password Policy ────────────────────────────────────────────────────────────

class PasswordPolicy(models.Model):
    """
    Singleton model — only one row should ever exist.
    Controls application-wide password requirements.
    """

    require_change_on_first_login = models.BooleanField(
        default=True,
        help_text='Force password change when a user logs in for the first time.',
    )
    min_length = models.PositiveSmallIntegerField(
        default=8,
        validators=[MinValueValidator(6), MaxValueValidator(64)],
        help_text='Minimum number of characters (6 – 64).',
    )
    require_uppercase = models.BooleanField(
        default=True,
        help_text='Password must contain at least one uppercase letter (A–Z).',
    )
    require_lowercase = models.BooleanField(
        default=True,
        help_text='Password must contain at least one lowercase letter (a–z).',
    )
    require_number = models.BooleanField(
        default=True,
        help_text='Password must contain at least one digit (0–9).',
    )
    require_special_character = models.BooleanField(
        default=False,
        help_text='Password must contain at least one special character (!@#$%^&* …).',
    )

    class Meta:
        verbose_name = 'Password Policy'
        verbose_name_plural = 'Password Policy'

    def __str__(self) -> str:
        return 'Password Policy'

    def save(self, *args, **kwargs):
        # Enforce singleton — always reuse pk=1
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls) -> 'PasswordPolicy':
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


# ── Email Configuration ────────────────────────────────────────────────────────

class EmailConfiguration(models.Model):
    """
    Singleton model — only one row should ever exist.
    Stores SMTP credentials used by the certificate "Send to Email" feature.
    """

    PROVIDER_CHOICES = [
        ('gmail',     'Gmail'),
        ('sendgrid',  'SendGrid'),
        ('outlook',   'Outlook / Office 365'),
        ('custom',    'Custom SMTP'),
    ]

    provider  = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default='gmail')
    smtp_host = models.CharField(max_length=255, default='smtp.gmail.com')
    smtp_port = models.PositiveIntegerField(default=587)
    use_ssl   = models.BooleanField(default=False, help_text='Use SSL (port 465).')
    use_tls   = models.BooleanField(default=True,  help_text='Use STARTTLS (port 587).')
    username  = models.EmailField(max_length=255)
    # Stored as plaintext — restrict admin access accordingly.
    password  = models.CharField(max_length=255)
    from_name = models.CharField(max_length=100, blank=True,
                                 help_text='Display name shown in the From field.')

    class Meta:
        verbose_name = 'Email Configuration'
        verbose_name_plural = 'Email Configuration'

    def __str__(self) -> str:
        return f'{self.get_provider_display()} – {self.username}'  # type: ignore[attr-defined]

    def save(self, *args, **kwargs) -> None:
        # Enforce singleton.
        self.pk = 1
        super().save(*args, **kwargs)


# ── Position ───────────────────────────────────────────────────────────────────

class Position(models.Model):
    """
    A job position / rank within the organisation.
    ``level_of_approval`` is used to determine approval hierarchy —
    a higher value means a higher authority level.
    """

    name = models.CharField(
        max_length=100,
        unique=True,
        validators=[_NO_SPECIAL_CHARS],
    )
    level_of_approval = models.PositiveSmallIntegerField(
        default=0,
        help_text='Hierarchical approval level (0 = lowest). Used to determine eligible approvers.',
    )

    class Meta:
        ordering = ['-level_of_approval', 'name']
        verbose_name = 'Position'
        verbose_name_plural = 'Positions'

    def __str__(self) -> str:
        return f'{self.name} (level {self.level_of_approval})'


# ── Employment Type ────────────────────────────────────────────────────────────

class EmploymentType(models.Model):
    """
    Classifies the nature of employment (e.g. Regular, Contractual, Part-time).
    """

    name = models.CharField(
        max_length=100,
        unique=True,
        validators=[_NO_SPECIAL_CHARS],
    )

    class Meta:
        ordering = ['name']
        verbose_name = 'Employment Type'
        verbose_name_plural = 'Employment Types'

    def __str__(self) -> str:
        return self.name
