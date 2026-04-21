from django.db import migrations, models
import django.core.validators
import decimal


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0003_add_color_to_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='loan',
            name='monthly_deduction',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text='Expected monthly deduction amount (optional).',
                max_digits=14,
                null=True,
                validators=[django.core.validators.MinValueValidator(decimal.Decimal('0'))],
            ),
        ),
    ]
