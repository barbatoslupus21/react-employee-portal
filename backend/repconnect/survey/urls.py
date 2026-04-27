from django.urls import path

from survey import views

app_name = 'survey'

urlpatterns = [
    # ── Admin endpoints ───────────────────────────────────────────────────────
    # Survey CRUD
    path('admin/surveys',                   views.AdminSurveyListCreateView.as_view(),         name='admin-survey-list'),
    path('admin/surveys/<int:pk>',          views.AdminSurveyDetailView.as_view(),             name='admin-survey-detail'),
    path('admin/surveys/<int:pk>/status',   views.AdminSurveyStatusView.as_view(),             name='admin-survey-status'),

    # Questions
    path('admin/surveys/<int:survey_pk>/questions',          views.AdminQuestionListCreateView.as_view(),         name='admin-question-list'),
    path('admin/surveys/<int:survey_pk>/questions/reorder',  views.AdminQuestionReorderView.as_view(),            name='admin-question-reorder'),
    path('admin/templates/<int:template_pk>/questions',      views.AdminTemplateQuestionListCreateView.as_view(), name='admin-template-question-list'),
    path('admin/templates/<int:template_pk>/questions/reorder', views.AdminTemplateQuestionReorderView.as_view(),  name='admin-template-question-reorder'),
    path('admin/questions/<int:pk>',                         views.AdminQuestionDetailView.as_view(),             name='admin-question-detail'),
    path('admin/questions/<int:pk>/rating-config',           views.AdminQuestionRatingConfigView.as_view(),       name='admin-question-rating-config'),

    # Options
    path('admin/questions/<int:question_pk>/options',        views.AdminOptionListCreateView.as_view(),    name='admin-option-list'),
    path('admin/options/<int:pk>',                           views.AdminOptionDetailView.as_view(),        name='admin-option-detail'),

    # Templates
    path('admin/templates',                 views.AdminTemplateListCreateView.as_view(),        name='admin-template-list'),
    path('admin/templates/<int:pk>',        views.AdminTemplateDetailView.as_view(),            name='admin-template-detail'),
    path('admin/templates/<int:pk>/duplicate', views.AdminTemplateDuplicateView.as_view(),      name='admin-template-duplicate'),
    path('admin/surveys/from-template/<int:template_pk>', views.AdminSurveyFromTemplateView.as_view(), name='admin-survey-from-template'),

    # Results & Export
    path('admin/surveys/<int:pk>/results',  views.AdminSurveyResultsView.as_view(),            name='admin-survey-results'),
    path('admin/surveys/<int:pk>/export',   views.AdminSurveyExportView.as_view(),             name='admin-survey-export'),
    path('admin/surveys/<int:pk>/responses', views.AdminIndividualResponsesView.as_view(),     name='admin-survey-individual-responses'),
    path('admin/responses/<int:pk>',        views.AdminResponseDetailView.as_view(),           name='admin-response-detail'),

    # User search for specific_users picker
    path('admin/users',                     views.AdminUserSearchView.as_view(),                name='admin-user-search'),

    # ── Respondent endpoints ──────────────────────────────────────────────────
    path('my-surveys',                      views.MySurveysView.as_view(),                      name='my-surveys'),
    path('surveys/<int:pk>',                views.SurveyRespondentDetailView.as_view(),         name='survey-respondent-detail'),
    path('responses',                       views.ResponseCreateView.as_view(),                 name='response-create'),
    path('responses/<int:pk>',              views.ResponseDetailView.as_view(),                 name='response-detail'),
    path('responses/<int:pk>/answers/<int:question_pk>', views.AnswerUpsertView.as_view(),     name='answer-upsert'),
    path('responses/<int:pk>/submit',       views.ResponseSubmitView.as_view(),                 name='response-submit'),
]
