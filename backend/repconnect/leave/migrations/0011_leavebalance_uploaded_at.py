from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('leave', '0010_leavebalance_created_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='leavebalance',
            name='uploaded_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
