from django.urls import path
from .views import EmailConfigView

urlpatterns = [
    path('email-config', EmailConfigView.as_view(), name='email-config'),
]
