from django.contrib import admin

from .models import CalendarEvent, Timelogs

@admin.register(Timelogs)
class TimelogsAdmin(admin.ModelAdmin):
    list_display  = ['employee', 'time', 'entry']
    list_filter   = ['entry']
    search_fields = ['employee__idnumber']


@admin.register(CalendarEvent)
class CalendarEventAdmin(admin.ModelAdmin):
    list_display   = ['title', 'date', 'event_type', 'owner']
    list_filter    = ['event_type', 'date']
    search_fields  = ['title', 'owner__idnumber']
    raw_id_fields  = ['owner']
    filter_horizontal = ['members']
