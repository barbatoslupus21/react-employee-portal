from rest_framework.permissions import BasePermission


class IsMISAdmin(BasePermission):
    """Allow access only to users with mis=True."""

    message = 'MIS administrator access required.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'mis', False)
        )
