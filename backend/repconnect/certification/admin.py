from django.contrib import admin

from .models import Certificate, CertificateCategory


@admin.register(CertificateCategory)
class CertificateCategoryAdmin(admin.ModelAdmin):
    list_display  = ('name', 'icon_key')
    search_fields = ('name',)


@admin.register(Certificate)
class CertificateAdmin(admin.ModelAdmin):
    list_display   = ('employee', 'title', 'category', 'uploaded_by', 'created_at')
    list_filter    = ('category',)
    search_fields  = ('employee__idnumber', 'employee__firstname', 'employee__lastname', 'title')
    readonly_fields = ('created_at', 'updated_at', 'uploaded_by', 'original_filename')
    ordering       = ('-created_at',)
