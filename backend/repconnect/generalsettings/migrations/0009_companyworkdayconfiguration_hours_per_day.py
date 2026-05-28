from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('generalsettings', '0008_companyworkdayconfiguration'),
    ]

    operations = [
        migrations.AddField(
            model_name='companyworkdayconfiguration',
            name='hours_per_day',
            field=models.DecimalField(
                decimal_places=1,
                default=8,
                help_text='Configured number of working hours in one full leave day.',
                max_digits=4,
            ),
        ),
    ]
