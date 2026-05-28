from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0009_payslip_sent'),
    ]

    operations = [
        migrations.AddField(
            model_name='loan',
            name='seen',
            field=models.BooleanField(
                default=False,
                help_text='False until the employee views this loan on the finance page.',
            ),
        ),
    ]
