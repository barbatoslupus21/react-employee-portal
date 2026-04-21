from django.db import migrations

CATEGORIES = [
    {'name': 'Safety & Hazard Awareness',        'icon_key': 'safety'},
    {'name': 'Quality Assurance & Control',      'icon_key': 'compliance'},
    {'name': 'Technical Skills & Equipment',     'icon_key': 'training'},
    {'name': 'Occupational Health & First Aid',  'icon_key': 'health'},
    {'name': 'Environmental Compliance',         'icon_key': 'safety'},
    {'name': 'Production & Operations',          'icon_key': 'performance'},
    {'name': 'Leadership & Supervision',         'icon_key': 'award'},
    {'name': 'Professional Development',         'icon_key': 'graduation'},
]


def seed_categories(apps, schema_editor):
    CertificateCategory = apps.get_model('certification', 'CertificateCategory')
    for cat in CATEGORIES:
        CertificateCategory.objects.get_or_create(
            name=cat['name'],
            defaults={'icon_key': cat['icon_key']},
        )


def reverse_categories(apps, schema_editor):
    CertificateCategory = apps.get_model('certification', 'CertificateCategory')
    for cat in CATEGORIES:
        CertificateCategory.objects.filter(name=cat['name']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('certification', '0002_certificateview'),
    ]

    operations = [
        migrations.RunPython(seed_categories, reverse_categories),
    ]
