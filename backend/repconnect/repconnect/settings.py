from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

# ── Security ───────────────────────────────────────────────────────────────────
# In development the .env fallback default is used.
# In production set SECRET_KEY in your environment — never hardcode it.
SECRET_KEY = config('SECRET_KEY', default='dev-only-insecure-key-change-in-production')

DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())

# Upload limits
DATA_UPLOAD_MAX_MEMORY_SIZE = 54_525_952  # 52 MB — allows video uploads
FILE_UPLOAD_MAX_MEMORY_SIZE = 5_242_880   # 5 MB
DATA_UPLOAD_MAX_NUMBER_FIELDS = 5000

# ── Applications ───────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    # Project apps
    'userLogin',
    'systemCalendar',
    'activityLog',
    'generalsettings',
    'userProfile',
    'prForm',
    'certification',
    'finance',
    'leave',
    'survey',
    'training',
    'employee_evaluation',
    'announcement',
    'mis_ticket',
    'feedback',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # Must come after AuthenticationMiddleware so request.user is available.
    # DRF sets request._request.user during view dispatch, so by the time
    # the middleware inspects user in the response phase, JWT auth is resolved.
    'activityLog.middleware.ActivityLogMiddleware',
    # Fires a background thread on the first request of each day to ensure
    # today's EmployeeSnapshot record is created automatically.
    'userLogin.middleware.DailySnapshotMiddleware',
    # Adds Cache-Control: no-store to all /api/* responses (Finding #19).
    'repconnect.middleware.NoCacheAPIMiddleware',
]

ROOT_URLCONF = 'repconnect.urls'

# API-only backend — Next.js proxy strips trailing slashes, so we can't
# redirect POST requests. APPEND_SLASH would cause a 500 on every POST.
APPEND_SLASH = False

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'repconnect.wsgi.application'

# ── Database ───────────────────────────────────────────────────────────────────
# Defaults to MySQL. Override via environment variables (set in .env or Docker).
DATABASES = {
    'default': {
        'ENGINE': config('DB_ENGINE', default='django.db.backends.mysql'),
        'NAME': config('DB_NAME', default='repconnect'),
        'USER': config('DB_USER', default='repconnect'),
        'PASSWORD': config('DB_PASSWORD', default='repconnect_pass'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='3311'),
        'OPTIONS': {
            'charset': 'utf8mb4',
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
        },
    }
}

# ── Auth ───────────────────────────────────────────────────────────────────────
AUTH_USER_MODEL = 'userLogin.loginCredentials'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ── Internationalisation ───────────────────────────────────────────────────────
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Manila'
USE_I18N = True
USE_TZ = True

# ── Static & Media ─────────────────────────────────────────────────────────────
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Django REST Framework ──────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'userLogin.authentication.CookieJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    # All list endpoints paginated — max 20 items (project spec)
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '500/hour',
        'user': '2000/hour',
        'mis_chat': '20/min',
        'token_refresh': '30/min',
    },
}

# ── MIS Ticket — n8n webhook URL ─────────────────────────────────────────────
# Must be set explicitly in the environment — no default so a missing value
# raises ImproperlyConfigured at startup rather than silently hitting an
# internal IP that leaks network topology (Finding #15).
N8N_WEBHOOK_URL = config('N8N_WEBHOOK_URL', default='')

# ── Simple JWT ─────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# Cookie names used by CookieJWTAuthentication
JWT_ACCESS_COOKIE = 'access_token'
JWT_REFRESH_COOKIE = 'refresh_token'

# Cookie security flags — False in dev so HTTP works, True in prod
JWT_COOKIE_SECURE = not DEBUG

# ── CORS ───────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000',
    cast=Csv(),
)
CORS_ALLOW_CREDENTIALS = True  # Required so cookies are sent cross-origin

# ── Security headers ───────────────────────────────────────────────────────────
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'

# HSTS — set SECURE_HSTS_SECONDS=63072000 in production once HTTPS is confirmed.
# Set to 0 here so a misconfigured non-TLS deployment doesn't lock browsers out.
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=0, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# When nginx terminates TLS and forwards requests, trust its X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Redirect bare HTTP to HTTPS — enable in production via env var.
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=False, cast=bool)

# ── CSRF ───────────────────────────────────────────────────────────────────────
# CsrfViewMiddleware remains active in MIDDLEWARE (see above).
# CSRF_COOKIE_HTTPONLY must be False so JavaScript can read the csrftoken cookie
# and attach it as the X-CSRFToken request header on every non-safe request.
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SECURE = not DEBUG   # True in production
# Trust the Next.js dev server origin so the proxy-forwarded Origin header passes.
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000',
    cast=Csv(),
)

# Initialize basic logging early so libraries get configured loggers.
try:
    from .logging_config import setup_logging

    setup_logging()
except Exception:
    # If logging setup fails (permission, read-only FS, etc.) don't break startup.
    pass
