from django.apps import AppConfig


class SurveyConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'survey'

    def ready(self):
        import survey.signals  # noqa: F401 — registers post_save signal
