import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('activityLog', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notification_type', models.CharField(
                    choices=[
                        ('prf_approved',    'PRF Request Approved'),
                        ('prf_disapproved', 'PRF Request Disapproved'),
                        ('prf_cancelled',   'PRF Request Cancelled'),
                    ],
                    db_index=True,
                    max_length=30,
                )),
                ('title',    models.CharField(max_length=255)),
                ('message',  models.TextField()),
                ('is_read',  models.BooleanField(db_index=True, default=False)),
                ('related_prf_id',             models.IntegerField(blank=True, null=True)),
                ('related_prf_control_number', models.CharField(blank=True, max_length=20)),
                ('created_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('recipient', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notifications',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Notification',
                'verbose_name_plural': 'Notifications',
                'db_table': 'notifications',
                'ordering': ['-created_at'],
                'default_permissions': (),
            },
        ),
    ]
