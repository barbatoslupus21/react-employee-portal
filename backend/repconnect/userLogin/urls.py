from django.urls import path

from .views import (
    CsrfCookieView,
    EmployeeAdminChartView,
    EmployeeAdminExportView,
    EmployeeAdminFilterOptionsView,
    EmployeeAdminImportView,
    EmployeeAdminListView,
    EmployeeAdminPasswordResetView,
    EmployeeAdminSnapshotTriggerView,
    EmployeeAdminStatusView,
    LoginView,
    LogoutView,
    MeView,
    TokenRefreshView,
    UserListView,
)

urlpatterns = [
    path('csrf',                              CsrfCookieView.as_view(),                      name='auth-csrf'),
    path('login',                             LoginView.as_view(),                            name='auth-login'),
    path('logout',                            LogoutView.as_view(),                           name='auth-logout'),
    path('token/refresh',                     TokenRefreshView.as_view(),                     name='auth-token-refresh'),
    path('me',                                MeView.as_view(),                               name='auth-me'),
    path('users',                             UserListView.as_view(),                         name='auth-users'),
    # Employee admin endpoints
    path('admin/employees',                   EmployeeAdminListView.as_view(),                name='auth-admin-employees'),
    path('admin/employees/chart',             EmployeeAdminChartView.as_view(),               name='auth-admin-employees-chart'),
    path('admin/employees/filters',           EmployeeAdminFilterOptionsView.as_view(),       name='auth-admin-employees-filters'),
    path('admin/employees/snapshot',          EmployeeAdminSnapshotTriggerView.as_view(),     name='auth-admin-employees-snapshot'),
    path('admin/employees/import',            EmployeeAdminImportView.as_view(),              name='auth-admin-employees-import'),
    path('admin/employees/export',            EmployeeAdminExportView.as_view(),              name='auth-admin-employees-export'),
    path('admin/employees/<int:pk>/status',   EmployeeAdminStatusView.as_view(),              name='auth-admin-employee-status'),
    path('admin/employees/<int:pk>/reset-password', EmployeeAdminPasswordResetView.as_view(), name='auth-admin-employee-reset-password'),
]
