from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('survey', '0003_add_template_type_to_survey'),
    ]

    operations = [
        migrations.AddField(
            model_name='surveyresponse',
            name='started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
