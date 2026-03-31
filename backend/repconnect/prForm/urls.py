from django.urls import path

from .views import (
    EmergencyLoanCreateView,
    PRFAdminChartView,
    PRFAdminExportView,
    PRFAdminListView,
    PRFAdminUpdateView,
    PRFMetaView,
    PRFRequestCancelView,
    PRFRequestDetailView,
    PRFRequestListCreateView,
)

urlpatterns = [
    path('requests',                        PRFRequestListCreateView.as_view(), name='prf-list-create'),
    path('requests/<int:pk>',               PRFRequestDetailView.as_view(),     name='prf-detail'),
    path('requests/<int:pk>/cancel',        PRFRequestCancelView.as_view(),     name='prf-cancel'),
    path('meta',                            PRFMetaView.as_view(),              name='prf-meta'),
    path('emergency-loan',                  EmergencyLoanCreateView.as_view(),  name='prf-emergency-loan'),
    # Admin
    path('admin/requests',                  PRFAdminListView.as_view(),         name='prf-admin-list'),
    path('admin/requests/<int:pk>',         PRFAdminUpdateView.as_view(),       name='prf-admin-update'),
    path('admin/chart',                     PRFAdminChartView.as_view(),        name='prf-admin-chart'),
    path('admin/export',                    PRFAdminExportView.as_view(),       name='prf-admin-export'),
]
