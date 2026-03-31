/**
 * Reads the Django CSRF token from the `csrftoken` cookie.
 *
 * Django sets this cookie via the CsrfViewMiddleware (and the explicit
 * /api/auth/csrf seed endpoint).  The value must be attached as the
 * `X-CSRFToken` header on every non-safe (POST, PUT, PATCH, DELETE) fetch
 * call so that CsrfViewMiddleware can verify it matches the cookie.
 *
 * CSRF_COOKIE_HTTPONLY is set to False in Django settings so that JavaScript
 * can read this cookie.  The JWT access/refresh tokens remain HttpOnly and
 * are never accessible to JavaScript.
 */
export function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  for (const raw of document.cookie.split(';')) {
    const [name, ...rest] = raw.trim().split('=');
    if (name === 'csrftoken') return decodeURIComponent(rest.join('='));
  }
  return '';
}
