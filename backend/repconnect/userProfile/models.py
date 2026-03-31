from django.db import models
from userLogin.models import loginCredentials
from generalsettings.models import Department, Line, Office, Shift


class workInformation(models.Model):
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Work information for {self.employee} in {self.department} at {self.office} during {self.shift}"