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
    (re.compile(r'^/api/auth/admin/', re.I),     'Employee Management'),
    (re.compile(r'^/api/auth/', re.I),           'Authentication'),
    (re.compile(r'^/api/prform/', re.I),         'PR Form'),
    (re.compile(r'^/api/certificates/', re.I),   'Certification'),
    (re.compile(r'^/api/finance/', re.I),        'Finance'),
    (re.compile(r'^/api/user-profile/', re.I),   'User Profile'),
    (re.compile(r'^/api/activitylog/', re.I),     'Notifications'),
    (re.compile(r'^/api/general-settings/', re.I), 'General Settings'),
    (re.compile(r'^/api/leave/', re.I),           'Leave'),
    (re.compile(r'^/api/survey/', re.I),          'Survey'),
    # (re.compile(r'^/api/calendar/', re.I),   'Calendar'),
    # (re.compile(r'^/api/payslip/', re.I),    'Payslip'),
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
    ('POST',  '/prform/emergency-loan',           'Submitted Emergency Loan request'),
    ('POST',  '/prform/medicine-allowance/check', 'Checked Medicine Allowance eligibility'),
    ('POST',  '/prform/medicine-allowance',       'Submitted Medicine Allowance request'),
    # Leave
    ('GET',   '/leave/requests',            'Viewed leave requests'),
    ('POST',  '/leave/requests',            'Submitted leave request'),
    ('PATCH', '/leave/requests/',           'Acted on leave request'),
    ('GET',   '/leave/approval-queue',      'Viewed leave approval queue'),
    ('GET',   '/leave/approval-queue/chart','Viewed leave approval chart'),
    # Certification
    ('GET',   '/certificates/my',    'Viewed personal certificates'),
    ('GET',   '/certificates/admin', 'Viewed admin certificate roster'),
    ('POST',  '/certificates/admin', 'Created/updated certificate record'),
    ('POST',  '/certificates/',       'Requested certificate actions'),
    ('POST',  '/certificates/',       'Sent certificate email'),
    # Finance — admin list / chart / import / export
    ('GET',    '/activitylog/notifications/',              'Viewed notifications'),
    ('POST',   '/activitylog/notifications/read-all/',      'Marked all notifications as read'),
    ('POST',   '/activitylog/notifications/',               'Marked notification as read'),
    ('GET',    '/user-profile/me',                         'Viewed own profile'),
    ('PATCH',  '/user-profile/personal-info',              'Updated personal information'),
    ('PATCH',  '/user-profile/work-info',                  'Updated own work information'),
    ('GET',    '/user-profile/',                           'Viewed employee profile'),
    ('PATCH',  '/admin/work-info',                         'Updated employee work information'),
    ('GET',    '/general-settings/password-policy',       'Viewed general settings password policy'),
    ('GET',    '/general-settings/departments',            'Viewed general settings departments'),
    ('GET',    '/general-settings/lines',                  'Viewed general settings lines'),
    ('GET',    '/general-settings/positions',              'Viewed general settings positions'),
    ('GET',    '/general-settings/employment-types',       'Viewed general settings employment types'),
    ('GET',    '/general-settings/email-config',           'Viewed general settings email config'),
    ('PUT',    '/general-settings/email-config',           'Updated general settings email config'),
    ('GET',    '/finance/admin/employees',                 'Viewed Finance employee roster'),
    ('GET',    '/finance/admin/employees/',         'Viewed employee Finance records'),
    ('GET',    '/finance/admin/employee-filters',   'Fetched Finance employee filter options'),
    ('GET',    '/finance/admin/chart',              'Viewed Finance chart'),
    # Employee Management admin
    ('GET',    '/auth/admin/employees',             'Viewed employee roster'),
    ('GET',    '/auth/admin/employees/chart',       'Viewed employee onboarding chart'),
    ('GET',    '/auth/admin/employees/filters',     'Fetched employee filter options'),
    ('PATCH',  '/auth/admin/employees/',            'Updated employee account status'),
    ('POST',   '/auth/admin/employees/',            'Reset employee password'),
    ('GET',    '/finance/admin/types',              'Fetched Finance type configuration'),
    ('POST',   '/finance/admin/types/create',       'Created Finance type'),
    ('PUT',    '/finance/admin/types/',             'Updated Finance type'),
    ('PATCH',  '/finance/admin/types/',             'Updated Finance type'),
    ('DELETE', '/finance/admin/types/',             'Deleted Finance type'),
    ('POST',   '/finance/admin/import',             'Imported Finance records'),
    ('GET',    '/finance/admin/export',             'Exported Finance records'),
    ('GET',    '/finance/admin/template/',          'Downloaded Finance import template'),
    ('POST',   '/finance/admin/payslip-upload',     'Uploaded employee payslip'),
    ('DELETE', '/finance/admin/payslips/',          'Deleted employee payslip'),
    ('GET',    '/finance/admin/loans/',             'Viewed loan deduction history (admin)'),
    ('POST',   '/finance/admin/savings/',           'Processed savings withdrawal'),
    ('GET',    '/finance/admin/loan-settings',      'Viewed loan settings configuration'),
    ('PATCH',  '/finance/admin/loan-settings',      'Updated loan settings configuration'),
    ('POST',   '/finance/admin/loan-settings',      'Updated loan settings configuration'),
    ('GET',    '/finance/admin/office-rates',       'Viewed office Finance rates'),
    ('POST',   '/finance/admin/office-rates',       'Created office Finance rate'),
    ('PUT',    '/finance/admin/office-rates/',      'Updated office Finance rate'),
    ('PATCH',  '/finance/admin/office-rates/',      'Updated office Finance rate'),
    ('DELETE', '/finance/admin/office-rates/',      'Deleted office Finance rate'),
    # Finance — user-facing
    ('GET',    '/finance/my/records',               'Viewed personal Finance records'),
    ('GET',    '/finance/my/loans/',                'Viewed loan deduction history'),
    ('POST',   '/finance/my/payslips/',             'Sent payslip to email'),
    ('GET',    '/finance/my/loan-settings',         'Viewed loan payment settings'),
    # Survey
    ('GET',   '/survey/admin/surveys',              'Viewed survey list'),
    ('POST',  '/survey/admin/surveys',              'Created survey'),
    ('PATCH', '/survey/admin/surveys/',             'Updated survey'),
    ('PATCH', '/survey/admin/surveys/',             'Changed survey status'),
    ('DELETE','/survey/admin/surveys/',             'Deleted survey'),
    ('GET',   '/survey/admin/surveys/',             'Viewed survey results'),
    ('GET',   '/survey/admin/surveys/',             'Exported survey results'),
    ('GET',   '/survey/admin/templates',            'Viewed survey templates'),
    ('POST',  '/survey/admin/templates',            'Created survey template'),
    ('DELETE','/survey/admin/templates/',           'Deleted survey template'),
    ('POST',  '/survey/admin/surveys/from-template/', 'Created survey from template'),
    ('GET',   '/survey/my-surveys',                 'Viewed available surveys'),
    ('GET',   '/survey/surveys/',                   'Opened survey to answer'),
    ('POST',  '/survey/responses',                  'Started survey response'),
    ('PATCH', '/survey/responses/',                 'Saved survey answer'),
    ('POST',  '/survey/responses/',                 'Submitted survey response'),
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
