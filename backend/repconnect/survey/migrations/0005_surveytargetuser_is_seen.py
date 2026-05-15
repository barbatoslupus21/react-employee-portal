from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('survey', '0004_add_started_at_to_surveyresponse'),
    ]

    operations = [
        migrations.AddField(
            model_name='surveytargetuser',
            name='is_seen',
            field=models.BooleanField(default=False),
        ),
    ]
