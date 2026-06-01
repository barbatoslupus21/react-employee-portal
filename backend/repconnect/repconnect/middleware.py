"""Project-level Django middleware."""
from __future__ import annotations

from django.http import HttpRequest, HttpResponse


class NoCacheAPIMiddleware:
    """Add Cache-Control: no-store to all /api/* responses.

    Prevents browsers and shared proxies from caching API responses that
    may contain sensitive PII, payslip data, or session-bound information.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if request.path.startswith('/api/'):
            response['Cache-Control'] = 'no-store, private'
            response['Pragma'] = 'no-cache'
        return response
