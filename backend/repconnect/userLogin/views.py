import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.db.models import Q
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import LoginAttempt
from .serializers import LoginSerializer, UserSerializer

logger = logging.getLogger(__name__)
User = get_user_model()

MAX_FAILED_ATTEMPTS = 5
LOGIN_WINDOW_MINUTES = 15

_ACCESS_COOKIE = getattr(settings, 'JWT_ACCESS_COOKIE', 'access_token')
_REFRESH_COOKIE = getattr(settings, 'JWT_REFRESH_COOKIE', 'refresh_token')
_REFRESH_PATH = '/api/auth/token/refresh'


def _get_client_ip(request):
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '127.0.0.1')


def _cookie_secure():
    return not settings.DEBUG


def _set_auth_cookies(response, access, refresh):
    jwt = settings.SIMPLE_JWT
    access_max = int(jwt['ACCESS_TOKEN_LIFETIME'].total_seconds())
    refresh_max = int(jwt['REFRESH_TOKEN_LIFETIME'].total_seconds())
    secure = _cookie_secure()

    response.set_cookie(
        key=_ACCESS_COOKIE,
        value=access,
        max_age=access_max,
        httponly=True,
        secure=secure,
        samesite='Strict',
        path='/',
    )
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=refresh,
        max_age=refresh_max,
        httponly=True,
        secure=secure,
        samesite='Strict',
        path=_REFRESH_PATH,
    )
    return response


def _clear_auth_cookies(response):
    response.delete_cookie(_ACCESS_COOKIE, path='/')
    response.delete_cookie(_REFRESH_COOKIE, path=_REFRESH_PATH)
    return response


@method_decorator(ensure_csrf_cookie, name='dispatch')
class CsrfCookieView(APIView):
    """
    GET /api/auth/csrf
    Seeds the csrftoken cookie for the SPA.  Must be called once on app
    load so the frontend can read the token and attach it as X-CSRFToken
    on all subsequent non-safe requests.  Requires no authentication.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({'detail': 'CSRF cookie set.'})


@method_decorator(csrf_protect, name='dispatch')
class LoginView(APIView):
    """
    POST /api/auth/login/
    Authenticates with username + password.
    Returns user data and sets JWT tokens in HttpOnly cookies.
    Enforces max 5 failed attempts per IP per 15-minute window.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        ip = _get_client_ip(request)

        # Rate-limit check
        window_start = timezone.now() - timedelta(minutes=LOGIN_WINDOW_MINUTES)
        recent_failures = LoginAttempt.objects.filter(
            ip_address=ip,
            created_at__gte=window_start,
            was_successful=False,
        ).count()

        if recent_failures >= MAX_FAILED_ATTEMPTS:
            logger.warning('login rate-limit hit ip=%s failures=%d', ip, recent_failures)
            return Response(
                {'detail': 'Too many failed attempts. Please wait 15 minutes and try again.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Input validation
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            LoginAttempt.objects.create(ip_address=ip, was_successful=False)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Authenticate
        user = authenticate(
            request,
            username=serializer.validated_data['username'],
            password=serializer.validated_data['password'],
        )

        if user is None:
            LoginAttempt.objects.create(ip_address=ip, was_successful=False)
            logger.warning(
                'failed login username=%s ip=%s',
                serializer.validated_data['username'],
                ip,
            )
            return Response(
                {'detail': 'Invalid credentials.', 'code': 'invalid_credentials'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if user.locked:
            LoginAttempt.objects.create(ip_address=ip, user=user, was_successful=False)
            logger.warning(
                'locked account login attempt username=%s ip=%s',
                serializer.validated_data['username'],
                ip,
            )
            return Response(
                {
                    'detail': 'Your account is locked. Please proceed to HR for unlocking.',
                    'code': 'account_locked',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not user.active:
            LoginAttempt.objects.create(ip_address=ip, user=user, was_successful=False)
            logger.warning(
                'inactive account login attempt username=%s ip=%s',
                serializer.validated_data['username'],
                ip,
            )
            return Response(
                {
                    'detail': 'Your account has been deactivated. Please contact HR.',
                    'code': 'account_inactive',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Success
        LoginAttempt.objects.create(ip_address=ip, user=user, was_successful=True)
        logger.info('successful login user_id=%d ip=%s', user.pk, ip)

        refresh = RefreshToken.for_user(user)
        response = Response(
            {'detail': 'Login successful.', 'user': UserSerializer(user).data},
            status=status.HTTP_200_OK,
        )
        return _set_auth_cookies(response, str(refresh.access_token), str(refresh))


@method_decorator(csrf_protect, name='dispatch')
class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Blacklists the refresh token and clears auth cookies.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw_refresh = request.COOKIES.get(_REFRESH_COOKIE)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass
        response = Response({'detail': 'Logged out successfully.'}, status=status.HTTP_200_OK)
        return _clear_auth_cookies(response)


@method_decorator(csrf_protect, name='dispatch')
class TokenRefreshView(APIView):
    """
    POST /api/auth/token/refresh/
    Issues a new access token using the HttpOnly refresh cookie.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get(_REFRESH_COOKIE)
        if not raw_refresh:
            return Response(
                {'detail': 'Refresh token not found.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            refresh = RefreshToken(raw_refresh)
            new_access = str(refresh.access_token)
            new_refresh = str(refresh)
        except TokenError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_401_UNAUTHORIZED)

        response = Response({'detail': 'Token refreshed.'}, status=status.HTTP_200_OK)
        return _set_auth_cookies(response, new_access, new_refresh)


class MeView(APIView):
    """GET /api/auth/me/ — returns the currently authenticated user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserListView(APIView):
    """
    GET /api/auth/users
    Returns a list of active users for member selection in events.
    Supports optional ?q= search by name or idnumber.
    Requires authentication.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.GET.get('q', '').strip()
        qs = User.objects.filter(active=True).exclude(
            Q(admin=True) & (Q(hr=True) | Q(accounting=True))
        ).order_by('firstname', 'lastname')

        if query:
            qs = qs.filter(
                Q(firstname__icontains=query)
                | Q(lastname__icontains=query)
                | Q(idnumber__icontains=query)
            )[:50]
        else:
            qs = qs[:200]

        data = [
            {
                'id': u.pk,
                'idnumber': u.idnumber,
                'firstname': u.firstname,
                'lastname': u.lastname,
                'avatar': (
                    request.build_absolute_uri(u.avatar.url)
                    if u.avatar and u.avatar.name
                    else None
                ),
            }
            for u in qs
        ]
        return Response(data)
