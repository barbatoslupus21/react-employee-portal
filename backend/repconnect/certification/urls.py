from django.urls import path
from .views import (
    CertificateCategoryListView,
    CertificateUploadView,
    CertificateAdminListView,
    CertificateFiltersView,
    CertificateUserListView,
    CertificateDetailView,
    CertificateSendEmailView,
    CertificateMarkViewedView,
)

urlpatterns = [
    path('categories',             CertificateCategoryListView.as_view(), name='cert-categories'),
    path('my',                     CertificateUserListView.as_view(),     name='cert-user-list'),
    path('admin/upload',           CertificateUploadView.as_view(),       name='cert-admin-upload'),
    path('admin/list',             CertificateAdminListView.as_view(),    name='cert-admin-list'),
    path('admin/filters',          CertificateFiltersView.as_view(),      name='cert-admin-filters'),
    path('admin/<int:pk>',         CertificateDetailView.as_view(),       name='cert-detail'),
    path('<int:pk>/send-email',    CertificateSendEmailView.as_view(),    name='cert-send-email'),
    path('<int:pk>/mark-viewed',   CertificateMarkViewedView.as_view(),   name='cert-mark-viewed'),
]
