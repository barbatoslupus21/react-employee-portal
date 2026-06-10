from rest_framework.permissions import BasePermission


class IsEmployeeAdmin(BasePermission):
    """Allow access only to users with admin or hr flag set."""

    message = 'You do not have permission to perform this action.'

    def has_permission(self, request, view) -> bool:  # type: ignore[override]
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.admin or request.user.hr)
        )
