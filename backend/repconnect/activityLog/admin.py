"""Admin configuration for the ActivityLog module.

Access rules
------------
* Only ``is_superuser`` accounts can reach this admin page.
* No add / change / delete operations are permitted on ``ActivityLog`` records.
* The built-in bulk-delete action is removed from the action menu.
* Administrators may export the current filtered selection to CSV.

Search & filtering
------------------
The admin search bar covers: username, employee ID, IP address, MAC address,
module, action, and endpoint.  The filter sidebar covers: date range, module,
and HTTP method.  The ``date_hierarchy`` drill-down is enabled on ``timestamp``.
"""
from __future__ import annotations

import csv
from datetime import timedelta
from typing import Any, List, cast

from django.contrib import admin, messages
from django.http import StreamingHttpResponse, HttpResponse, HttpRequest
from django.db.models import QuerySet
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from .models import ActivityLog, Notification


# ── Date-range sidebar filter ─────────────────────────────────────────────────

class TimestampRangeFilter(admin.SimpleListFilter):
    title = _('Date range')
    parameter_name = 'ts_range'

    _OPTIONS = [
        ('today', _('Today')),
        ('7d',    _('Last 7 days')),
        ('30d',   _('Last 30 days')),
        ('90d',   _('Last 90 days')),
    ]
    _DAYS = {'today': 0, '7d': 7, '30d': 30, '90d': 90}

    def lookups(self, request, model_admin) -> List[tuple[Any, str]]:
        # Convert lazy translation objects to plain strings for type checkers.
        return [(k, str(v)) for k, v in self._OPTIONS]

    def queryset(self, request, queryset):
        val = self.value()
        if val is None or val not in self._DAYS:
            return queryset
        days = self._DAYS[val]
        now = timezone.now()
        since = now.replace(hour=0, minute=0, second=0, microsecond=0) if days == 0 \
                else now - timedelta(days=days)
        return queryset.filter(timestamp__gte=since)


# ── CSV export action ─────────────────────────────────────────────────────────

class _EchoBuffer:
    """Minimal write adapter for streaming CSV generation."""
    def write(self, value: str) -> str:
        return value


def _export_csv(modeladmin: admin.ModelAdmin, request: HttpRequest, queryset: QuerySet) -> HttpResponse | None:
    """Stream the selected ``ActivityLog`` rows as a downloadable CSV file.

    Typed to the generic ``admin.ModelAdmin`` / ``QuerySet`` signature so
    the admin machinery and type-checker agree on the callable type.
    """
    if not (request.user.is_active and request.user.is_superuser):
        messages.error(request, 'Only superusers may export activity logs.')
        return None

    writer = csv.writer(_EchoBuffer())
    _HEADER = [
        'ID', 'Timestamp (UTC)', 'Username', 'Employee ID',
        'IP Address', 'MAC Address', 'Module', 'Action',
        'HTTP Method', 'Endpoint',
    ]

    def _rows():
        yield writer.writerow(_HEADER)
        for obj in queryset.order_by('-timestamp').iterator(chunk_size=500):
            yield writer.writerow([
                obj.pk,
                obj.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                obj.username,
                obj.employee_id,
                obj.ip_address or '',
                obj.mac_address,
                obj.module,
                obj.action,
                obj.http_method,
                obj.endpoint,
            ])

    response = StreamingHttpResponse(_rows(), content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="activity_logs.csv"'
    return cast(HttpResponse, response)


_export_csv.short_description = 'Export selected logs to CSV'  # type: ignore[attr-defined]


# ── ModelAdmin ────────────────────────────────────────────────────────────────

@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):

    # ── List view ─────────────────────────────────────────────────────────────
    list_display = [
        'timestamp', 'username', 'employee_id',
        'ip_address', 'mac_address',
        'module', 'action', 'http_method', 'endpoint',
    ]
    list_display_links = ['timestamp', 'username']
    list_per_page = 50
    ordering = ['-timestamp']
    date_hierarchy = 'timestamp'

    search_fields = [
        'username', 'employee_id',
        'ip_address', 'mac_address',
        'module', 'action', 'endpoint',
    ]
    list_filter = [
        TimestampRangeFilter,
        'module',
        'http_method',
    ]

    # ── Detail view (read-only) ───────────────────────────────────────────────
    readonly_fields = [
        'user', 'username', 'employee_id',
        'ip_address', 'mac_address',
        'module', 'action', 'http_method', 'endpoint',
        'timestamp',
    ]
    fieldsets = [
        (_('User'),      {'fields': ['user', 'username', 'employee_id']}),
        (_('Network'),   {'fields': ['ip_address', 'mac_address']}),
        (_('Action'),    {'fields': ['module', 'action', 'http_method', 'endpoint']}),
        (_('Timestamp'), {'fields': ['timestamp']}),
    ]

    # ── Actions ───────────────────────────────────────────────────────────────
    actions = [_export_csv]

    def get_actions(self, request):
        actions = super().get_actions(request)
        # Remove the built-in bulk-delete action entirely.
        actions.pop('delete_selected', None)
        return actions

    # ── Permission guards (superuser-only) ────────────────────────────────────
    def _is_superuser(self, request) -> bool:
        return request.user.is_active and request.user.is_superuser

    def has_view_permission(self, request, obj=None) -> bool:
        return self._is_superuser(request)

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False

    def has_module_perms(self, request) -> bool:  # type: ignore[override]
        return self._is_superuser(request)


# ── Notification admin ────────────────────────────────────────────────────────

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display  = ['created_at', 'recipient', 'notification_type', 'title', 'is_read', 'module']
    list_filter   = ['notification_type', 'is_read', 'module']
    search_fields = ['recipient__username', 'title', 'message', 'module']
    ordering      = ['-created_at']
    readonly_fields = [
        'recipient', 'notification_type', 'title', 'message',
        'is_read', 'module', 'related_object_id', 'created_at',
    ]
    date_hierarchy = 'created_at'
    list_per_page  = 50

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return request.user.is_active and request.user.is_superuser

    def has_view_permission(self, request, obj=None) -> bool:
        return request.user.is_active and request.user.is_superuser
