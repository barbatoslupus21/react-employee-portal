"""Training Evaluation module models.

Design decisions:
  - Training has a single training_date (not a start/end range like Survey).
  - Questions are deep-copied from a SurveyTemplate at creation time (independent copy).
  - User submissions and approver evaluations are stored in separate models to
    prevent aggregate double-counting.
  - Approval routing excludes Clinic, IAD, and HR — manager chain only.
  - select_for_update() used on TrainingSubmission to prevent concurrent approval races.
  - No raw SQL — ORM only.
"""
from __future__ import annotations

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

from survey.models import (
    QUESTION_TYPE_CHOICES,
    CHOICE_BASED_TYPES,
    ALLOW_OTHER_TYPES,
)

_NO_SPECIAL_CHARS = RegexValidator(
    regex=r'^[^<>{}\[\]\\|^~`"]*$',
    message='Field contains invalid characters.',
)


# ── Training record ────────────────────────────────────────────────────────────

class Training(models.Model):
    """Core training record created by admin/HR."""

    title          = models.CharField(max_length=200, db_index=True, validators=[_NO_SPECIAL_CHARS])
    speaker        = models.CharField(max_length=200, validators=[_NO_SPECIAL_CHARS])
    training_date  = models.DateField(db_index=True)
    objective      = models.TextField(max_length=1000, blank=True, default='', validators=[_NO_SPECIAL_CHARS])
    template       = models.ForeignKey(
        'survey.SurveyTemplate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='trainings',
        help_text='Survey template whose questions are deep-copied into this training.',
    )
    target_type    = models.CharField(
        max_length=15,
        choices=[('all_users', 'All Users'), ('specific_users', 'Specific Users')],
        default='all_users',
    )
    created_by     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_trainings',
    )
    created_at     = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'training_trainings'
        ordering = ['-training_date', '-created_at']
        verbose_name = 'Training'
        verbose_name_plural = 'Trainings'

    def __str__(self) -> str:
        return f'{self.title} ({self.training_date})'


# ── Training question (deep copy of template question) ────────────────────────

class TrainingQuestion(models.Model):
    """A question belonging to a Training — deep-copied from the template at creation."""

    training       = models.ForeignKey(Training, on_delete=models.CASCADE, related_name='questions')
    question_text  = models.CharField(max_length=1000)
    question_type  = models.CharField(max_length=20, choices=QUESTION_TYPE_CHOICES)
    order          = models.PositiveIntegerField(default=0)
    is_required    = models.BooleanField(default=True)
    allow_other    = models.BooleanField(default=False)

    class Meta:
        db_table = 'training_questions'
        ordering = ['order']

    def __str__(self) -> str:
        return f'[{self.training_id}] Q{self.order}: {self.question_text[:60]}'


class TrainingQuestionOption(models.Model):
    """Predefined option for a choice-based TrainingQuestion."""

    question   = models.ForeignKey(TrainingQuestion, on_delete=models.CASCADE, related_name='options')
    option_text = models.CharField(max_length=500)
    order       = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'training_question_options'
        ordering = ['order']


class TrainingQuestionRatingConfig(models.Model):
    """Rating scale configuration for a TrainingQuestion of type rating."""

    question  = models.OneToOneField(TrainingQuestion, on_delete=models.CASCADE, related_name='rating_config')
    min_value = models.PositiveSmallIntegerField(default=1)
    max_value = models.PositiveSmallIntegerField(default=5)
    min_label = models.CharField(max_length=100, blank=True)
    max_label = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = 'training_question_rating_configs'


# ── Participant ────────────────────────────────────────────────────────────────

class TrainingParticipant(models.Model):
    """Links a Training to a specific participant user."""

    training = models.ForeignKey(Training, on_delete=models.CASCADE, related_name='participants')
    user     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='training_participations',
    )
    is_seen  = models.BooleanField(default=False)

    class Meta:
        db_table = 'training_participants'
        unique_together = ('training', 'user')

    def __str__(self) -> str:
        return f'{self.training_id} → {self.user_id}'


# ── User submission ────────────────────────────────────────────────────────────

class TrainingSubmission(models.Model):
    """A user's evaluation submission for a training."""

    STATUS_PENDING                = 'pending'
    STATUS_SUPERVISOR_REVIEW     = 'supervisor_review'
    STATUS_USER_CONFIRMATION     = 'user_confirmation'
    STATUS_FINAL_APPROVAL        = 'final_approval'
    STATUS_SECOND_FINAL_APPROVAL = 'second_final_approval'
    STATUS_RETURNED              = 'returned'
    STATUS_COMPLETED             = 'completed'
    STATUS_DISAPPROVED           = 'disapproved'

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

    training      = models.ForeignKey(Training, on_delete=models.CASCADE, related_name='submissions')
    submitted_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='training_submissions',
    )
    is_complete   = models.BooleanField(default=False, db_index=True)
    submitted_at  = models.DateTimeField(null=True, blank=True)
    status        = models.CharField(max_length=25, choices=STATUS_CHOICES, default=STATUS_PENDING)
    confirmed_at  = models.DateTimeField(null=True, blank=True)
    confirmed_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='confirmed_training_submissions',
    )

    class Meta:
        db_table = 'training_submissions'
        unique_together = ('training', 'submitted_by')
        ordering = ['-submitted_at']

    def __str__(self) -> str:
        return f'{self.training_id} by {self.submitted_by_id} [{self.status}]'


class TrainingAnswer(models.Model):
    """A single answer to a TrainingQuestion by the participant (user)."""

    submission      = models.ForeignKey(TrainingSubmission, on_delete=models.CASCADE, related_name='answers')
    question        = models.ForeignKey(TrainingQuestion, on_delete=models.CASCADE, related_name='user_answers')
    text_value      = models.TextField(max_length=5000, blank=True)
    number_value    = models.FloatField(null=True, blank=True)
    selected_options = models.ManyToManyField(TrainingQuestionOption, blank=True, related_name='user_answers')
    other_text      = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = 'training_answers'
        unique_together = ('submission', 'question')


# ── Approval routing ───────────────────────────────────────────────────────────

class TrainingApprovalStep(models.Model):
    """One step in the sequential approval chain for a TrainingSubmission."""

    STATUS_CHOICES = [
        ('pending',  'Pending'),
        ('reviewed', 'Reviewed'),
        ('skipped',  'Skipped'),
    ]

    submission    = models.ForeignKey(TrainingSubmission, on_delete=models.CASCADE, related_name='approval_steps')
    approver      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='training_steps_as_approver',
    )
    sequence      = models.PositiveSmallIntegerField()
    status        = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    acted_at      = models.DateTimeField(null=True, blank=True)
    activated_at  = models.DateTimeField(null=True, blank=True)
    final_action  = models.CharField(max_length=12, null=True, blank=True)  # 'approved' | 'disapproved'
    final_remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'training_approval_steps'
        ordering = ['sequence']
        unique_together = ('submission', 'sequence')

    def __str__(self) -> str:
        return f'Submission {self.submission_id} Step {self.sequence} [{self.status}]'


# ── Supervisor evaluation (3 fixed fields per step) ───────────────────────────

class SupervisorEvaluation(models.Model):
    """The supervisor's structured evaluation for a specific approval step (sequence=1).

    Replaces the generic ApproverEvaluation+ApproverEvaluationAnswer models.
    Uses 3 fixed fields instead of dynamic question-answer pairs.
    """

    step             = models.OneToOneField(
        TrainingApprovalStep,
        on_delete=models.CASCADE,
        related_name='supervisor_evaluation',
    )
    result_and_impact  = models.TextField(max_length=2000, blank=True, default='')
    recommendation     = models.TextField(max_length=2000, blank=True, default='')
    overall_assessment = models.PositiveSmallIntegerField(null=True, blank=True)  # 1–5
    is_complete        = models.BooleanField(default=False)
    submitted_at       = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'training_supervisor_evaluations'

    def __str__(self) -> str:
        return f'SupervisorEval for step {self.step_id} [complete={self.is_complete}]'


# ── Evaluation Routing Rules ───────────────────────────────────────────────────

class EvaluationRoutingRule(models.Model):
    """Configurable approval routing rule for Training Evaluation and Employee Evaluation.

    Priority resolution (highest → lowest):
      1. Position + Department match (rule has both, requestor matches both)
      2. Position-only match (rule has positions, no departments → applies to all depts)
      3. Default fallback — no matching rule; single direct approver chain is used.

    Rules are module-scoped so Training and Employee Evaluation rules are fully independent.
    """

    MODULE_TRAINING_EVALUATION = 'training_evaluation'
    MODULE_EMPLOYEE_EVALUATION = 'employee_evaluation'

    MODULE_CHOICES = [
        ('training_evaluation', 'Training Evaluation'),
        ('employee_evaluation', 'Employee Evaluation'),
    ]

    is_active   = models.BooleanField(default=True)
    description = models.CharField(
        max_length=200,
        blank=True,
        help_text='Human-readable label for this rule, e.g. "Clerk / Line Leader route".',
    )
    module      = models.CharField(
        max_length=25,
        choices=MODULE_CHOICES,
        db_index=True,
        help_text='Which evaluation module this rule governs.',
    )
    positions   = models.ManyToManyField(
        'generalsettings.Position',
        blank=True,
        related_name='evaluation_routing_rules',
        help_text='Requestor positions this rule applies to.',
    )
    departments = models.ManyToManyField(
        'generalsettings.Department',
        blank=True,
        related_name='evaluation_routing_rules',
        help_text=(
            'Requestor departments this rule applies to. '
            'Leave empty to apply to the matched positions across ALL departments.'
        ),
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'training_evaluation_routing_rules'
        ordering = ['module', 'description']
        verbose_name = 'Evaluation Routing Rule'
        verbose_name_plural = 'Evaluation Routing Rules'

    def __str__(self) -> str:
        module_display = dict(self.MODULE_CHOICES).get(self.module, self.module)
        return f'[{module_display}] {self.description or "(no description)"}'

    def clean(self) -> None:
        """Prevent two active rules in the same module from creating an ambiguous match.

        Two rules are ambiguous when they share at least one position AND either rule
        has no departments (global scope) or they share at least one department.

        NOTE: M2M fields are not accessible before the first .save(), so this check is
        skipped on creation.  The admin's save_model override calls full_clean() again
        after saving M2M data to close that gap.
        """
        from django.core.exceptions import ValidationError

        if not self.pk:
            return  # M2M not yet populated — checked again post-save in admin

        other_active = (
            EvaluationRoutingRule.objects
            .filter(is_active=True, module=self.module)
            .exclude(pk=self.pk)
            .prefetch_related('positions', 'departments')
        )
        self_position_ids  = set(self.positions.values_list('id', flat=True))
        self_department_ids = set(self.departments.values_list('id', flat=True))

        for other in other_active:
            overlap_positions = self_position_ids & set(
                other.positions.values_list('id', flat=True)
            )
            if not overlap_positions:
                continue

            other_dept_ids = set(other.departments.values_list('id', flat=True))
            either_is_global = (not self_department_ids) or (not other_dept_ids)
            shared_depts = self_department_ids & other_dept_ids

            if either_is_global or shared_depts:
                pos_names = ', '.join(
                    self.positions.filter(id__in=overlap_positions)
                    .values_list('name', flat=True)
                )
                raise ValidationError(
                    f'Position(s) "{pos_names}" are already covered by active rule '
                    f'"{other.description or other.pk}" with an overlapping department scope. '
                    f'Edit that rule instead, or deactivate it first.'
                )


class EvaluationRoutingRuleStep(models.Model):
    """One ordered step within an EvaluationRoutingRule (maximum 3 steps per rule).

    At submission time the system walks the requestor's approver chain upward and
    resolves each step to the first chain member whose position matches any of the
    step's target_positions.  Traversal for the next step continues from directly
    after the resolved user — it does not restart from the requestor.
    """

    rule            = models.ForeignKey(
        EvaluationRoutingRule,
        on_delete=models.CASCADE,
        related_name='steps',
    )
    step_order      = models.PositiveSmallIntegerField(
        help_text='Execution order of this step within the rule (1 = first step, max 3).',
    )
    target_positions = models.ManyToManyField(
        'generalsettings.Position',
        blank=True,
        related_name='evaluation_routing_step_targets',
        help_text=(
            'The first chain member whose position is in this set becomes the approver '
            'for this step.'
        ),
    )

    class Meta:
        db_table = 'training_evaluation_routing_rule_steps'
        ordering = ['step_order']
        unique_together = [['rule', 'step_order']]
        verbose_name = 'Evaluation Routing Rule Step'
        verbose_name_plural = 'Evaluation Routing Rule Steps'

    def __str__(self) -> str:
        return f'{self.rule} – Step {self.step_order}'

    def clean(self) -> None:
        """Enforce maximum 3 steps per rule and prevent duplicate step_order values."""
        from django.core.exceptions import ValidationError

        if not self.rule_id:
            return

        # Enforce maximum 3 steps
        existing_count = (
            EvaluationRoutingRuleStep.objects
            .filter(rule_id=self.rule_id)
            .exclude(pk=self.pk if self.pk else 0)
            .count()
        )
        if existing_count >= 3:
            raise ValidationError(
                'A routing rule cannot have more than 3 steps. '
                'Remove an existing step before adding a new one.'
            )

        # Prevent duplicate step_order within the same rule
        if self.step_order is not None:
            duplicate = (
                EvaluationRoutingRuleStep.objects
                .filter(rule_id=self.rule_id, step_order=self.step_order)
                .exclude(pk=self.pk if self.pk else 0)
                .exists()
            )
            if duplicate:
                raise ValidationError(
                    f'Step order {self.step_order} already exists in this rule. '
                    'Each step must have a unique order number.'
                )
