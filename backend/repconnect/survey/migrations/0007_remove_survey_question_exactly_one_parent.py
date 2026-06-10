from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('survey', '0006_alter_surveyquestion_question_type'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='surveyquestion',
            name='survey_question_exactly_one_parent',
        ),
    ]
