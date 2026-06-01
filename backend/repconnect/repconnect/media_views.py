"""Authenticated media file serving.

Replaces Django's development-only static() helper with an authenticated view
that checks JWT credentials before streaming any file from MEDIA_ROOT.
This prevents unauthenticated access to payslips, certificates, and avatars.
"""
from __future__ import annotations

import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView


class ProtectedMediaView(APIView):
    """Stream a MEDIA_ROOT file to authenticated users only.

    Path traversal is blocked by resolving both the media root and the
    requested path and verifying the latter is strictly inside the former
    before the file is opened.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, path: str):
        media_root = Path(settings.MEDIA_ROOT).resolve()
        requested = (media_root / path).resolve()

        # Normalise separator for cross-platform comparison
        root_str = str(media_root)
        req_str = str(requested)

        # requested must be a strict sub-path of media_root
        if not (req_str.startswith(root_str + '/') or req_str.startswith(root_str + '\\')):
            raise Http404

        if not requested.is_file():
            raise Http404

        content_type, _ = mimetypes.guess_type(req_str)
        return FileResponse(
            open(requested, 'rb'),
            content_type=content_type or 'application/octet-stream',
        )
