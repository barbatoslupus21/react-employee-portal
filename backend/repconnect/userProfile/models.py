from django.core.validators import RegexValidator
from django.db import models

from generalsettings.models import Department, EmploymentType, Line, Office, Position, Shift
from userLogin.models import loginCredentials

# ── Shared validators ──────────────────────────────────────────────────────────

_NO_SPECIAL_CHARS = RegexValidator(
    regex=r'^[^<>{}\[\]\\|^~`"]*$',
    message='Field contains invalid characters.',
)

_PH_CONTACT = RegexValidator(
    regex=r'^(\+63|0)\d{10}$',
    message='Enter a valid Philippine mobile number (e.g. 09171234567 or +639171234567).',
)


# ── Work Information ───────────────────────────────────────────────────────────

class workInformation(models.Model):
    """
    Core employment record for an employee.

    User-editable fields : department, line, approver
    Admin-only fields    : position, employment_type, date_hired, tin_number,
                           sss_number, hdmf_number, philhealth_number, bank_account
    """

    employee   = models.ForeignKey(loginCredentials, on_delete=models.CASCADE)
    office     = models.ForeignKey(Office, on_delete=models.CASCADE)
    shift      = models.ForeignKey(Shift, on_delete=models.CASCADE)
    department = models.ForeignKey(Department, on_delete=models.CASCADE)
    line       = models.ForeignKey(
        Line,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='work_employees',
    )

    # ── User-selectable approver ───────────────────────────────────────────────
    approver = models.ForeignKey(
        loginCredentials,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approving',
        help_text='The employee who approves requests submitted by this user.',
    )

    # ── Admin-only employment details ──────────────────────────────────────────
    position = models.ForeignKey(
        Position,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees',
    )
    employment_type = models.ForeignKey(
        EmploymentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees',
    )
    date_hired          = models.DateField(null=True, blank=True)
    tin_number          = models.CharField(max_length=20, blank=True, default='')
    sss_number          = models.CharField(max_length=20, blank=True, default='')
    hdmf_number         = models.CharField(max_length=20, blank=True, default='')
    philhealth_number   = models.CharField(max_length=20, blank=True, default='')
    bank_account        = models.CharField(max_length=50,  blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return (
            f'Work information for {self.employee} in {self.department} '
            f'at {self.office} during {self.shift}'
        )


# ── Personal Information ───────────────────────────────────────────────────────

class PersonalInformation(models.Model):
    """
    Supplementary personal details for a user.
    One-to-one with loginCredentials.
    """

    GENDER_CHOICES = [
        ('male',   'Male'),
        ('female', 'Female'),
    ]

    employee       = models.OneToOneField(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='personal_info',
    )
    middle_name    = models.CharField(max_length=50,  blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    nickname       = models.CharField(max_length=50,  blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    work_email     = models.EmailField(max_length=254, blank=True, default='')
    gender         = models.CharField(max_length=15,  blank=True, default='', choices=GENDER_CHOICES)
    birth_date     = models.DateField(null=True, blank=True)
    birth_place    = models.CharField(max_length=150, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    contact_number = models.CharField(max_length=15,  blank=True, default='', validators=[_PH_CONTACT])

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Personal Information'
        verbose_name_plural = 'Personal Information'

    def __str__(self):
        return f'Personal info — {self.employee}'


# ── Present Address ────────────────────────────────────────────────────────────

class PresentAddress(models.Model):
    """Current residential address of the employee."""

    employee = models.OneToOneField(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='present_address',
    )
    country   = models.CharField(max_length=100, blank=True, default='Philippines', validators=[_NO_SPECIAL_CHARS])
    province  = models.CharField(max_length=100, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    city      = models.CharField(max_length=100, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    barangay  = models.CharField(max_length=150, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    street    = models.CharField(max_length=200, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    block_lot = models.CharField(max_length=50,  blank=True, default='', validators=[_NO_SPECIAL_CHARS])

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Present Address'
        verbose_name_plural = 'Present Addresses'

    def __str__(self):
        return f'Present address — {self.employee}'


# ── Provincial Address ─────────────────────────────────────────────────────────

class ProvincialAddress(models.Model):
    """
    Home province address of the employee.
    ``same_as_present`` signals the frontend to mirror Present Address values.
    """

    employee = models.OneToOneField(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='provincial_address',
    )
    same_as_present = models.BooleanField(
        default=False,
        help_text='When True the provincial address mirrors the present address.',
    )
    country   = models.CharField(max_length=100, blank=True, default='Philippines', validators=[_NO_SPECIAL_CHARS])
    province  = models.CharField(max_length=100, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    city      = models.CharField(max_length=100, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    barangay  = models.CharField(max_length=150, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    street    = models.CharField(max_length=200, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    block_lot = models.CharField(max_length=50,  blank=True, default='', validators=[_NO_SPECIAL_CHARS])

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Provincial Address'
        verbose_name_plural = 'Provincial Addresses'

    def __str__(self):
        return f'Provincial address — {self.employee}'


# ── Emergency Contact ──────────────────────────────────────────────────────────

class EmergencyContact(models.Model):
    """Primary emergency contact for the employee."""

    employee       = models.OneToOneField(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='emergency_contact',
    )
    name           = models.CharField(max_length=100, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    relationship   = models.CharField(max_length=50,  blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    contact_number = models.CharField(max_length=15,  blank=True, default='', validators=[_PH_CONTACT])
    address        = models.CharField(max_length=300, blank=True, default='', validators=[_NO_SPECIAL_CHARS])

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Emergency Contact'
        verbose_name_plural = 'Emergency Contacts'

    def __str__(self):
        return f'Emergency contact — {self.employee}'


# ── Family Background ──────────────────────────────────────────────────────────

class FamilyBackground(models.Model):
    """Parent and spouse information for the employee."""

    employee    = models.OneToOneField(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='family_background',
    )
    mother_name = models.CharField(max_length=100, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    father_name = models.CharField(max_length=100, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    spouse_name = models.CharField(max_length=100, blank=True, default='', validators=[_NO_SPECIAL_CHARS])

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Family Background'
        verbose_name_plural = 'Family Backgrounds'

    def __str__(self):
        return f'Family background — {self.employee}'


# ── Child Record ───────────────────────────────────────────────────────────────

class ChildRecord(models.Model):
    """A single child entry for an employee's family background."""

    employee = models.ForeignKey(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='children',
    )
    name = models.CharField(max_length=100, validators=[_NO_SPECIAL_CHARS])

    class Meta:
        ordering = ['id']
        verbose_name = 'Child Record'
        verbose_name_plural = 'Child Records'

    def __str__(self):
        return f'{self.name} (child of {self.employee})'


EDUCATION_LEVEL_CHOICES = [
    ('primary',   'Primary'),
    ('secondary', 'Secondary'),
    ('vocational', 'Vocational'),
    ('tertiary',  'Tertiary'),
]


# ── Education Record ───────────────────────────────────────────────────────────

class EducationRecord(models.Model):
    """A single educational attainment entry for an employee."""

    EDUCATION_LEVEL_CHOICES = EDUCATION_LEVEL_CHOICES

    employee      = models.ForeignKey(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='education_records',
    )
    institution   = models.CharField(max_length=200, validators=[_NO_SPECIAL_CHARS])
    education_level = models.CharField(
        max_length=20,
        choices=EDUCATION_LEVEL_CHOICES,
        blank=True,
        default='',
        validators=[_NO_SPECIAL_CHARS],
        help_text='Education level for this record.',
    )
    degree        = models.CharField(max_length=200, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    year_attended = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text='Year attended or year graduated (e.g. 2018).',
    )

    class Meta:
        ordering = ['-year_attended', 'id']
        verbose_name = 'Education Record'
        verbose_name_plural = 'Education Records'

    def __str__(self):
        return f'{self.institution} — {self.degree} ({self.year_attended})'


# ── Skill ─────────────────────────────────────────────────────────────────────

class Skill(models.Model):
    """A professional skill tag entered by the employee."""

    employee = models.ForeignKey(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='profile_skills',
    )
    name = models.CharField(max_length=100, validators=[_NO_SPECIAL_CHARS])

    class Meta:
        ordering         = ['name']
        unique_together  = [('employee', 'name')]
        verbose_name     = 'Skill'
        verbose_name_plural = 'Skills'

    def __str__(self):
        return f'{self.name} — {self.employee}'