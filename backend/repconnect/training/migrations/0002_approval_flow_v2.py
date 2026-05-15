# Hand-written migration for Training Evaluation Approval Flow v2.
# Changes:
#   - TrainingSubmission.status: max_length 15→25, new STATUS_CHOICES (7 values)
#   - TrainingSubmission: add confirmed_at, confirmed_by
#   - TrainingApprovalStep: add final_action, final_remarks
#   - Drop ApproverEvaluationAnswer, ApproverEvaluation
#   - Create SupervisorEvaluation (3 fixed fields)
#   - Data migration: remap status='routing' → 'supervisor_review'

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def remap_routing_status(apps, schema_editor):
    """Remap old 'routing' status to new 'supervisor_review'."""
    TrainingSubmission = apps.get_model('training', 'TrainingSubmission')
    TrainingSubmission.objects.filter(status='routing').update(status='supervisor_review')


class Migration(migrations.Migration):

    dependencies = [
        ('training', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Widen status field and replace choices
        migrations.AlterField(
            model_name='trainingsubmission',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending',           'Pending'),
                    ('supervisor_review', 'Supervisor Review'),
                    ('user_confirmation', 'User Confirmation'),
                    ('final_approval',    'Final Approval'),
                    ('returned',          'Returned for Re-evaluation'),
                    ('completed',         'Completed'),
                    ('disapproved',       'Disapproved'),
                ],
                default='pending',
                max_length=25,
            ),
        ),

        # 2. Add confirmed_at + confirmed_by to TrainingSubmission
        migrations.AddField(
            model_name='trainingsubmission',
            name='confirmed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='trainingsubmission',
            name='confirmed_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='confirmed_training_submissions',
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        # 3. Add final_action + final_remarks to TrainingApprovalStep
        migrations.AddField(
            model_name='trainingapprovalstep',
            name='final_action',
            field=models.CharField(blank=True, max_length=12, null=True),
        ),
        migrations.AddField(
            model_name='trainingapprovalstep',
            name='final_remarks',
            field=models.TextField(blank=True, default=''),
        ),

        # 4. Drop ApproverEvaluationAnswer first (FK to ApproverEvaluation)
        migrations.DeleteModel(
            name='ApproverEvaluationAnswer',
        ),

        # 5. Drop ApproverEvaluation
        migrations.DeleteModel(
            name='ApproverEvaluation',
        ),

        # 6. Create SupervisorEvaluation
        migrations.CreateModel(
            name='SupervisorEvaluation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('result_and_impact', models.TextField(blank=True, default='', max_length=2000)),
                ('recommendation', models.TextField(blank=True, default='', max_length=2000)),
                ('overall_assessment', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('is_complete', models.BooleanField(default=False)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('step', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='supervisor_evaluation',
                    to='training.trainingapprovalstep',
                )),
            ],
            options={
                'db_table': 'training_supervisor_evaluations',
            },
        ),

        # 7. Data migration: remap 'routing' → 'supervisor_review'
        migrations.RunPython(remap_routing_status, migrations.RunPython.noop),
    ]
