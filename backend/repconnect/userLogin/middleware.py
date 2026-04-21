"""
userLogin.middleware
====================
DailySnapshotMiddleware — fires a background thread on the first request
of each calendar day to ensure today's EmployeeSnapshot record exists.

* Does NOT block the request — the snapshot runs in a daemon thread.
* Uses Django's cache framework to guarantee at-most-one trigger per day.
  The in-process check avoids a DB query on every request; the DB existence
  check inside the thread guards against duplicate runs when the cache is
  cold (e.g. on restart day).
* Silently swallows all errors so a snapshot failure never breaks a request.
* Only activates *after* Django's ORM is fully ready (apps are loaded) so
  there is no risk of import-order issues during test setup.
"""
import datetime
import logging
import threading

logger = logging.getLogger(__name__)

_CACHE_KEY_PREFIX = 'snapshot:taken:'


def _run_snapshot_in_background(today: datetime.date) -> None:
    """Background-thread target: take a snapshot for *today* if one does not exist yet."""
    try:
        from userLogin.models import EmployeeSnapshot
        from userLogin.utils import take_snapshot

        if not EmployeeSnapshot.objects.filter(snapshot_date=today).exists():
            snap, created = take_snapshot(today)
            if created:
                logger.info(
                    'DailySnapshotMiddleware: created snapshot for %s '
                    '(total=%d, regular=%d, probationary=%d, ojt=%d)',
                    today, snap.total, snap.regular, snap.probationary, snap.ojt,
                )
    except Exception:  # pragma: no cover
        logger.exception('DailySnapshotMiddleware: snapshot background task failed for %s', today)


class DailySnapshotMiddleware:
    """
    WSGI/ASGI-compatible middleware that schedules a daily EmployeeSnapshot.
    Place this *after* SecurityMiddleware so it runs early, but it does not
    require request.user and can sit anywhere in the stack.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        self._maybe_trigger()
        return self.get_response(request)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _maybe_trigger() -> None:
        """Trigger a background snapshot task at most once per calendar day."""
        try:
            from django.core.cache import cache

            today     = datetime.date.today()
            cache_key = f'{_CACHE_KEY_PREFIX}{today}'

            # Fast path: cache hit → already triggered today.
            if cache.get(cache_key):
                return

            # Mark as triggered for the rest of the day (expires at midnight + buffer).
            # We set this *before* spawning the thread so that concurrent requests
            # during the same millisecond don't each spawn their own thread.
            seconds_until_midnight = (
                datetime.datetime.combine(today + datetime.timedelta(days=1), datetime.time.min)
                - datetime.datetime.now()
            ).seconds + 60  # 60-second buffer

            cache.set(cache_key, True, seconds_until_midnight)

            # Spawn background thread — does its own DB existence check before writing.
            t = threading.Thread(
                target=_run_snapshot_in_background,
                args=(today,),
                daemon=True,
                name=f'daily-snapshot-{today}',
            )
            t.start()

        except Exception:  # pragma: no cover
            logger.exception('DailySnapshotMiddleware: failed to schedule snapshot trigger')
