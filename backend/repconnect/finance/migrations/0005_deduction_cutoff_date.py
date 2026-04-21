from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0004_loan_monthly_deduction'),
    ]

    operations = [
        migrations.AddField(
            model_name='deduction',
            name='cutoff_date',
            field=models.DateField(
                blank=True,
                db_index=True,
                help_text='Cut-off date for this deduction batch (required on bulk import).',
                null=True,
            ),
        ),
    ]
