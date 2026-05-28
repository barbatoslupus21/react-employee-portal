import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("generalsettings", "0006_passwordpolicy_expiry_prefix"),
    ]

    operations = [
        migrations.AddField(
            model_name="passwordpolicy",
            name="enable_account_lockout",
            field=models.BooleanField(
                default=True,
                help_text="Enable automatic account lockout after repeated failed login attempts.",
            ),
        ),
        migrations.AddField(
            model_name="passwordpolicy",
            name="max_failed_login_attempts",
            field=models.PositiveSmallIntegerField(
                default=5,
                help_text="Maximum failed login attempts before account lockout (1 - 20).",
                validators=[
                    django.core.validators.MinValueValidator(1),
                    django.core.validators.MaxValueValidator(20),
                ],
            ),
        ),
    ]
