"""Django admin for the Survey module.

Three registration groups as specified:
  Group 1 — Survey + SurveyTargetUser inline
  Group 2 — SurveyTemplate + SurveyQuestion (with Option & RatingConfig inlines)
  Group 3 — SurveyResponse + SurveyAnswer inline
"""
from django.contrib import admin

from survey.models import (
    Survey,
    SurveyAnswer,
    SurveyQuestion,
    SurveyQuestionOption,
    SurveyQuestionRatingConfig,
    SurveyResponse,
    SurveyTargetUser,
    SurveyTemplate,
)


# ─────────────────────────────────────────────────────────────────────────────
# Group 1: Survey + SurveyTargetUser inline
# ─────────────────────────────────────────────────────────────────────────────

class SurveyTargetUserInline(admin.TabularInline):
    model = SurveyTargetUser
    extra = 1
    autocomplete_fields = ['user']


@admin.register(Survey)
class SurveyAdmin(admin.ModelAdmin):
    list_display  = ('title', 'status', 'target_type', 'is_anonymous', 'created_by', 'start_date', 'end_date', 'created_at')
    list_filter   = ('status', 'target_type', 'is_anonymous')
    search_fields = ('title', 'description', 'created_by__idnumber')
    readonly_fields = ('created_at', 'updated_at', 'created_by')
    inlines       = [SurveyTargetUserInline]
    fieldsets     = (
        (None, {
            'fields': ('title', 'description', 'status', 'target_type', 'is_anonymous'),
        }),
        ('Schedule', {
            'fields': ('start_date', 'end_date'),
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


# ─────────────────────────────────────────────────────────────────────────────
# Group 2: SurveyTemplate + SurveyQuestion (with Option & RatingConfig inlines)
# ─────────────────────────────────────────────────────────────────────────────

class SurveyQuestionOptionInline(admin.TabularInline):
    model  = SurveyQuestionOption
    extra  = 2
    fields = ('option_text', 'order')


class SurveyQuestionRatingConfigInline(admin.StackedInline):
    model  = SurveyQuestionRatingConfig
    extra  = 0
    max_num = 1
    fields  = ('min_value', 'max_value', 'min_label', 'max_label')


class SurveyQuestionInline(admin.StackedInline):
    model   = SurveyQuestion
    extra   = 1
    fk_name = 'template'
    fields  = ('question_text', 'question_type', 'order', 'is_required', 'show_percentage_summary', 'allow_other')
    show_change_link = True


@admin.register(SurveyTemplate)
class SurveyTemplateAdmin(admin.ModelAdmin):
    list_display  = ('title', 'created_by', 'created_at')
    search_fields = ('title', 'description')
    readonly_fields = ('created_at', 'created_by')
    inlines = [SurveyQuestionInline]

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(SurveyQuestion)
class SurveyQuestionAdmin(admin.ModelAdmin):
    list_display  = ('question_text', 'question_type', 'survey', 'template', 'order', 'is_required')
    list_filter   = ('question_type', 'is_required', 'show_percentage_summary')
    search_fields = ('question_text',)
    inlines       = [SurveyQuestionOptionInline, SurveyQuestionRatingConfigInline]


# ─────────────────────────────────────────────────────────────────────────────
# Group 3: SurveyResponse + SurveyAnswer inline
# ─────────────────────────────────────────────────────────────────────────────

class SurveyAnswerInline(admin.TabularInline):
    model         = SurveyAnswer
    extra         = 0
    readonly_fields = ('question', 'text_value', 'number_value', 'other_text')
    can_delete    = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(SurveyResponse)
class SurveyResponseAdmin(admin.ModelAdmin):
    list_display  = ('survey', 'employee', 'is_complete', 'submitted_at')
    list_filter   = ('is_complete', 'survey')
    search_fields = ('employee__idnumber', 'survey__title')
    readonly_fields = ('survey', 'employee', 'submitted_at', 'is_complete')
    inlines       = [SurveyAnswerInline]

    def has_add_permission(self, request):
        return False
