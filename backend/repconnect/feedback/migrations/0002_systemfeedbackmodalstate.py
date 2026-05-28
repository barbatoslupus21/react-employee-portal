from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('feedback', '0001_initial'),
        ('userLogin', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='SystemFeedbackModalState',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.DateField(help_text='First day of the current calendar month.')),
                ('appearance_count', models.PositiveSmallIntegerField(default=0)),
                ('submitted', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('employee', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='feedback_modal_states', to='userLogin.logincredentials')),
            ],
            options={
                'db_table': 'system_feedback_modal_state',
                'unique_together': {('employee', 'month')},
            },
        ),
    ]
