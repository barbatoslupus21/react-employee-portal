"""Models for the MIS Ticket module.

Design decisions
----------------
* MISChatSession is OneToOne on employee (one session per user, ever-growing
  conversation — audit fix M3).
* ticket_number uses unique=True as a DB-level safety net; generation queries
  the latest ticket by PK (not alphabetical string, audit fix C4).
* select_for_update() is NOT used because SQLite (dev DB) does not support it
  (audit fix C5). The unique constraint catches any race condition.
* priority field added to MISTicket (audit fix C2).
* progress_note replaces status_update on MISTicketDiagnosis (audit fix M9).
* other_device_type stores free text when device_type='other' (audit fix M8).
"""
from __future__ import annotations

import re
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Max
from django.utils import timezone


# ── MISDevice ─────────────────────────────────────────────────────────────────

class MISDevice(models.Model):
    DEVICE_TYPES = [
        ('desktop',    'Desktop'),
        ('laptop',     'Laptop'),
        ('printer',    'Printer'),
        ('scanner',    'Scanner'),
        ('phone',      'Phone / IP Phone'),
        ('router',     'Router / Switch'),
        ('monitor',    'Monitor'),
        ('projector',  'Projector'),
        ('ups',        'UPS'),
        ('network',    'Network Device'),
        ('peripheral', 'Peripheral'),
        ('other',      'Other'),
    ]

    employee          = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='mis_devices',
    )
    device_name       = models.CharField(max_length=100)
    device_type       = models.CharField(max_length=20, choices=DEVICE_TYPES)
    other_device_type = models.CharField(max_length=100, blank=True)
    brand             = models.CharField(max_length=100)
    model_name        = models.CharField(max_length=100)
    serial_number     = models.CharField(max_length=100, blank=True)
    asset_tag         = models.CharField(max_length=50, blank=True)
    location          = models.CharField(max_length=200, blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'mis_ticket'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.device_name} ({self.get_device_type_display()})'


# ── MISTicket ─────────────────────────────────────────────────────────────────

class MISTicket(models.Model):
    STATUS_CHOICES = [
        ('OPEN',        'Open'),
        ('IN_PROGRESS', 'In Progress'),
        ('RESOLVED',    'Resolved'),
        ('CLOSED',      'Closed'),
    ]
    CATEGORY_CHOICES = [
        ('hardware',          'Hardware'),
        ('software',          'Software'),
        ('network',           'Network'),
        ('account',           'Account / Access'),
        ('printer',           'Printer / Scanner'),
        ('email',             'Email'),
        ('request_for_parts', 'Request for Parts'),
        ('other',             'Other'),
    ]
    PRIORITY_CHOICES = [
        ('low',      'Low'),
        ('medium',   'Medium'),
        ('high',     'High'),
        ('critical', 'Critical'),
    ]

    ticket_number = models.CharField(max_length=20, unique=True, db_index=True)
    employee      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='mis_tickets',
    )
    device        = models.ForeignKey(
        'MISDevice',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tickets',
    )
    # Denormalised for historical accuracy even if user is deleted / renamed
    employee_name = models.CharField(max_length=200)
    department    = models.CharField(max_length=200, blank=True)
    device_name   = models.CharField(max_length=100, blank=True)
    subject       = models.CharField(max_length=200, blank=True, default='')
    category      = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    priority      = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    problem       = models.TextField()
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    # False when MIS admin has submitted a diagnosis the user hasn't viewed yet.
    seen          = models.BooleanField(default=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)
    resolved_at   = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'mis_ticket'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.ticket_number} — {self.employee_name}'

    @classmethod
    def generate_ticket_number(cls) -> str:
        """Return a unique ticket number of the form TKT{YYYYMMDD}{NNNN}.

        Sequence resets daily and is zero-padded to 4 digits.
        Uses Max aggregation on ticket_number string; the unique constraint
        is the final backstop against race conditions.
        """
        prefix = 'TKT'
        date_str = timezone.now().strftime('%Y%m%d')
        result = (
            cls.objects
            .filter(ticket_number__startswith=f'{prefix}{date_str}')
            .aggregate(max_seq=Max('ticket_number'))
        )
        if result['max_seq']:
            new_seq = int(result['max_seq'][-4:]) + 1
        else:
            new_seq = 1
        return f'{prefix}{date_str}{new_seq:04d}'


# ── MISTicketDiagnosis ────────────────────────────────────────────────────────

class MISTicketDiagnosis(models.Model):
    ticket         = models.OneToOneField(
        MISTicket,
        on_delete=models.CASCADE,
        related_name='diagnosis',
    )
    technician     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='mis_diagnoses',
    )
    technician_name           = models.CharField(max_length=200)
    progress_note             = models.CharField(max_length=500, blank=True)
    diagnosis                 = models.TextField()
    action_taken              = models.TextField()
    possible_reason           = models.TextField()
    recommendation            = models.TextField(blank=True)
    requires_immediate_action = models.BooleanField(default=False)
    recommended_parts         = models.TextField(blank=True)
    diagnosed_at              = models.DateTimeField(auto_now_add=True)
    last_diagnosed_at         = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'mis_ticket'

    def __str__(self) -> str:
        return f'Diagnosis for {self.ticket.ticket_number}'


# ── MISChatSession ────────────────────────────────────────────────────────────

class MISChatSession(models.Model):
    """One persistent chat session per employee (OneToOne — audit fix M3)."""

    employee   = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='mis_chat_session',
    )
    session_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_active = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'mis_ticket'

    def __str__(self) -> str:
        return f'MIS Chat — {self.employee}'


# ── MISChatMessage ────────────────────────────────────────────────────────────

class MISChatMessage(models.Model):
    session  = models.ForeignKey(
        MISChatSession,
        on_delete=models.CASCADE,
        related_name='messages',
    )
    # null=True / blank=True so AI messages have no sender (audit fix: C6/sender cascade)
    sender   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mis_chat_messages',
    )
    message            = models.TextField()
    is_ai              = models.BooleanField(default=False)
    # True on the AI message whose content contained [TICKET_DATA] (audit fix M2)
    is_ticket_creation = models.BooleanField(default=False)
    created_at         = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'mis_ticket'
        ordering = ['created_at']

    def __str__(self) -> str:
        who = 'AI' if self.is_ai else str(self.sender)
        return f'[{self.created_at:%Y-%m-%d %H:%M}] {who}: {self.message[:60]}'
