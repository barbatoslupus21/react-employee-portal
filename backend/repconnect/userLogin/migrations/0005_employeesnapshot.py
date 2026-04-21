import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('userLogin', '0004_avatar_default_null'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmployeeSnapshot',
            fields=[
                ('id',            models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('snapshot_date', models.DateField(db_index=True, unique=True)),
                ('total',         models.PositiveIntegerField(default=0)),
                ('regular',       models.PositiveIntegerField(default=0)),
                ('probationary',  models.PositiveIntegerField(default=0)),
                ('ojt',           models.PositiveIntegerField(default=0)),
                ('male',          models.PositiveIntegerField(default=0)),
                ('female',        models.PositiveIntegerField(default=0)),
                ('created_at',    models.DateTimeField(auto_now_add=True)),
                ('updated_at',    models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'employee_snapshots',
                'ordering': ['snapshot_date'],
            },
        ),
    ]
