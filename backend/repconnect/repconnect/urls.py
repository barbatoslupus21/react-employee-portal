from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

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
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
