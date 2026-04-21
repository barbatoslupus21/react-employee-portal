from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.utils import timezone

class LoginCredentialsManager(UserManager):
    use_in_migrations = True

    def _create_user(self, username, password, **extra_fields):
        if not username:
            raise ValueError('The given idnumber must be set')
        username = self.model.normalize_username(username)
        # Populate both idnumber (our USERNAME_FIELD) and username
        # (inherited AbstractUser field with unique=True) to avoid
        # IntegrityError when multiple users are created.
        user = self.model(idnumber=username, username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, username=None, email=None, password=None, **extra_fields):
        if username is None:
            username = extra_fields.pop(self.model.USERNAME_FIELD, None)
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(username, password, **extra_fields)

    def create_superuser(self, username=None, email=None, password=None, **extra_fields):
        if username is None:
            username = extra_fields.pop(self.model.USERNAME_FIELD, None)
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self._create_user(username, password, **extra_fields)

class loginCredentials(AbstractUser):

    avatar = models.ImageField(upload_to='profile/', null=True, blank=True, default=None)
    idnumber = models.CharField(max_length=15, unique=True,)
    firstname = models.CharField(max_length=20, null=True)
    lastname = models.CharField(max_length=20, null=True)
    email = models.EmailField(blank=True)

    #Status
    active = models.BooleanField(default=True)
    locked = models.BooleanField(default=False)
    change_password = models.BooleanField(default=False)

    # Permissions 
    admin = models.BooleanField(default=False)
    news = models.BooleanField(default=False)
    clinic = models.BooleanField(default=False)
    iad = models.BooleanField(default=False)
    accounting = models.BooleanField(default=False)
    hr = models.BooleanField(default=False)
    hr_manager = models.BooleanField(default=False)
    mis = models.BooleanField(default=False)

    #Display
    theme = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    objects = LoginCredentialsManager()
    USERNAME_FIELD = 'idnumber'
    REQUIRED_FIELDS = []

    class Meta:
        db_table = 'users'

    def __str__(self):
        return f'{self.firstname} {self.lastname} ({self.idnumber})'


class EmployeeSnapshot(models.Model):
    """
    Daily snapshot of aggregated employee counts.

    One record per calendar date (unique constraint enforced on `snapshot_date`).
    The record captures the state of the non-privileged employee population at
    the moment the snapshot was taken.  All counts must be non-negative and the
    subgroup totals (regular + probationary + ojt) do not need to sum to `total`
    because some employees may have no employment-type assigned yet.

    This model is the authoritative data source for the Admin Chart Card,
    replacing real-time aggregation over raw employee records.
    """

    snapshot_date  = models.DateField(unique=True, db_index=True)
    total          = models.PositiveIntegerField(default=0)
    regular        = models.PositiveIntegerField(default=0)
    probationary   = models.PositiveIntegerField(default=0)
    ojt            = models.PositiveIntegerField(default=0)
    male           = models.PositiveIntegerField(default=0)
    female         = models.PositiveIntegerField(default=0)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'employee_snapshots'
        ordering  = ['snapshot_date']

    def __str__(self):
        return f'Snapshot {self.snapshot_date}: {self.total} employees'

    def clean(self):
        from django.core.exceptions import ValidationError
        errors = {}
        for field in ('regular', 'probationary', 'ojt', 'male', 'female'):
            if getattr(self, field) > self.total:
                errors[field] = f'{field} count ({getattr(self, field)}) exceeds total ({self.total}).'
        if errors:
            raise ValidationError(errors)


class LoginAttempt(models.Model):
    """Records every login attempt for rate-limiting and security auditing."""

    ip_address = models.GenericIPAddressField()
    user = models.ForeignKey(
        loginCredentials,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='login_attempts',
    )
    was_successful = models.BooleanField()
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'login_attempts'
        ordering = ['-created_at']

    def __str__(self):
        status = 'OK' if self.was_successful else 'FAIL'
        return f'{self.ip_address} [{status}] {self.created_at:%Y-%m-%d %H:%M}'
