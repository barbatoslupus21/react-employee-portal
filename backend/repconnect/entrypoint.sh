#!/bin/sh
set -e

# Fix volume-mount ownership so the django user can write to them
chown -R django:django /app/staticfiles /app/media 2>/dev/null || true

# Drop privileges and re-exec remaining steps as the django user
if [ "$(id -u)" = "0" ]; then
  exec gosu django "$0" "$@"
fi

echo "Running database migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting Gunicorn..."
exec gunicorn repconnect.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers 3 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
