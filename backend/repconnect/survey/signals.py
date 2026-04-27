"""Survey post_save signals."""
from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from survey.models import SurveyQuestion, SurveyQuestionRatingConfig


@receiver(post_save, sender=SurveyQuestion)
def auto_create_rating_config(
    sender: type[SurveyQuestion],
    instance: SurveyQuestion,
    created: bool,
    **kwargs,
) -> None:
    """Auto-create a default RatingConfig whenever a rating-type question is saved.

    R10 safeguard: guarantees the config always exists so the frontend never
    crashes reading min/max values.
    """
    if instance.question_type == 'rating':
        SurveyQuestionRatingConfig.objects.get_or_create(
            question=instance,
            defaults={'min_value': 1, 'max_value': 5},
        )
