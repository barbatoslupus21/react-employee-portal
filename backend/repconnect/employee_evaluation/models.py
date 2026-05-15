"""Models for the Employee Evaluation / Self Evaluation module.

Design decisions:
  - EvaluationSettings is a singleton — enforced by a sentinel unique field.
  - EvaluationPeriod.frequency is a snapshot of the settings at creation time;
    it is frozen once any EvaluationEntry exists for the period.
  - EmployeeTask is a normalized model (not a JSON field) so EvaluationScore
    can reference tasks via FK.
  - EvaluationScore.task_name is a denormalized snapshot (canonical display value);
    the task FK uses SET_NULL so that deleting a task does not cascade-delete scores.
  - EvaluationApprovalStep mirrors TrainingApprovalStep but is scoped to this module.
  - SupervisorEvaluationEE has 5 open-text fields + 5 integer ratings (1–5) +
    5 optional comment fields for the rating categories.
"""
from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


# ── Singleton sentinel ─────────────────────────────────────────────────────────

_SINGLETON_SENTINEL = 1  # value used for the unique sentinel field


# ── Settings (singleton) ───────────────────────────────────────────────────────

class EvaluationSettings(models.Model):
    """
    Global configuration for the Employee Evaluation module.
    Only one row is allowed — enforced by the sentinel unique field.
    """

    FREQ_QUARTERLY = 'quarterly'
    FREQ_MONTHLY   = 'monthly'

    FREQUENCY_CHOICES = [
        ('quarterly', 'Quarterly'),
        ('monthly',   'Monthly'),
    ]

    # Singleton guard — only one row with sentinel=1 can exist.
    sentinel  = models.PositiveSmallIntegerField(
        default=_SINGLETON_SENTINEL,
        unique=True,
        editable=False,
        help_text='Singleton lock — do not modify.',
    )
    frequency = models.CharField(
        max_length=12,
        choices=FREQUENCY_CHOICES,
        default=FREQ_QUARTERLY,
        help_text='How often evaluation periods are created within a fiscal year.',
    )

    class Meta:
        db_table     = 'employee_evaluation_settings'
        verbose_name = 'Evaluation Settings'
        verbose_name_plural = 'Evaluation Settings'

    def __str__(self) -> str:
        return f'Evaluation Settings [frequency={self.frequency}]'

    def save(self, *args, **kwargs):
        self.sentinel = _SINGLETON_SENTINEL
        super().save(*args, **kwargs)


# ── Evaluation Period ──────────────────────────────────────────────────────────

class EvaluationPeriod(models.Model):
    """
    A discrete evaluation window (e.g. FY 2025/2026 Q1).
    Fiscal year runs May 1 → April 30.
    The frequency field is a snapshot of EvaluationSettings.frequency at creation
    and is frozen once any EvaluationEntry exists.
    """

    STATUS_ACTIVE = 'active'
    STATUS_CLOSED = 'closed'

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('closed', 'Closed'),
    ]

    FREQUENCY_CHOICES = EvaluationSettings.FREQUENCY_CHOICES

    title       = models.CharField(max_length=100)
    fiscal_year = models.PositiveSmallIntegerField(
        unique=True,
        help_text='Starting year of the fiscal year (e.g. 2025 for FY 2025/2026).',
    )
    start_date  = models.DateField()
    end_date    = models.DateField()
    status      = models.CharField(
        max_length=8,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
        db_index=True,
    )
    frequency   = models.CharField(
        max_length=12,
        choices=FREQUENCY_CHOICES,
        help_text='Snapshot of frequency at period creation. Frozen after first entry.',
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'employee_evaluation_periods'
        ordering = ['-fiscal_year', '-start_date']

    def __str__(self) -> str:
        return f'{self.title} [{self.status}]'

    def save(self, *args, **kwargs):
        if self._state.adding:
            settings_obj = EvaluationSettings.objects.first()
            if not settings_obj:
                raise ValidationError(
                    'Create Evaluation Settings first before creating an evaluation period.'
                )
            # Frequency is a creation-time snapshot of the global settings.
            self.frequency = settings_obj.frequency
        super().save(*args, **kwargs)


# ── Employee Tasklist ──────────────────────────────────────────────────────────

class EmployeeTasklist(models.Model):
    """
    A global task list assigned to an employee, shared across all evaluation periods.
    One tasklist per employee. Excludes admin, hr, and accounting users (enforced at the API/admin layer).
    """

    employee   = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='evaluation_tasklists',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'employee_evaluation_tasklists'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'Tasklist: {self.employee_id}'


class EmployeeTask(models.Model):
    """One task row within an EmployeeTasklist."""

    tasklist = models.ForeignKey(
        EmployeeTasklist,
        on_delete=models.CASCADE,
        related_name='tasks',
    )
    name     = models.CharField(max_length=300)
    order    = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'employee_evaluation_tasks'
        ordering = ['order', 'pk']

    def __str__(self) -> str:
        return f'Task "{self.name}" (tasklist={self.tasklist_id})'


# ── Evaluation Entry ───────────────────────────────────────────────────────────

class EvaluationEntry(models.Model):
    """
    A single employee's evaluation submission for one period.
    Mirrors TrainingSubmission in status lifecycle.
    """

    STATUS_PENDING                = 'pending'
    STATUS_SUPERVISOR_REVIEW      = 'supervisor_review'
    STATUS_USER_CONFIRMATION      = 'user_confirmation'
    STATUS_FINAL_APPROVAL         = 'final_approval'
    STATUS_SECOND_FINAL_APPROVAL  = 'second_final_approval'
    STATUS_RETURNED               = 'returned'
    STATUS_COMPLETED              = 'completed'
    STATUS_DISAPPROVED            = 'disapproved'

    STATUS_CHOICES = [
        ('pending',                'Pending'),
        ('supervisor_review',      'Supervisor Review'),
        ('user_confirmation',      'User Confirmation'),
        ('final_approval',         'Final Approval'),
        ('second_final_approval',  'Second Final Approval'),
        ('returned',               'Returned for Re-evaluation'),
        ('completed',              'Completed'),
        ('disapproved',            'Disapproved'),
    ]

    employee          = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='evaluation_entries',
    )
    evaluation_period = models.ForeignKey(
        EvaluationPeriod,
        on_delete=models.CASCADE,
        related_name='entries',
    )
    status            = models.CharField(
        max_length=25,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )
    submitted_at      = models.DateTimeField(null=True, blank=True)
    confirmed_at      = models.DateTimeField(null=True, blank=True)
    confirmed_by      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='confirmed_evaluation_entries',
    )
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        db_table       = 'employee_evaluation_entries'
        unique_together = [('employee', 'evaluation_period')]
        ordering        = ['-created_at']

    def __str__(self) -> str:
        return f'Entry: {self.employee_id} / period {self.evaluation_period_id} [{self.status}]'


# ── Evaluation Score ───────────────────────────────────────────────────────────

class EvaluationScore(models.Model):
    """
    One score cell in the evaluation grid: (entry, task_name, period_label) → score.
    task_name is a denormalized snapshot so scores survive task edits/deletes.
    task FK uses SET_NULL to avoid cascade-deleting scores when a task is removed.
    """

    entry        = models.ForeignKey(
        EvaluationEntry,
        on_delete=models.CASCADE,
        related_name='scores',
    )
    task         = models.ForeignKey(
        EmployeeTask,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='scores',
    )
    task_name    = models.CharField(
        max_length=300,
        help_text='Snapshot of the task name at the time of scoring (canonical display).',
    )
    period_label = models.CharField(
        max_length=20,
        help_text='Column label: Q1/Q2/Q3/Q4, Jan/Feb/…, Wk1/Wk2/…, or fiscal year string.',
    )
    score        = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )

    class Meta:
        db_table       = 'employee_evaluation_scores'
        unique_together = [('entry', 'task_name', 'period_label')]
        ordering        = ['task_name', 'period_label']

    def __str__(self) -> str:
        return f'Score({self.entry_id}, "{self.task_name}", "{self.period_label}") = {self.score}'


# ── Approval Step ──────────────────────────────────────────────────────────────

class EvaluationApprovalStep(models.Model):
    """
    One step in the sequential approval chain for an EvaluationEntry.
    Mirrors TrainingApprovalStep exactly, scoped to this module.
    """

    STATUS_CHOICES = [
        ('pending',  'Pending'),
        ('reviewed', 'Reviewed'),
        ('skipped',  'Skipped'),
    ]

    entry        = models.ForeignKey(
        EvaluationEntry,
        on_delete=models.CASCADE,
        related_name='approval_steps',
    )
    approver     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='evaluation_steps_as_approver',
    )
    sequence     = models.PositiveSmallIntegerField()
    status       = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    acted_at     = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    final_action = models.CharField(max_length=12, null=True, blank=True)  # 'approved' | 'disapproved'
    final_remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table       = 'employee_evaluation_approval_steps'
        ordering        = ['sequence']
        unique_together = [('entry', 'sequence')]

    def __str__(self) -> str:
        return f'EvalStep: entry {self.entry_id} seq {self.sequence} [{self.status}]'


# ── Supervisor Evaluation (EE) ─────────────────────────────────────────────────

class SupervisorEvaluationEE(models.Model):
    """
    The supervisor's structured evaluation for EvaluationApprovalStep sequence=1.
    Contains 5 open-text fields × 4 quarters + 5 integer ratings (1–5) × 4 quarters.
    """

    step                  = models.OneToOneField(
        EvaluationApprovalStep,
        on_delete=models.CASCADE,
        related_name='supervisor_evaluation',
    )

    # ── Open-text fields (per quarter) ───────────────────────────────────────
    strengths_q1          = models.TextField(max_length=2000, blank=True, default='')
    strengths_q2          = models.TextField(max_length=2000, blank=True, default='')
    strengths_q3          = models.TextField(max_length=2000, blank=True, default='')
    strengths_q4          = models.TextField(max_length=2000, blank=True, default='')

    weaknesses_q1         = models.TextField(max_length=2000, blank=True, default='')
    weaknesses_q2         = models.TextField(max_length=2000, blank=True, default='')
    weaknesses_q3         = models.TextField(max_length=2000, blank=True, default='')
    weaknesses_q4         = models.TextField(max_length=2000, blank=True, default='')

    training_required_q1  = models.TextField(max_length=2000, blank=True, default='')
    training_required_q2  = models.TextField(max_length=2000, blank=True, default='')
    training_required_q3  = models.TextField(max_length=2000, blank=True, default='')
    training_required_q4  = models.TextField(max_length=2000, blank=True, default='')

    supervisor_comments_q1 = models.TextField(max_length=2000, blank=True, default='')
    supervisor_comments_q2 = models.TextField(max_length=2000, blank=True, default='')
    supervisor_comments_q3 = models.TextField(max_length=2000, blank=True, default='')
    supervisor_comments_q4 = models.TextField(max_length=2000, blank=True, default='')

    employee_comments_q1  = models.TextField(max_length=2000, blank=True, default='')
    employee_comments_q2  = models.TextField(max_length=2000, blank=True, default='')
    employee_comments_q3  = models.TextField(max_length=2000, blank=True, default='')
    employee_comments_q4  = models.TextField(max_length=2000, blank=True, default='')

    # ── Star ratings (1–5) per quarter ───────────────────────────────────────
    cost_consciousness_q1 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    cost_consciousness_q2 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    cost_consciousness_q3 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    cost_consciousness_q4 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )

    dependability_q1 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    dependability_q2 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    dependability_q3 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    dependability_q4 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )

    communication_q1 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    communication_q2 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    communication_q3 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    communication_q4 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )

    work_ethics_q1 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    work_ethics_q2 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    work_ethics_q3 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    work_ethics_q4 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )

    attendance_q1 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    attendance_q2 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    attendance_q3 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    attendance_q4 = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )

    quality_comments   = models.JSONField(default=dict, blank=True)
    supervisor_scores  = models.JSONField(default=dict, blank=True)

    is_complete   = models.BooleanField(default=False)
    submitted_at  = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'employee_evaluation_supervisor_evals'

    def __str__(self) -> str:
        return f'SupervisorEvalEE for step {self.step_id} [complete={self.is_complete}]'


# ── Evaluation Training Request ────────────────────────────────────────────────

# ── Evaluation Timeline (append-only audit log) ────────────────────────────────

class EvaluationTimelineEntry(models.Model):
    """
    Immutable audit log row written at every meaningful action in the evaluation
    lifecycle.  Records are never updated or deleted — new rows are appended for
    every event, including re-evaluations across multiple cycles.
    """

    ACTION_SUBMITTED    = 'submitted'
    ACTION_EVALUATED    = 'evaluated'
    ACTION_RE_EVALUATED = 're_evaluated'
    ACTION_APPROVED     = 'approved'
    ACTION_DISAPPROVED  = 'disapproved'
    ACTION_RETURNED     = 'returned'
    ACTION_COMPLETED    = 'completed'

    ACTION_CHOICES = [
        ('submitted',    'Submitted'),
        ('evaluated',    'Evaluated'),
        ('re_evaluated', 'Re-Evaluated'),
        ('approved',     'Approved'),
        ('disapproved',  'Disapproved'),
        ('returned',     'Returned for Revision'),
        ('completed',    'Completed'),
    ]

    entry       = models.ForeignKey(
        EvaluationEntry,
        on_delete=models.CASCADE,
        related_name='timeline_entries',
    )
    actor       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='evaluation_timeline_entries',
    )
    action_type = models.CharField(max_length=15, choices=ACTION_CHOICES, db_index=True)
    remarks     = models.TextField(blank=True, default='')
    acted_at    = models.DateTimeField(db_index=True)
    step_order  = models.PositiveSmallIntegerField(
        default=0,
        help_text='Sequence number of the approver step this action belongs to (0 = employee).',
    )

    class Meta:
        db_table = 'employee_evaluation_timeline'
        ordering = ['acted_at', 'id']

    def __str__(self) -> str:
        return f'Timeline: entry {self.entry_id} | {self.action_type} by {self.actor_id} @ {self.acted_at}'


# ── Evaluation Training Request ────────────────────────────────────────────────

class EvaluationTrainingRequest(models.Model):
    """
    A training request submitted by an employee for a specific quarter
    of their active evaluation period. One request is allowed per quarter.
    """

    QUARTER_CHOICES = [
        (1, 'Q1 (May–July)'),
        (2, 'Q2 (August–October)'),
        (3, 'Q3 (November–January)'),
        (4, 'Q4 (February–April)'),
    ]

    employee       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='evaluation_training_requests',
    )
    period         = models.ForeignKey(
        EvaluationPeriod,
        on_delete=models.CASCADE,
        related_name='training_requests',
    )
    quarter        = models.PositiveSmallIntegerField(choices=QUARTER_CHOICES)
    title          = models.CharField(max_length=200)
    objective      = models.TextField(max_length=1000, blank=True, default='')
    preferred_date = models.DateField(null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table        = 'employee_evaluation_training_requests'
        unique_together = [('employee', 'period', 'quarter')]
        ordering        = ['quarter']

    def __str__(self) -> str:
        return f'TrainingRequest Q{self.quarter} — employee {self.employee_id} / period {self.period_id}'
