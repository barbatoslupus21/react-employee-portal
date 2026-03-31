from django.urls import path

from .views import CsrfCookieView, LoginView, LogoutView, MeView, TokenRefreshView, UserListView

urlpatterns = [
    path('csrf', CsrfCookieView.as_view(), name='auth-csrf'),
    path('login', LoginView.as_view(), name='auth-login'),
    path('logout', LogoutView.as_view(), name='auth-logout'),
    path('token/refresh', TokenRefreshView.as_view(), name='auth-token-refresh'),
    path('me', MeView.as_view(), name='auth-me'),
    path('users', UserListView.as_view(), name='auth-users'),
]
