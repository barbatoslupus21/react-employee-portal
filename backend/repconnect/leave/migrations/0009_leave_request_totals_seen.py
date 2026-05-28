from decimal import Decimal

from django.db import migrations, models


def backfill_leave_totals(apps, schema_editor):
    LeaveRequest = apps.get_model('leave', 'LeaveRequest')
    for req in LeaveRequest.objects.all().iterator():
        req.total_hours = req.hours
        req.total_days = Decimal(str(req.days_count)).quantize(Decimal('0.01'))
        req.save(update_fields=['total_hours', 'total_days'])


class Migration(migrations.Migration):

    dependencies = [
        ('leave', '0008_add_departments_to_leaveroutingrule'),
    ]

    operations = [
        migrations.AddField(
            model_name='leaverequest',
            name='seen',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='leaverequest',
            name='total_days',
            field=models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=6),
        ),
        migrations.AddField(
            model_name='leaverequest',
            name='total_hours',
            field=models.DecimalField(decimal_places=1, default=Decimal('0'), max_digits=6),
        ),
        migrations.RunPython(backfill_leave_totals, migrations.RunPython.noop),
    ]
