# Generated manually - 2026

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def deduplicate_tasklists(apps, schema_editor):
    """
    Before enforcing one-tasklist-per-employee, delete duplicate tasklists keeping
    the most-recently-updated one per employee.
    """
    EmployeeTasklist = apps.get_model('employee_evaluation', 'EmployeeTasklist')
    seen = set()
    # Order by employee, then most-recently-updated first.
    for tl in EmployeeTasklist.objects.order_by('employee_id', '-updated_at'):
        if tl.employee_id in seen:
            tl.delete()
        else:
            seen.add(tl.employee_id)


class Migration(migrations.Migration):

    dependencies = [
        ('employee_evaluation', '0002_evaluationtrainingrequest'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Remove the old compound unique_together constraint first.
        migrations.AlterUniqueTogether(
            name='employeetasklist',
            unique_together=set(),
        ),
        # 2. Remove the evaluation_period FK.
        migrations.RemoveField(
            model_name='employeetasklist',
            name='evaluation_period',
        ),
        # 3. Deduplicate before enforcing per-employee uniqueness.
        migrations.RunPython(deduplicate_tasklists, migrations.RunPython.noop),
        # 4. Upgrade employee FK → OneToOneField (adds UNIQUE constraint on employee_id).
        migrations.AlterField(
            model_name='employeetasklist',
            name='employee',
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='evaluation_tasklists',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
