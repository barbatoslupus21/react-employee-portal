"""URL patterns for the Training Evaluation module."""
from django.urls import path
from training.views import (
    TrainingAdminListCreateView,
    TrainingAdminDetailView,
    TrainingAdminTemplatesView,
    TrainingAdminParticipantsView,
    TrainingAdminResultsView,
    TrainingAdminResponsesView,
    TrainingAdminResponseDetailView,
    TrainingAdminExportView,
    AdminTrainingEvaluationRoutingRuleListView,
    AdminTrainingEvaluationRoutingRuleDetailView,
    MyTrainingsView,
    TrainingDetailUserView,
    TrainingAnswerSaveView,
    TrainingSubmitView,
    UserConfirmView,
    ApproverQueueView,
    ApproverQueueBadgeView,
    ApproverSubmissionDetailView,
    SupervisorEvaluationSaveView,
    SupervisorEvaluationSubmitView,
    FinalApproverActionView,
)

urlpatterns = [
    # ── Admin / HR ──────────────────────────────────────────────────────────
    path('admin', TrainingAdminListCreateView.as_view(), name='training-admin-list-create'),
    path('admin/routing-rules', AdminTrainingEvaluationRoutingRuleListView.as_view(), name='training-admin-routing-rules'),
    path('admin/routing-rules/<int:pk>', AdminTrainingEvaluationRoutingRuleDetailView.as_view(), name='training-admin-routing-rule-detail'),
    path('admin/templates', TrainingAdminTemplatesView.as_view(), name='training-admin-templates'),
    # admin/responses/<id> must come before admin/<pk> to avoid mis-routing
    path('admin/responses/<int:submission_id>', TrainingAdminResponseDetailView.as_view(), name='training-admin-response-detail'),
    path('admin/<int:pk>', TrainingAdminDetailView.as_view(), name='training-admin-detail'),
    path('admin/<int:pk>/participants', TrainingAdminParticipantsView.as_view(), name='training-admin-participants'),
    path('admin/<int:pk>/results', TrainingAdminResultsView.as_view(), name='training-admin-results'),
    path('admin/<int:pk>/responses', TrainingAdminResponsesView.as_view(), name='training-admin-responses'),
    path('admin/<int:pk>/export', TrainingAdminExportView.as_view(), name='training-admin-export'),

    # ── User-facing ─────────────────────────────────────────────────────────
    path('my', MyTrainingsView.as_view(), name='training-my-list'),
    path('my/<int:pk>', TrainingDetailUserView.as_view(), name='training-my-detail'),
    path('my/<int:pk>/answer', TrainingAnswerSaveView.as_view(), name='training-my-answer'),
    path('my/<int:pk>/submit', TrainingSubmitView.as_view(), name='training-my-submit'),
    path('my/<int:pk>/confirm', UserConfirmView.as_view(), name='training-my-confirm'),

    # ── Approver-facing ─────────────────────────────────────────────────────
    path('approver/queue', ApproverQueueView.as_view(), name='training-approver-queue'),
    path('approver/badge', ApproverQueueBadgeView.as_view(), name='training-approver-badge'),
    path('approver/submissions/<int:submission_id>', ApproverSubmissionDetailView.as_view(), name='training-approver-submission'),
    path('approver/steps/<int:step_id>/eval/save', SupervisorEvaluationSaveView.as_view(), name='training-approver-eval-save'),
    path('approver/steps/<int:step_id>/eval/submit', SupervisorEvaluationSubmitView.as_view(), name='training-approver-eval-submit'),
    path('approver/steps/<int:step_id>/action', FinalApproverActionView.as_view(), name='training-approver-action'),
]
