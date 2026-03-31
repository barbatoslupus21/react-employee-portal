from django.core.validators import RegexValidator
from django.db import models
from userLogin.models import loginCredentials

_NO_SPECIAL_CHARS = RegexValidator(
    regex=r'^[^<>{}\[\]\\|^~`"]*$',
    message='Field contains invalid characters.',
)


class CertificateCategory(models.Model):
    """A named category for grouping certificates (maps to a frontend icon)."""

    name = models.CharField(max_length=100, unique=True, validators=[_NO_SPECIAL_CHARS])
    # Key consumed by the frontend to select the matching 3-D icon / gradient.
    icon_key = models.CharField(max_length=50, default='award')

    class Meta:
        ordering = ['name']
        verbose_name = 'Certificate Category'
        verbose_name_plural = 'Certificate Categories'

    def __str__(self) -> str:
        return self.name


class Certificate(models.Model):
    """A single PDF certificate issued to an employee."""

    employee = models.ForeignKey(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='certificates',
    )
    category = models.ForeignKey(
        CertificateCategory,
        on_delete=models.PROTECT,
        related_name='certificates',
    )
    title = models.CharField(max_length=255, validators=[_NO_SPECIAL_CHARS])
    objective = models.TextField(max_length=500)
    file = models.FileField(upload_to='certificates/')
    original_filename = models.CharField(max_length=255)
    uploaded_by = models.ForeignKey(
        loginCredentials,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_certificates',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Certificate'
        verbose_name_plural = 'Certificates'

    def __str__(self) -> str:
        return f'{self.employee} – {self.title}'


class CertificateView(models.Model):
    """Records that a specific user has opened / viewed a Certificate.

    Used to drive the "New" pill indicator on the frontend — a certificate is
    considered new until the employee has opened it at least once.
    """

    certificate = models.ForeignKey(
        Certificate,
        on_delete=models.CASCADE,
        related_name='views',
    )
    viewer = models.ForeignKey(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='viewed_certificates',
    )
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('certificate', 'viewer')
        db_table = 'certificate_views'
        verbose_name = 'Certificate View'
        verbose_name_plural = 'Certificate Views'

    def __str__(self) -> str:
        return f'{self.viewer} viewed "{self.certificate.title}"'
