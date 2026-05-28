from django.urls import path

from .views import (
    CalendarEventDetailView,
    CalendarEventListCreateView,
    CalendarEventSeenView,
    CalendarEventUnseenCountView,
)

urlpatterns = [
    path('events', CalendarEventListCreateView.as_view(), name='calendar-events'),
    path('events/unseen-count', CalendarEventUnseenCountView.as_view(), name='calendar-events-unseen-count'),
    path('events/<int:pk>', CalendarEventDetailView.as_view(), name='calendar-event-detail'),
    path('events/<int:pk>/seen', CalendarEventSeenView.as_view(), name='calendar-event-seen'),
]
