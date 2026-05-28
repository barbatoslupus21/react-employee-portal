from django.urls import path

from . import views

urlpatterns = [
    path('settings', views.FeedbackSettingsView.as_view()),
    path('settings/', views.FeedbackSettingsView.as_view()),
    path('records', views.FeedbackRecordsView.as_view()),
    path('records/', views.FeedbackRecordsView.as_view()),
    path('status', views.FeedbackStatusView.as_view()),
    path('status/', views.FeedbackStatusView.as_view()),
    path('updates', views.SystemUpdatesView.as_view()),
    path('updates/', views.SystemUpdatesView.as_view()),
    path('updates/unseen', views.UnseenUpdatesView.as_view()),
    path('updates/unseen/', views.UnseenUpdatesView.as_view()),
    path('updates/seen', views.MarkUpdatesSeenView.as_view()),
    path('updates/seen/', views.MarkUpdatesSeenView.as_view()),
    path('updates/<int:pk>', views.SystemUpdateDetailView.as_view()),
    path('updates/<int:pk>/', views.SystemUpdateDetailView.as_view()),
]
