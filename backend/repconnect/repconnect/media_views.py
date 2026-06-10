"""Media file serving.

Public subdirectories (announcements, profile avatars) are served without
authentication so browser <img> tags load correctly.

Sensitive subdirectories (payslips, certificates) require a valid JWT
access-token cookie before streaming.

Path traversal is blocked by resolving both the media root and the
requested path and verifying the latter is strictly inside the former.
"""
from __future__ import annotations

import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

# Subdirectories that are NOT sensitive — served to any visitor.
_PUBLIC_PREFIXES = (
    'announcements/',
    'announcements\\',
    'profile/',
    'profile\\',
)

# Subdirectories that require authentication.
_PROTECTED_PREFIXES = (
    'payslips/',
    'payslips\\',
    'certificates/',
    'certificates\\',
)


class MediaView(APIView):
    """Stream a file from MEDIA_ROOT.

    Public paths (announcements, profile) use AllowAny.
    Protected paths (payslips, certificates) use IsAuthenticated.
    Everything else defaults to requiring authentication.
    """

    # Start permissive; get_permissions() tightens it per request.
    permission_classes = [AllowAny]

    def get_permissions(self):
        path = self.kwargs.get('path', '')
        if any(path.startswith(p) for p in _PUBLIC_PREFIXES):
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request, path: str):
        media_root = Path(settings.MEDIA_ROOT).resolve()
        requested = (media_root / path).resolve()

        root_str = str(media_root)
        req_str = str(requested)

        if not (req_str.startswith(root_str + '/') or req_str.startswith(root_str + '\\')):
            raise Http404

        if not requested.is_file():
            raise Http404

        content_type, _ = mimetypes.guess_type(req_str)
        return FileResponse(
            open(requested, 'rb'),
            content_type=content_type or 'application/octet-stream',
        )


# Keep old name as alias so existing imports still resolve.
ProtectedMediaView = MediaView
