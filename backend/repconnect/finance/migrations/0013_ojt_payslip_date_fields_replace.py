from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0012_ojt_payslip_date_fields'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='ojtpayslipdata',
            name='cut_off',
        ),
        migrations.RemoveField(
            model_name='ojtpayslipdata',
            name='period_covered',
        ),
        migrations.AddField(
            model_name='ojtpayslipdata',
            name='period_start',
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='ojtpayslipdata',
            name='period_end',
            field=models.DateField(blank=True, null=True),
        ),
    ]
