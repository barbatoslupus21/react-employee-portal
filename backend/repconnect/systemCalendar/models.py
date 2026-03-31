from django.db import models
from userLogin.models import loginCredentials

class Timelogs(models.Model):
    ENTRY_CHOICES = [
        ('IN', 'Time In'),
        ('OUT', 'Time Out'),
    ]
    employee = models.ForeignKey(loginCredentials, on_delete=models.CASCADE)
    time = models.DateTimeField()
    entry = models.CharField(max_length=10, choices=ENTRY_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-time']

    def __str__(self):
        return f"Timelog for {self.employee} for {self.time} - {self.entry}"


class CalendarEvent(models.Model):
    """
    A personal/shared calendar event owned by a user.
    Members (shared attendees) are stored as a M2M relation.
    """
    EVENT_TYPES = [
        ('important', 'Important'),
        ('meeting',   'Meeting'),
        ('task',      'Task'),
        ('reminder',  'Reminder'),
        ('deadline',  'Deadline'),
        ('legal', 'Legal Holiday'),
        ('special', 'Special Holiday'),
        ('day_off', 'Day Off'),
        ('company', 'Company Holiday'),
    ]

    REPETITION_CHOICES = [
        ('once',    'Once'),
        ('daily',   'Daily'),
        ('weekly',  'Weekly'),
        ('monthly', 'Monthly'),
        ('yearly',  'Yearly'),
    ]

    title      = models.CharField(max_length=100)
    date       = models.DateField()
    event_type = models.CharField(max_length=20, choices=EVENT_TYPES, default='meeting')
    repetition = models.CharField(max_length=10, choices=REPETITION_CHOICES, default='once')
    note       = models.TextField(blank=True, default='', max_length=300)

    owner = models.ForeignKey(
        loginCredentials,
        on_delete=models.CASCADE,
        related_name='owned_events',
    )
    members = models.ManyToManyField(
        loginCredentials,
        blank=True,
        related_name='shared_events',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date']

    def __str__(self):
        return f"{self.title} on {self.date}"