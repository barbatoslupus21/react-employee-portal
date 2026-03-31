from django.urls import path

from .views import (
    TimelogsCompletenessView,
    TimelogsTemplateView,
    TimelogsUploadView,
    TimelogDailyStatusView,
    UserTimelogsView,
)

urlpatterns = [
    path('completeness',  TimelogsCompletenessView.as_view(),  name='timelogs-completeness'),
    path('template',      TimelogsTemplateView.as_view(),      name='timelogs-template'),
    path('upload',        TimelogsUploadView.as_view(),        name='timelogs-upload'),
    path('daily-status',  TimelogDailyStatusView.as_view(),    name='timelogs-daily-status'),
    path('user-logs',     UserTimelogsView.as_view(),          name='timelogs-user-logs'),
]
