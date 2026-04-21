from django.urls import path

from .views import (
    DepartmentListView,
    EmailConfigView,
    EmploymentTypeListView,
    LineListView,
    PasswordPolicyReadView,
    PositionListView,
)

urlpatterns = [
    path('email-config',      EmailConfigView.as_view(),       name='email-config'),
    path('password-policy',   PasswordPolicyReadView.as_view(), name='password-policy'),
    path('departments',       DepartmentListView.as_view(),     name='departments-list'),
    path('lines',             LineListView.as_view(),           name='lines-list'),
    path('positions',         PositionListView.as_view(),       name='positions-list'),
    path('employment-types',  EmploymentTypeListView.as_view(), name='employment-types-list'),
]

