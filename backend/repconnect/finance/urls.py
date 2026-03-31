from django.urls import path

from .views import (
    FinanceChartView,
    FinanceEmployeeDetailView,
    FinanceEmployeeFilterOptionsView,
    FinanceEmployeeListView,
    FinanceExportView,
    FinanceImportView,
    FinancePayslipUploadView,
    FinanceTypeListView,
    OfficeFinanceRateView,
)

urlpatterns = [
    path('admin/types',           FinanceTypeListView.as_view(),       name='finance-types'),
    path('admin/chart',           FinanceChartView.as_view(),          name='finance-chart'),
    path('admin/employees',       FinanceEmployeeListView.as_view(),   name='finance-employees'),
    path('admin/employees/<str:idnumber>/records', FinanceEmployeeDetailView.as_view(), name='finance-employee-records'),
    path('admin/employee-filters', FinanceEmployeeFilterOptionsView.as_view(), name='finance-employee-filters'),
    path('admin/import',          FinanceImportView.as_view(),         name='finance-import'),
    path('admin/export',          FinanceExportView.as_view(),         name='finance-export'),
    path('admin/payslip-upload',  FinancePayslipUploadView.as_view(),  name='finance-payslip-upload'),
    path('admin/office-rates',    OfficeFinanceRateView.as_view(),     name='finance-office-rates'),
    path('admin/office-rates/<int:pk>', OfficeFinanceRateView.as_view(), name='finance-office-rates-detail'),
]
