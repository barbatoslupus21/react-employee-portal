from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0013_ojt_payslip_date_fields_replace'),
    ]

    operations = [
        migrations.AddField(
            model_name='ojtpayslipdata',
            name='sent',
            field=models.BooleanField(default=False, help_text='True once the OJT payslip has been sent to the employee via email.'),
        ),
    ]
