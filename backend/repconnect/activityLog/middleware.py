"""ActivityLogMiddleware — records every authenticated request automatically.

Key design decisions
--------------------
* Intercepts AFTER the view runs (``response = self.get_response(request)``),
  so ``request.user`` is always the DRF-authenticated user (DRF sets
  ``request._request.user`` when its JWTAuthentication resolves the token
  during view dispatch).
* Uses ``transaction.on_commit`` so the INSERT happens after the current DB
  transaction commits, keeping it out of the hot path.
* If there is no active transaction (most GETs), ``on_commit`` fires the
  callback immediately — still after the view has returned, so it never
  delays the response.
* Static / media asset requests are skipped to avoid noise.

MAC address note
----------------
HTTP does not carry client MAC addresses.  The middleware accepts an optional
``X-MAC-Address`` request header that a trusted native/desktop client may
supply.  Browser clients get the server's primary interface MAC as a fallback
(collected once at startup via ``uuid.getnode()``).
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Callable, Any
from django.conf import settings
from django.utils import timezone

from django.db import transaction
from django.http import HttpRequest, HttpResponse

logger = logging.getLogger(__name__)

# ── Paths that are never logged (unauthenticated resources) ───────────────────
_SKIP_PREFIXES: tuple[str, ...] = ('/static/', '/media/', '/favicon.ico')

# ── Module resolver ───────────────────────────────────────────────────────────
# Each entry is (compiled-regex, human-readable module name). First match wins.
_MODULE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'^/api/auth/', re.I),       'Authentication'),
    (re.compile(r'^/api/prform/', re.I),     'PR Form'),
    (re.compile(r'^/api/certificates/', re.I), 'Certification'),
    (re.compile(r'^/api/finance/', re.I),    'Finance'),
    # (re.compile(r'^/api/calendar/', re.I),   'Calendar'),
    # (re.compile(r'^/api/payslip/', re.I),    'Payslip'),
    # (re.compile(r'^/api/leave/', re.I),      'Leave'),
    # (re.compile(r'^/api/profile/', re.I),    'Profile'),
    # (re.compile(r'^/api/hr/', re.I),         'HR'),
    # (re.compile(r'^/api/accounting/', re.I), 'Accounting'),
    # (re.compile(r'^/api/mis/', re.I),        'MIS'),
    # (re.compile(r'^/api/clinic/', re.I),     'Clinic'),
    # (re.compile(r'^/api/news/', re.I),       'News'),
    # (re.compile(r'^/api/iad/', re.I),        'IAD'),
    # (re.compile(r'^/admin/', re.I),          'Admin'),
]

# ── Exact-match action table ──────────────────────────────────────────────────
# Each entry is (HTTP method, substring in path, description).
_EXACT_ACTIONS: list[tuple[str, str, str]] = [
    ('POST',  '/auth/login',         'Logged in'),
    ('POST',  '/auth/logout',        'Logged out'),
    ('POST',  '/auth/token/refresh', 'Refreshed authentication token'),
    ('GET',   '/auth/user',          'Viewed own profile'),
    ('GET',   '/auth/csrf',          'Retrieved CSRF token'),
    ('GET',   '/calendar/events',    'Viewed calendar events'),
    ('POST',  '/calendar/events',    'Created calendar event'),
    ('DELETE', '/calendar/events',   'Deleted calendar event'),
    # PR Form
    ('GET',   '/prform/requests',    'Viewed PR Form requests'),
    ('POST',  '/prform/requests',    'Submitted PR Form request'),
    ('GET',   '/prform/meta',        'Fetched PR Form metadata'),
    ('PATCH', '/prform/requests',    'Updated PR Form request'),
    ('POST',  '/prform/cancel',      'Cancelled PR Form request'),
    # Certification
    ('GET',   '/certificates/my',    'Viewed personal certificates'),
    ('GET',   '/certificates/admin', 'Viewed admin certificate roster'),
    ('POST',  '/certificates/admin', 'Created/updated certificate record'),
    ('POST',  '/certificates/',       'Requested certificate actions'),
    ('POST',  '/certificates/',       'Sent certificate email'),
    # Finance
    ('GET',   '/finance/admin/employees', 'Viewed Finance employee roster'),
    ('GET',   '/finance/admin/chart',     'Viewed Finance chart'),
    ('GET',   '/finance/admin/types',     'Fetched Finance type configuration'),
    ('POST',  '/finance/admin/import',    'Imported Finance records'),
    ('GET',   '/finance/admin/export',    'Exported Finance records'),
]

# ── Generic fallbacks keyed by HTTP method ────────────────────────────────────
_METHOD_TEMPLATES: dict[str, str] = {
    'GET':    'Viewed {resource}',
    'POST':   'Created {resource}',
    'PUT':    'Updated {resource}',
    'PATCH':  'Updated {resource}',
    'DELETE': 'Deleted {resource}',
}

# Collect server MAC once at module load time.
_SERVER_MAC: str = ':'.join(
    f'{b:02X}'
    for b in uuid.getnode().to_bytes(6, byteorder='big')
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_client_ip(request: HttpRequest) -> str:
    """Resolve the real client IP, honouring X-Forwarded-For."""
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '')


def _resolve_module(path: str) -> str:
    for pattern, name in _MODULE_PATTERNS:
        if pattern.search(path):
            return name
    return 'Unknown'


def _slugify_path(path: str) -> str:
    """Turn a URL path into a short human-readable resource name."""
    segments = [s for s in path.rstrip('/').split('/') if s and not s.isdigit()]
    if not segments:
        return 'resource'
    return segments[-1].replace('-', ' ').replace('_', ' ')


def _resolve_action(method: str, path: str) -> str:
    for m, substr, description in _EXACT_ACTIONS:
        if method == m and substr in path:
            return description
    template = _METHOD_TEMPLATES.get(method, 'Accessed {resource}')
    return template.format(resource=_slugify_path(path))


# ── Middleware ────────────────────────────────────────────────────────────────

class ActivityLogMiddleware:
    """Write an ``ActivityLog`` entry for every authenticated request.

    Placement in ``MIDDLEWARE`` must be **after** ``AuthenticationMiddleware``
    so that ``request.user`` is available.  Because DRF sets
    ``request._request.user`` during view dispatch, ``request.user`` will
    reflect the JWT-authenticated user by the time we inspect it in the
    response phase.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        # Early filters to avoid logging frontend-only activity like
        # component clicks that don't hit API endpoints.  These checks
        # are intentionally conservative and configurable via settings.
        path = request.path

        # Skip noise (static/media assets).
        if path.startswith(_SKIP_PREFIXES):
            return response

        # Optionally only log API endpoints (defaults to True).
        if getattr(settings, 'ACTIVITYLOG_ONLY_API', True) and not path.startswith('/api/'):
            return response

        # Only log configured HTTP methods (defaults to common CRUD verbs).
        method = (request.method or '').upper()
        allowed_methods = {m.upper() for m in getattr(
            settings,
            'ACTIVITYLOG_INCLUDE_METHODS',
            ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        )}
        if method not in allowed_methods:
            return response

        user = getattr(request, 'user', None)
        if user is not None and getattr(user, 'is_authenticated', False):
            self._schedule_log(request, user)

        return response

    def _schedule_log(self, request: HttpRequest, user: Any) -> None:
        # Snapshot mutable request data before we leave the request scope.
        # Ensure we have the latest account state and skip logging for
        # inactive/locked accounts.  This acts as a lightweight runtime
        # authentication check so middleware doesn't record actions for
        # accounts that have been disabled since the request began.
        username = user.get_username()  # type: ignore[attr-defined]
        try:
            user.refresh_from_db()
        except Exception:
            # best-effort: if refresh fails, continue with existing user object
            pass
        if not getattr(user, 'active', True) or getattr(user, 'locked', False):
            logger.info('ActivityLog: skipping log for inactive/locked user %s', username)
            return

        method = request.method or ''
        ip = _get_client_ip(request)
        mac = (request.META.get('HTTP_X_MAC_ADDRESS') or _SERVER_MAC)[:17]
        module = _resolve_module(request.path)
        action = _resolve_action(method, request.path)
        path = request.path
        employee_id = getattr(user, 'idnumber', '')

        def _write() -> None:
            try:
                from .models import ActivityLog  # local import avoids circular deps

                # Deduplicate identical log entries created within a short
                # window to avoid noisy duplicates coming from frontend
                # double-requests (React StrictMode, prefetches, etc.). The
                # window length may be configured via
                # ``settings.ACTIVITYLOG_DEDUP_SECONDS`` (defaults to 2s).
                dedup_seconds = int(getattr(settings, 'ACTIVITYLOG_DEDUP_SECONDS', 2))
                cutoff = timezone.now() - timezone.timedelta(seconds=dedup_seconds)

                exists = ActivityLog.objects.filter(
                    user=user,
                    http_method=method,
                    endpoint=path,
                    module=module,
                    action=action,
                    timestamp__gte=cutoff,
                ).exists()

                if exists:
                    logger.debug('ActivityLog: duplicate entry suppressed for %s %s', method, path)
                    return

                ActivityLog.objects.create(
                    user=user,
                    username=username,
                    employee_id=employee_id,
                    ip_address=ip or None,
                    mac_address=mac,
                    module=module,
                    action=action,
                    http_method=method,
                    endpoint=path,
                )
            except Exception:
                logger.exception('ActivityLog: failed to write log entry')

        try:
            # Runs after the current DB transaction commits.  If there is no
            # active transaction, Django calls _write() immediately.
            transaction.on_commit(_write)
        except Exception:
            # Absolute fallback — synchronous write.
            _write()
