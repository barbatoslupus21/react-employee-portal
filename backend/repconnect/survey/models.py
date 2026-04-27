"""Survey module models.

Priority matching for routing (if extended in future):
  - All model field lengths enforce max_length per security requirements.
  - No raw SQL — ORM only.
  - select_for_update() used on SurveyResponse to prevent double-submit.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


# ── Question type choices ─────────────────────────────────────────────────────
QUESTION_TYPE_CHOICES = [
    ('single_choice',   'Single Choice'),
    ('multiple_choice', 'Multiple Choice'),
    ('dropdown',        'Dropdown'),
    ('rating',          'Rating Scale'),
    ('likert',          'Likert Scale'),
    ('short_text',      'Short Text'),
    ('long_text',       'Long Text'),
    ('yes_no',          'Yes / No'),
    ('number',          'Number'),
    ('date',            'Date'),
    ('linear_scale',    'Linear Scale'),
    ('section',         'Section'),
    ('subsection',      'Subsection'),
    ('statement',       'Statement'),
]

# Types that support predefined options
CHOICE_BASED_TYPES = {'single_choice', 'multiple_choice', 'dropdown'}

# Types that support allow_other
ALLOW_OTHER_TYPES = {'single_choice', 'multiple_choice', 'dropdown'}

TEMPLATE_TYPE_CHOICES = [
    ('Leadership Alignment', 'Leadership Alignment'),
    ('Engagement', 'Engagement'),
    ('Effectiveness', 'Effectiveness'),
    ('Experience', 'Experience'),
    ('Onboarding', 'Onboarding'),
]


class Survey(models.Model):
    """Core survey record owned by an admin/HR/IAD user."""

    STATUS_DRAFT  = 'draft'
    STATUS_ACTIVE = 'active'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_DRAFT,  'Draft'),
        (STATUS_ACTIVE, 'Active'),
        (STATUS_CLOSED, 'Closed'),
    ]

    TARGET_ALL      = 'all_users'
    TARGET_SPECIFIC = 'specific_users'
    TARGET_CHOICES  = [
        (TARGET_ALL,      'All Users'),
        (TARGET_SPECIFIC, 'Specific Users'),
    ]

    title       = models.CharField(max_length=200, db_index=True)
    description = models.TextField(max_length=1000, blank=True, default='')
    status      = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True
    )
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_surveys',
    )
    is_anonymous = models.BooleanField(default=False)
    start_date   = models.DateField(null=True, blank=True)
    end_date     = models.DateField(null=True, blank=True)
    target_type  = models.CharField(
        max_length=15, choices=TARGET_CHOICES, default=TARGET_ALL
    )
    template_type = models.CharField(
        max_length=50,
        choices=TEMPLATE_TYPE_CHOICES,
        blank=True,
        default='',
        db_index=True,
    )
    created_at  = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'survey_surveys'
        ordering = ['-created_at']
        verbose_name = 'Survey'
        verbose_name_plural = 'Surveys'

    def __str__(self) -> str:
        return f'{self.title} [{self.get_status_display()}]'

    @property
    def is_editable(self) -> bool:
        """Options and questions may only be changed while status is Draft."""
        return self.status == self.STATUS_DRAFT


class SurveyTargetUser(models.Model):
    """Links a Survey to a specific user when target_type = specific_users."""

    survey = models.ForeignKey(
        Survey, on_delete=models.CASCADE, related_name='target_users'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='survey_targets',
    )

    class Meta:
        db_table = 'survey_target_users'
        unique_together = ('survey', 'user')
        verbose_name = 'Survey Target User'
        verbose_name_plural = 'Survey Target Users'

    def __str__(self) -> str:
        return f'{self.survey_id} → {self.user_id}'


class SurveyTemplate(models.Model):
    """Reusable question set that can be used to pre-populate a new Survey."""

    TEMPLATE_TYPE_CHOICES = [
        ('Leadership Alignment', 'Leadership Alignment'),
        ('Engagement', 'Engagement'),
        ('Effectiveness', 'Effectiveness'),
        ('Experience', 'Experience'),
        ('Onboarding', 'Onboarding'),
    ]

    title         = models.CharField(max_length=200, db_index=True)
    description   = models.TextField(max_length=1000, blank=True, default='')
    template_type = models.CharField(
        max_length=50,
        choices=TEMPLATE_TYPE_CHOICES,
        blank=True,
        default='',
        db_index=True,
    )
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_survey_templates',
    )
    created_at  = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'survey_templates'
        ordering = ['-created_at']
        verbose_name = 'Survey Template'
        verbose_name_plural = 'Survey Templates'

    def __str__(self) -> str:
        return self.title


class SurveyQuestion(models.Model):
    """A single question belonging to a Survey OR a SurveyTemplate (not both).

    DB-level CheckConstraint enforces exactly one of survey / template is set.
    """

    survey   = models.ForeignKey(
        Survey,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='questions',
    )
    template = models.ForeignKey(
        SurveyTemplate,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='questions',
    )

    question_text          = models.CharField(max_length=1000)
    question_type          = models.CharField(
        max_length=20, choices=QUESTION_TYPE_CHOICES, default='short_text'
    )
    order                  = models.PositiveIntegerField(default=0)
    is_required            = models.BooleanField(default=True)
    show_percentage_summary = models.BooleanField(default=False)
    allow_other            = models.BooleanField(default=False)

    class Meta:
        db_table = 'survey_questions'
        ordering = ['order']
        verbose_name = 'Survey Question'
        verbose_name_plural = 'Survey Questions'
        constraints = [
            models.CheckConstraint(
                # Exactly one FK must be non-null:
                # (survey_id IS NOT NULL) XOR (template_id IS NOT NULL)
                condition=(
                    models.Q(survey__isnull=False, template__isnull=True) |
                    models.Q(survey__isnull=True,  template__isnull=False)
                ),
                name='survey_question_exactly_one_parent',
            )
        ]

    def __str__(self) -> str:
        parent = f'Survey#{self.survey_id}' if self.survey_id else f'Template#{self.template_id}'
        return f'[{parent}] Q{self.order}: {self.question_text[:60]}'


class SurveyQuestionOption(models.Model):
    """A predefined selectable option for choice-based question types."""

    question   = models.ForeignKey(
        SurveyQuestion, on_delete=models.CASCADE, related_name='options'
    )
    option_text = models.CharField(max_length=500)
    order       = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'survey_question_options'
        ordering = ['order']
        verbose_name = 'Question Option'
        verbose_name_plural = 'Question Options'

    def __str__(self) -> str:
        return f'Q#{self.question_id} – {self.option_text[:60]}'


class SurveyQuestionRatingConfig(models.Model):
    """Min/max configuration for Rating Scale questions. Auto-created via signal."""

    question  = models.OneToOneField(
        SurveyQuestion,
        on_delete=models.CASCADE,
        related_name='rating_config',
    )
    min_value = models.PositiveSmallIntegerField(default=1)
    max_value = models.PositiveSmallIntegerField(default=5)
    min_label = models.CharField(max_length=100, blank=True, default='')
    max_label = models.CharField(max_length=100, blank=True, default='')

    class Meta:
        db_table = 'survey_question_rating_configs'
        verbose_name = 'Rating Config'
        verbose_name_plural = 'Rating Configs'

    def __str__(self) -> str:
        return f'Q#{self.question_id} Rating {self.min_value}–{self.max_value}'


class SurveyResponse(models.Model):
    """One record per user per survey. Created on first answer, completed on submit."""

    survey   = models.ForeignKey(
        Survey, on_delete=models.CASCADE, related_name='responses'
    )
    # Null when the survey is anonymous.
    employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='survey_responses',
    )
    started_at   = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_complete  = models.BooleanField(default=False, db_index=True)

    class Meta:
        db_table = 'survey_responses'
        ordering = ['-submitted_at']
        # Prevents double-submit at DB level (R1 safeguard).
        unique_together = ('survey', 'employee')
        verbose_name = 'Survey Response'
        verbose_name_plural = 'Survey Responses'

    def __str__(self) -> str:
        return f'Response#{self.pk} survey={self.survey_id} emp={self.employee_id}'


class SurveyAnswer(models.Model):
    """One answer record per question per SurveyResponse."""

    response        = models.ForeignKey(
        SurveyResponse, on_delete=models.CASCADE, related_name='answers'
    )
    question        = models.ForeignKey(
        SurveyQuestion, on_delete=models.CASCADE, related_name='answers'
    )
    # Populated depending on question type:
    text_value      = models.TextField(max_length=5000, blank=True, default='')
    number_value    = models.FloatField(null=True, blank=True)
    selected_options = models.ManyToManyField(
        SurveyQuestionOption,
        blank=True,
        related_name='answers',
    )
    # Free-text when the respondent selects the "Other" option.
    other_text      = models.CharField(max_length=500, blank=True, default='')

    class Meta:
        db_table = 'survey_answers'
        unique_together = ('response', 'question')
        verbose_name = 'Survey Answer'
        verbose_name_plural = 'Survey Answers'

    def __str__(self) -> str:
        return f'Answer#{self.pk} response={self.response_id} q={self.question_id}'
