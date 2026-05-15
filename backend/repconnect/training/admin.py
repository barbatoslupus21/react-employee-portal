from django.contrib import admin
from django.core.exceptions import ValidationError
from django.utils.html import format_html

from training.models import (
    Training,
    TrainingQuestion,
    TrainingQuestionOption,
    TrainingQuestionRatingConfig,
    TrainingParticipant,
    TrainingSubmission,
    TrainingAnswer,
    TrainingApprovalStep,
    SupervisorEvaluation,
    EvaluationRoutingRule,
    EvaluationRoutingRuleStep,
)

admin.site.register(Training)
admin.site.register(TrainingQuestion)
admin.site.register(TrainingQuestionOption)
admin.site.register(TrainingQuestionRatingConfig)
admin.site.register(TrainingParticipant)
admin.site.register(TrainingSubmission)
admin.site.register(TrainingAnswer)
admin.site.register(TrainingApprovalStep)
admin.site.register(SupervisorEvaluation)


# ── EvaluationRoutingRule admin ────────────────────────────────────────────────

class EvaluationRoutingRuleStepInline(admin.TabularInline):
    """Inline editor for rule steps — max 3 per rule, enforced in clean() and here."""

    model = EvaluationRoutingRuleStep
    extra = 1
    max_num = 3
    min_num = 1
    fields = ('step_order', 'target_positions')
    filter_horizontal = ('target_positions',)

    def get_formset(self, request, obj=None, **kwargs):
        formset = super().get_formset(request, obj, **kwargs)
        formset.validate_max = True
        return formset


@admin.register(EvaluationRoutingRule)
class EvaluationRoutingRuleAdmin(admin.ModelAdmin):
    list_display  = (
        'description', 'module', 'positions_display', 'departments_display',
        'steps_count', 'is_active',
    )
    list_filter   = ('module', 'is_active', 'positions', 'departments')
    search_fields = ('description',)
    filter_horizontal = ('positions', 'departments')
    inlines       = [EvaluationRoutingRuleStepInline]
    list_editable = ('is_active',)

    # ── Display helpers ──────────────────────────────────────────────────────

    @admin.display(description='Positions')
    def positions_display(self, obj):
        names = list(obj.positions.values_list('name', flat=True))
        if not names:
            return '—'
        return ', '.join(names)

    @admin.display(description='Departments')
    def departments_display(self, obj):
        names = list(obj.departments.values_list('name', flat=True))
        if not names:
            return format_html('<em style="color:#999">All</em>')
        return ', '.join(names)

    @admin.display(description='Steps')
    def steps_count(self, obj):
        return obj.steps.count()

    # ── Conflict check post-M2M save ─────────────────────────────────────────

    def save_model(self, request, obj, form, change):
        """Save the rule first, then run full_clean() so M2M fields are accessible."""
        super().save_model(request, obj, form, change)

    def save_related(self, request, form, formsets, change):
        """After M2M data is saved, re-run clean() to catch position/department conflicts."""
        super().save_related(request, form, formsets, change)
        obj = form.instance
        try:
            obj.clean()
        except ValidationError as exc:
            # Surface the error as a non-field message on the change form.
            # The object is already saved at this point; we mark it inactive
            # to prevent the conflicting state from taking effect.
            self.message_user(
                request,
                f'Conflict detected and rule deactivated: {"; ".join(exc.messages)}',
                level='error',
            )
            obj.is_active = False
            obj.save(update_fields=['is_active'])
