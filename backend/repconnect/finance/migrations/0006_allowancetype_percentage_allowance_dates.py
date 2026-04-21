from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0005_deduction_cutoff_date'),
    ]

    operations = [
        # Add percentage flag to AllowanceType
        migrations.AddField(
            model_name='allowancetype',
            name='percentage',
            field=models.BooleanField(
                default=False,
                help_text=(
                    'When enabled, the Amount in import files is treated as a percentage '
                    'rather than a fixed monetary value.'
                ),
            ),
        ),
        # Add deposited_date to Allowance
        migrations.AddField(
            model_name='allowance',
            name='deposited_date',
            field=models.DateField(
                blank=True,
                null=True,
                help_text='Date the allowance was deposited (MM/DD/YYYY in import files).',
            ),
        ),
        # Add covered_period to Allowance
        migrations.AddField(
            model_name='allowance',
            name='covered_period',
            field=models.CharField(
                blank=True,
                max_length=100,
                help_text='Free-text description of the period covered by this allowance.',
            ),
        ),
        # Relax amount validator from > 0 to >= 0 (percentage types may upload 0)
        migrations.AlterField(
            model_name='allowance',
            name='amount',
            field=models.DecimalField(
                decimal_places=2,
                max_digits=14,
                validators=[],
            ),
        ),
    ]
