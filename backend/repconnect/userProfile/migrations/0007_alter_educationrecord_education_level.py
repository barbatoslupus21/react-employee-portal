import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('userProfile', '0006_alter_personalinformation_gender'),
    ]

    operations = [
        migrations.AlterField(
            model_name='educationrecord',
            name='education_level',
            field=models.CharField(
                blank=True,
                choices=[
                    ('primary',   'Primary'),
                    ('secondary', 'Secondary'),
                    ('vocational', 'Vocational'),
                    ('tertiary',  'Tertiary'),
                    ('masteral',  'Masteral'),
                    ('doctorate', 'Doctorate'),
                ],
                default='',
                help_text='Education level for this record.',
                max_length=20,
                validators=[django.core.validators.RegexValidator(
                    message='Field contains invalid characters.',
                    regex='^[^<>{}\\[\\]\\\\|^~`"]*$',
                )],
            ),
        ),
    ]
