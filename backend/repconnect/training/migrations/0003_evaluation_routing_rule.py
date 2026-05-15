"""
Migration: add EvaluationRoutingRule + EvaluationRoutingRuleStep models
and extend TrainingSubmission.status choices with 'second_final_approval'.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('training', '0002_approval_flow_v2'),
        ('generalsettings', '0005_employmenttype_position'),
    ]

    operations = [
        # ── Extend TrainingSubmission.status choices (no DB schema change) ──
        migrations.AlterField(
            model_name='trainingsubmission',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending',               'Pending'),
                    ('supervisor_review',     'Supervisor Review'),
                    ('user_confirmation',     'User Confirmation'),
                    ('final_approval',        'Final Approval'),
                    ('second_final_approval', 'Second Final Approval'),
                    ('returned',              'Returned for Re-evaluation'),
                    ('completed',             'Completed'),
                    ('disapproved',           'Disapproved'),
                ],
                default='pending',
                max_length=25,
            ),
        ),

        # ── EvaluationRoutingRule ────────────────────────────────────────────
        migrations.CreateModel(
            name='EvaluationRoutingRule',
            fields=[
                ('id', models.AutoField(
                    auto_created=True, primary_key=True, serialize=False, verbose_name='ID',
                )),
                ('is_active',   models.BooleanField(default=True)),
                ('description', models.CharField(blank=True, max_length=200)),
                ('module',      models.CharField(
                    choices=[
                        ('training_evaluation', 'Training Evaluation'),
                        ('employee_evaluation', 'Employee Evaluation'),
                    ],
                    db_index=True,
                    max_length=25,
                )),
                ('created_at',  models.DateTimeField(auto_now_add=True)),
                ('updated_at',  models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name':        'Evaluation Routing Rule',
                'verbose_name_plural': 'Evaluation Routing Rules',
                'db_table':            'training_evaluation_routing_rules',
                'ordering':            ['module', 'description'],
            },
        ),
        migrations.AddField(
            model_name='evaluationroutingrule',
            name='positions',
            field=models.ManyToManyField(
                blank=True,
                related_name='evaluation_routing_rules',
                to='generalsettings.Position',
            ),
        ),
        migrations.AddField(
            model_name='evaluationroutingrule',
            name='departments',
            field=models.ManyToManyField(
                blank=True,
                related_name='evaluation_routing_rules',
                to='generalsettings.Department',
            ),
        ),

        # ── EvaluationRoutingRuleStep ────────────────────────────────────────
        migrations.CreateModel(
            name='EvaluationRoutingRuleStep',
            fields=[
                ('id', models.AutoField(
                    auto_created=True, primary_key=True, serialize=False, verbose_name='ID',
                )),
                ('rule', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='steps',
                    to='training.EvaluationRoutingRule',
                )),
                ('step_order', models.PositiveSmallIntegerField()),
            ],
            options={
                'verbose_name':        'Evaluation Routing Rule Step',
                'verbose_name_plural': 'Evaluation Routing Rule Steps',
                'db_table':            'training_evaluation_routing_rule_steps',
                'ordering':            ['step_order'],
            },
        ),
        migrations.AddField(
            model_name='evaluationroutingrulestep',
            name='target_positions',
            field=models.ManyToManyField(
                blank=True,
                related_name='evaluation_routing_step_targets',
                to='generalsettings.Position',
            ),
        ),
        migrations.AlterUniqueTogether(
            name='evaluationroutingrulestep',
            unique_together={('rule', 'step_order')},
        ),
    ]
