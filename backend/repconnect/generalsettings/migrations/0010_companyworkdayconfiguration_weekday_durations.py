from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('generalsettings', '0009_companyworkdayconfiguration_hours_per_day'),
    ]

    operations = [
        migrations.AddField(
            model_name='companyworkdayconfiguration',
            name='weekday_durations',
            field=models.JSONField(blank=True, default=dict, help_text='Optional per-weekday duration map using Python weekday numbers as keys (0=Mon ... 6=Sun).'),
        ),
    ]