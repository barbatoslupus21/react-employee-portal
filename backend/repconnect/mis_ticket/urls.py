from django.urls import path

from .views import (
    AdminMISChartView,
    AdminMISDiagnoseView,
    AdminMISStatsView,
    AdminMISTicketDetailView,
    AdminMISTicketListView,
    AdminMISTicketPDFView,
    MISDeviceDetailView,
    MISDeviceListCreateView,
    MISDeviceSummaryView,
    MISTicketCancelView,
    MISTicketDetailView,
    MISTicketListView,
    MISTicketPDFView,
    MISUnseenCountView,
)

urlpatterns = [
    # Devices
    path('devices',            MISDeviceListCreateView.as_view()),
    path('devices/<int:pk>',   MISDeviceDetailView.as_view()),
    path('devices/<int:pk>/summary', MISDeviceSummaryView.as_view()),
    # Tickets (user) — unseen-count MUST come before <int:pk> to avoid type conflict
    path('tickets/unseen-count', MISUnseenCountView.as_view()),
    path('tickets',            MISTicketListView.as_view()),
    path('tickets/<int:pk>',   MISTicketDetailView.as_view()),
    path('tickets/<int:pk>/cancel', MISTicketCancelView.as_view()),
    path('tickets/<int:pk>/pdf', MISTicketPDFView.as_view()),
    # Admin
    path('admin/tickets',              AdminMISTicketListView.as_view()),
    path('admin/tickets/<int:pk>',     AdminMISTicketDetailView.as_view()),
    path('admin/tickets/<int:pk>/diagnose', AdminMISDiagnoseView.as_view()),
    path('admin/tickets/<int:pk>/pdf',  AdminMISTicketPDFView.as_view()),
    path('admin/stats',                AdminMISStatsView.as_view()),
    path('admin/chart',                AdminMISChartView.as_view()),
]
