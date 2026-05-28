from django.contrib import admin

from .models import FeedbackSettings, SystemFeedback, SystemUpdate, SystemUpdateSeen, UpdateSettings


@admin.register(FeedbackSettings)
class FeedbackSettingsAdmin(admin.ModelAdmin):
    list_display = ('enabled',)


@admin.register(SystemFeedback)
class SystemFeedbackAdmin(admin.ModelAdmin):
    list_display = ('employee', 'rating', 'submitted_at')
    list_filter = ('rating',)
    search_fields = ('employee__firstname', 'employee__lastname')
    readonly_fields = ('submitted_at',)


@admin.register(UpdateSettings)
class UpdateSettingsAdmin(admin.ModelAdmin):
    list_display = ('enabled',)


@admin.register(SystemUpdate)
class SystemUpdateAdmin(admin.ModelAdmin):
    list_display = ('version', 'created_at', 'updated_at')
    search_fields = ('version', 'description')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(SystemUpdateSeen)
class SystemUpdateSeenAdmin(admin.ModelAdmin):
    list_display = ('employee', 'update', 'seen_at')
    readonly_fields = ('seen_at',)
