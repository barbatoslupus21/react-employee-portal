from django.urls import path

from .views import NotificationListView, NotificationReadAllView, NotificationReadView

urlpatterns = [
    path('notifications/',              NotificationListView.as_view(),   name='notification-list'),
    path('notifications',               NotificationListView.as_view(),   name='notification-list-no-slash'),
    path('notifications/read-all/',     NotificationReadAllView.as_view(), name='notification-read-all'),
    path('notifications/read-all',      NotificationReadAllView.as_view(), name='notification-read-all-no-slash'),
    path('notifications/<int:pk>/read/', NotificationReadView.as_view(), name='notification-read'),
    path('notifications/<int:pk>/read',  NotificationReadView.as_view(), name='notification-read-no-slash'),
]
