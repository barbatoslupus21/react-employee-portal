from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('systemCalendar', '0006_eventparticipantseen'),
    ]

    operations = [
        migrations.AddField(
            model_name='calendarevent',
            name='member_scope',
            field=models.CharField(
                choices=[('all', 'All'), ('selected', 'Selected')],
                default='selected',
                max_length=10,
            ),
        ),
    ]
