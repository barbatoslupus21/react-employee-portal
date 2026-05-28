"""URL patterns for the Employee Evaluation module."""
from django.urls import path

from employee_evaluation.views import (
    EvaluationSettingsView,
    ActivePeriodView,
    AdminPeriodListView,
    AdminPeriodDetailView,
    AdminPeriodResultsView,
    AdminPeriodToggleStatusView,
    AdminPeriodExportView,
    AdminEvaluationRoutingRuleListView,
    AdminEvaluationRoutingRuleDetailView,
    AdminEntryListView,
    AdminEntryDetailView,
    AdminChartView,
    AdminTasklistListView,
    AdminTasklistDetailView,
    AdminTasklistDeleteAllView,
    AdminTasklistValidateView,
    AdminTasklistImportView,
    AdminTasklistTemplateView,
    MyEvaluationView,
    MyEvaluationBadgeView,
    MyScoreSaveView,
    MySubmitView,
    MyConfirmView,
    MyTrainingRequestsView,
    ApproverQueueView,
    ApproverQueueBadgeView,
    ApproverEntryDetailView,
    SupervisorEvalSaveView,
    SupervisorEvalSubmitView,
    FinalApproverActionView,
    EmployeeStatsView,
    EvaluationTimelineView,
)

urlpatterns = [
    # ── Settings ─────────────────────────────────────────────────────────────
    path('settings', EvaluationSettingsView.as_view(), name='ee-settings'),
    # ── Active period (all authenticated users) ──────────────────────────────
    path('active-period', ActivePeriodView.as_view(), name='ee-active-period'),
    # ── Admin / HR — Periods ─────────────────────────────────────────────────
    path('admin/periods', AdminPeriodListView.as_view(), name='ee-admin-periods'),
    path('admin/routing-rules', AdminEvaluationRoutingRuleListView.as_view(), name='ee-admin-routing-rules'),
    path('admin/routing-rules/<int:pk>', AdminEvaluationRoutingRuleDetailView.as_view(), name='ee-admin-routing-rule-detail'),
    path('admin/periods/<int:pk>', AdminPeriodDetailView.as_view(), name='ee-admin-period-detail'),
    path('admin/periods/<int:pk>/results', AdminPeriodResultsView.as_view(), name='ee-admin-period-results'),
    path('admin/periods/<int:pk>/toggle-status', AdminPeriodToggleStatusView.as_view(), name='ee-admin-period-toggle'),
    path('admin/periods/<int:pk>/export', AdminPeriodExportView.as_view(), name='ee-admin-period-export'),

    # ── Admin / HR — Entries ─────────────────────────────────────────────────
    path('admin/entries', AdminEntryListView.as_view(), name='ee-admin-entries'),
    path('admin/entries/<int:entry_id>', AdminEntryDetailView.as_view(), name='ee-admin-entry-detail'),
    path('admin/chart',   AdminChartView.as_view(),     name='ee-admin-chart'),

    # ── Admin / HR — Tasklists ───────────────────────────────────────────────
    # Note: validate, import, and template must come before <user_id> to avoid mis-routing.
    path('admin/tasklists/delete-all', AdminTasklistDeleteAllView.as_view(), name='ee-admin-tasklist-delete-all'),
    path('admin/tasklists/validate', AdminTasklistValidateView.as_view(), name='ee-admin-tasklist-validate'),
    path('admin/tasklists/import', AdminTasklistImportView.as_view(), name='ee-admin-tasklist-import'),
    path('admin/tasklists/template', AdminTasklistTemplateView.as_view(), name='ee-admin-tasklist-template'),
    path('admin/tasklists', AdminTasklistListView.as_view(), name='ee-admin-tasklists'),
    path('admin/tasklists/<int:user_id>', AdminTasklistDetailView.as_view(), name='ee-admin-tasklist-detail'),

    # ── User (self-evaluation) ───────────────────────────────────────────────
    path('my', MyEvaluationView.as_view(), name='ee-my'),
    path('my/badge', MyEvaluationBadgeView.as_view(), name='ee-my-badge'),
    path('my/scores', MyScoreSaveView.as_view(), name='ee-my-scores'),
    path('my/submit', MySubmitView.as_view(), name='ee-my-submit'),
    path('my/training-requests', MyTrainingRequestsView.as_view(), name='ee-my-training-requests'),
    path('my/<int:entry_id>/confirm', MyConfirmView.as_view(), name='ee-my-confirm'),

    # ── Approver ─────────────────────────────────────────────────────────────
    path('approver/queue', ApproverQueueView.as_view(), name='ee-approver-queue'),
    path('approver/badge', ApproverQueueBadgeView.as_view(), name='ee-approver-badge'),
    path('approver/entries/<int:entry_id>', ApproverEntryDetailView.as_view(), name='ee-approver-entry'),
    path('approver/steps/<int:step_id>/eval/save', SupervisorEvalSaveView.as_view(), name='ee-approver-eval-save'),
    path('approver/steps/<int:step_id>/eval/submit', SupervisorEvalSubmitView.as_view(), name='ee-approver-eval-submit'),
    path('approver/steps/<int:step_id>/action', FinalApproverActionView.as_view(), name='ee-approver-action'),
    path('approver/entries/<int:entry_id>/stats', EmployeeStatsView.as_view(), name='ee-approver-entry-stats'),
    path('entries/<int:entry_id>/timeline', EvaluationTimelineView.as_view(), name='ee-entry-timeline'),
]
