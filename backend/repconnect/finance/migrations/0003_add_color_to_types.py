"""Add color field to AllowanceType, LoanType, SavingsType, PayslipType.
   Assigns palette colors to existing rows via a data migration.
"""
from django.db import migrations, models

# Ordered palette — 12 distinct, accessible colors
_PALETTE = [
    '#2845D6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
    '#06B6D4', '#84CC16', '#0EA5E9', '#A855F7',
]


def _assign_colors(apps, schema_editor):
    """Give every existing type row a palette color based on its pk order."""
    for model_name in ('AllowanceType', 'LoanType', 'SavingsType', 'PayslipType'):
        Model = apps.get_model('finance', model_name)
        for idx, obj in enumerate(Model.objects.order_by('id')):
            obj.color = _PALETTE[idx % len(_PALETTE)]
            obj.save(update_fields=['color'])


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0002_auto_2025'),
    ]

    operations = [
        # ── AddField ────────────────────────────────────────────────────────
        migrations.AddField(
            model_name='allowancetype',
            name='color',
            field=models.CharField(blank=True, default='', max_length=7),
        ),
        migrations.AddField(
            model_name='loantype',
            name='color',
            field=models.CharField(blank=True, default='', max_length=7),
        ),
        migrations.AddField(
            model_name='savingstype',
            name='color',
            field=models.CharField(blank=True, default='', max_length=7),
        ),
        migrations.AddField(
            model_name='paysliptype',
            name='color',
            field=models.CharField(blank=True, default='', max_length=7),
        ),
        # ── Data migration: assign palette colors to existing rows ───────────
        migrations.RunPython(_assign_colors, migrations.RunPython.noop),
    ]
