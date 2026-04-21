"""Add sent boolean field to Payslip."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0008_add_loan_settings'),
    ]

    operations = [
        migrations.AddField(
            model_name='payslip',
            name='sent',
            field=models.BooleanField(
                default=False,
                help_text='True once the payslip has been sent to the employee via email.',
            ),
        ),
    ]
