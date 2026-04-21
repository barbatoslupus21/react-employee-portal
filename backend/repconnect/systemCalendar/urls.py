from django.urls import path

from .views import CalendarEventDetailView, CalendarEventListCreateView

urlpatterns = [
    path('events', CalendarEventListCreateView.as_view(), name='calendar-events'),
    path('events/<int:pk>', CalendarEventDetailView.as_view(), name='calendar-event-detail'),
]
