from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('survey', '0007_remove_survey_question_exactly_one_parent'),
    ]

    operations = [
        migrations.AddField(
            model_name='survey',
            name='source_template',
            field=models.ForeignKey(
                blank=True,
                help_text='The template this survey was seeded from; used for live question sync.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='seeded_surveys',
                to='survey.surveytemplate',
            ),
        ),
    ]
