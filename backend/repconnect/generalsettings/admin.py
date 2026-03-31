from django.contrib import admin

from .models import Department, EmailConfiguration, Line, Office, PasswordPolicy, Shift


# ── Shift ──────────────────────────────────────────────────────────────────────

@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ('name', 'start_time', 'end_time')
    ordering = ('start_time', 'name')
    search_fields = ('name',)


# ── Office ─────────────────────────────────────────────────────────────────────

class DepartmentInline(admin.TabularInline):
    model = Department
    extra = 1
    show_change_link = True
    fields = ('name',)


@admin.register(Office)
class OfficeAdmin(admin.ModelAdmin):
    list_display = ('name', 'shift_count', 'shift_names')
    filter_horizontal = ('shifts',)
    inlines = [DepartmentInline]
    search_fields = ('name',)

    @admin.display(description='# Shifts')
    def shift_count(self, obj):
        return obj.shifts.count()

    @admin.display(description='Shifts')
    def shift_names(self, obj):
        return ', '.join(s.name for s in obj.shifts.all()) or '—'


# ── Department ─────────────────────────────────────────────────────────────────

class LineInline(admin.TabularInline):
    model = Line
    extra = 1
    show_change_link = True
    fields = ('name',)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'office')
    list_filter = ('office',)
    list_select_related = ('office',)
    inlines = [LineInline]
    search_fields = ('name', 'office__name')


# ── Line ───────────────────────────────────────────────────────────────────────

@admin.register(Line)
class LineAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'office_name')
    list_filter = ('department__office', 'department')
    list_select_related = ('department', 'department__office')
    search_fields = ('name', 'department__name', 'department__office__name')

    @admin.display(description='Office', ordering='department__office__name')
    def office_name(self, obj):
        return obj.department.office.name


# ── Password Policy ────────────────────────────────────────────────────────────

@admin.register(PasswordPolicy)
class PasswordPolicyAdmin(admin.ModelAdmin):
    fieldsets = (
        ('First-Login Behaviour', {
            'fields': ('require_change_on_first_login',),
        }),
        ('Complexity Rules', {
            'fields': (
                'min_length',
                'require_uppercase',
                'require_lowercase',
                'require_number',
                'require_special_character',
            ),
        }),
    )

    # Prevent adding more than one row
    def has_add_permission(self, request):
        return not PasswordPolicy.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


# ── Email Configuration ────────────────────────────────────────────────────────

@admin.register(EmailConfiguration)
class EmailConfigurationAdmin(admin.ModelAdmin):
    fieldsets = (
        ('Provider', {
            'fields': ('provider', 'smtp_host', 'smtp_port', 'use_ssl', 'use_tls'),
        }),
        ('Credentials', {
            'fields': ('username', 'password', 'from_name'),
            'classes': ('collapse',),
        }),
    )

    def has_add_permission(self, request):
        return not EmailConfiguration.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
