from django.contrib import admin
from .models import loginCredentials, LoginAttempt


@admin.register(loginCredentials)
class LoginCredentialsAdmin(admin.ModelAdmin):
    list_display = [
        'idnumber', 'username', 'firstname', 'lastname', 'email', 'active', 'admin', 'created_at'
    ]
    list_filter = [
        'active', 'locked', 'admin', 'news', 'clinic', 'iad', 'accounting', 'hr', 'hr_manager', 'mis'
    ]
    search_fields = ['idnumber', 'username', 'firstname', 'lastname', 'email']
    readonly_fields = ['created_at']
    ordering = ['-created_at']
    def save_model(self, request, obj, form, change):
        """Ensure related permission flags mirror the `admin` flag."""
        perm_fields = ['news', 'clinic', 'iad', 'accounting', 'hr', 'hr_manager', 'mis']
        if obj.admin:
            for f in perm_fields:
                setattr(obj, f, True)
        else:
            for f in perm_fields:
                setattr(obj, f, False)
        super().save_model(request, obj, form, change)


@admin.register(LoginAttempt)
class LoginAttemptAdmin(admin.ModelAdmin):
    list_display = ['ip_address', 'user', 'was_successful', 'created_at']
    list_filter = ['was_successful']
    readonly_fields = ['ip_address', 'user', 'was_successful', 'created_at']
    ordering = ['-created_at']
