from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class _CSRFCheck(CsrfViewMiddleware):
    """
    Subclass that returns the rejection reason as a string instead of an
    HttpResponseForbidden, so the caller can raise a DRF exception.
    """
    def _reject(self, request, reason):
        return reason


class CookieJWTAuthentication(JWTAuthentication):
    """
    JWT authentication that reads the access token from an HttpOnly cookie.

    Enforces CSRF for every cookie-based request (safe methods are allowed
    through automatically by CsrfViewMiddleware itself).  This mirrors the
    approach used by DRF's SessionAuthentication and satisfies the spec's
    requirement for defence-in-depth: every protected endpoint must present
    both a valid CSRF token *and* a valid JWT access token.
    """

    def authenticate(self, request):
        cookie_name = getattr(settings, 'JWT_ACCESS_COOKIE', 'access_token')
        raw_token = request.COOKIES.get(cookie_name)
        if raw_token is None:
            return None

        # Enforce CSRF before accepting the token — safe methods are exempt.
        self._enforce_csrf(request)

        try:
            validated_token = self.get_validated_token(raw_token)
        except (TokenError, InvalidToken):
            return None

        return self.get_user(validated_token), validated_token

    @staticmethod
    def _enforce_csrf(request):
        """
        Run Django's CSRF check against the incoming request.
        Raises PermissionDenied if validation fails.
        """
        check = _CSRFCheck(get_response=lambda r: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied('CSRF validation failed: %s' % reason)
