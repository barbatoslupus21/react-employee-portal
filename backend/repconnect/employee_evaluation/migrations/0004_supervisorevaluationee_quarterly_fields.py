from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('employee_evaluation', '0003_remove_employeetasklist_evaluation_period'),
    ]

    operations = [
        # Remove old single-value fields
        migrations.RemoveField(model_name='supervisorevaluationee', name='strengths'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='weaknesses'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='training_required'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='supervisor_comments'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='employee_comments'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='cost_consciousness'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='cost_consciousness_comment'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='dependability'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='dependability_comment'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='communication'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='communication_comment'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='work_ethics'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='work_ethics_comment'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='attendance'),
        migrations.RemoveField(model_name='supervisorevaluationee', name='attendance_comment'),

        # Add per-quarter text fields
        migrations.AddField(model_name='supervisorevaluationee', name='strengths_q1', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='strengths_q2', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='strengths_q3', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='strengths_q4', field=models.TextField(blank=True, default='', max_length=2000)),

        migrations.AddField(model_name='supervisorevaluationee', name='weaknesses_q1', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='weaknesses_q2', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='weaknesses_q3', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='weaknesses_q4', field=models.TextField(blank=True, default='', max_length=2000)),

        migrations.AddField(model_name='supervisorevaluationee', name='training_required_q1', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='training_required_q2', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='training_required_q3', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='training_required_q4', field=models.TextField(blank=True, default='', max_length=2000)),

        migrations.AddField(model_name='supervisorevaluationee', name='supervisor_comments_q1', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='supervisor_comments_q2', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='supervisor_comments_q3', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='supervisor_comments_q4', field=models.TextField(blank=True, default='', max_length=2000)),

        migrations.AddField(model_name='supervisorevaluationee', name='employee_comments_q1', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='employee_comments_q2', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='employee_comments_q3', field=models.TextField(blank=True, default='', max_length=2000)),
        migrations.AddField(model_name='supervisorevaluationee', name='employee_comments_q4', field=models.TextField(blank=True, default='', max_length=2000)),

        # Add per-quarter rating fields
        migrations.AddField(model_name='supervisorevaluationee', name='cost_consciousness_q1', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='cost_consciousness_q2', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='cost_consciousness_q3', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='cost_consciousness_q4', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),

        migrations.AddField(model_name='supervisorevaluationee', name='dependability_q1', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='dependability_q2', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='dependability_q3', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='dependability_q4', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),

        migrations.AddField(model_name='supervisorevaluationee', name='communication_q1', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='communication_q2', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='communication_q3', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='communication_q4', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),

        migrations.AddField(model_name='supervisorevaluationee', name='work_ethics_q1', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='work_ethics_q2', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='work_ethics_q3', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='work_ethics_q4', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),

        migrations.AddField(model_name='supervisorevaluationee', name='attendance_q1', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='attendance_q2', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='attendance_q3', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
        migrations.AddField(model_name='supervisorevaluationee', name='attendance_q4', field=models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
    ]
