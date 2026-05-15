"""Custom DRF permissions for the Announcement module."""
from rest_framework.permissions import BasePermission


class IsAdminHrAccounting(BasePermission):
    """Allow access only to users with admin, hr, or accounting role."""

    message = 'You do not have permission to perform this action.'

    def has_permission(self, request, view):
        u = request.user
        return bool(
            u
            and u.is_authenticated
            and (u.admin or u.hr or u.accounting)
        )
