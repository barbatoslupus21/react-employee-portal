from django.db import migrations, models


def copy_leave_type_to_leave_types(apps, schema_editor):
    LeaveReason = apps.get_model('leave', 'LeaveReason')
    for reason in LeaveReason.objects.all():
        leave_type_id = getattr(reason, 'leave_type_id', None)
        if leave_type_id:
            reason.leave_types.add(leave_type_id)


class Migration(migrations.Migration):

    dependencies = [
        ('leave', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='leavereason',
            name='leave_types',
            field=models.ManyToManyField(blank=True, related_name='reasons', to='leave.LeaveType'),
        ),
        migrations.RunPython(copy_leave_type_to_leave_types, reverse_code=migrations.RunPython.noop),
    ]
