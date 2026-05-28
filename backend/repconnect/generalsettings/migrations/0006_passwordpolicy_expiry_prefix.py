from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ("generalsettings", "0005_employmenttype_position"),
    ]

    operations = [
        migrations.AddField(
            model_name="passwordpolicy",
            name="default_password_prefix",
            field=models.CharField(
                default="Repco_",
                help_text="Prefix used when generating default passwords (e.g., Repco_{id number}).",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="passwordpolicy",
            name="password_expiry_days",
            field=models.PositiveSmallIntegerField(
                default=90,
                help_text="Number of days before user passwords expire.",
                validators=[
                    django.core.validators.MinValueValidator(1),
                    django.core.validators.MaxValueValidator(3650),
                ],
            ),
        ),
    ]
