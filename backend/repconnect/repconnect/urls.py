from django.contrib import admin
from django.urls import include, path, re_path

from feedback import views as feedback_views
from repconnect.media_views import ProtectedMediaView

urlpatterns = [
    path('admin', admin.site.urls),
    path('api/auth/', include('userLogin.urls')),
    path('api/calendar/', include('systemCalendar.urls')),
    path('api/timelogs/', include('systemCalendar.timelogs_urls')),
    path('api/general-settings/', include('generalsettings.urls')),
    path('api/user-profile/', include('userProfile.urls')),
    path('api/prform/', include('prForm.urls')),
    path('api/activitylog/', include('activityLog.urls')),
    path('api/certificates/', include('certification.urls')),
    path('api/finance/', include('finance.urls')),
    path('api/leave/', include('leave.urls')),
    path('api/survey/', include('survey.urls')),
    path('api/training/', include('training.urls')),
    path('api/employee-eval/', include('employee_evaluation.urls')),
    re_path(r'^api/announcements/?', include('announcement.urls')),
    path('api/mis/', include('mis_ticket.urls')),
    path('api/feedback/settings', feedback_views.FeedbackSettingsView.as_view()),
    path('api/feedback/settings/', feedback_views.FeedbackSettingsView.as_view()),
    path('api/feedback/', include('feedback.urls')),
    # Authenticated media serving — replaces the dev-only static() helper.
    # Payslips, certificates, and avatars are only accessible to logged-in users.
    re_path(r'^media/(?P<path>.+)$', ProtectedMediaView.as_view(), name='protected-media'),
]
