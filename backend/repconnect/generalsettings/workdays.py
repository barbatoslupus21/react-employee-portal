import datetime
from decimal import Decimal
from typing import Any, Iterable

from .models import CompanyWorkdayConfiguration

# Monday(0) to Saturday(5). Sunday(6) can be enabled from System Settings.
DEFAULT_WORKDAYS = [0, 1, 2, 3, 4, 5]


def build_weekday_durations(
    workdays: Iterable[int] | None = None,
    *,
    hours_per_day: Decimal | int | float | str = Decimal('8'),
) -> dict[str, float]:
    normalized_workdays = set(normalize_workdays(workdays))
    normalized_hours = Decimal(str(hours_per_day)).quantize(Decimal('0.1'))
    return {
        str(day): float(normalized_hours if day in normalized_workdays else Decimal('0'))
        for day in range(7)
    }


def normalize_weekday_durations(
    values: Any,
    *,
    workdays: Iterable[int] | None = None,
    hours_per_day: Decimal | int | float | str = Decimal('8'),
) -> dict[str, float]:
    base = build_weekday_durations(workdays, hours_per_day=hours_per_day)
    if not isinstance(values, dict):
        return base

    normalized = dict(base)
    for raw_day in range(7):
        raw_value = values.get(str(raw_day), values.get(raw_day))
        if raw_value in (None, ''):
            continue
        try:
            duration = Decimal(str(raw_value)).quantize(Decimal('0.1'))
        except Exception:
            continue
        normalized[str(raw_day)] = float(duration)

    return normalized


def normalize_workdays(values: Iterable[int] | None) -> list[int]:
    if values is None:
        return DEFAULT_WORKDAYS.copy()

    unique = sorted({int(v) for v in values if isinstance(v, int) or str(v).isdigit()})
    filtered = [v for v in unique if 0 <= v <= 6]
    return filtered or DEFAULT_WORKDAYS.copy()


def get_configured_workdays() -> list[int]:
    config = CompanyWorkdayConfiguration.get()
    return normalize_workdays(config.workdays)


def get_configured_weekday_durations() -> dict[int, Decimal]:
    config = CompanyWorkdayConfiguration.get()
    normalized = normalize_weekday_durations(
        getattr(config, 'weekday_durations', None),
        workdays=config.workdays,
        hours_per_day=config.hours_per_day,
    )
    return {
        day: Decimal(str(normalized.get(str(day), 0))).quantize(Decimal('0.1'))
        for day in range(7)
    }


def get_configured_day_hours_for_date(day: datetime.date) -> Decimal:
    weekday = day.weekday()
    day_hours = get_configured_weekday_durations().get(weekday, Decimal('0'))
    if day_hours > Decimal('0'):
        return day_hours
    return get_configured_hours_per_day()


def get_configured_hours_per_day() -> Decimal:
    config = CompanyWorkdayConfiguration.get()
    return Decimal(str(config.hours_per_day)).quantize(Decimal('0.1'))


def get_configured_half_day_hours() -> Decimal:
    return (get_configured_hours_per_day() / Decimal('2')).quantize(Decimal('0.1'))


def is_configured_workday(
    day: datetime.date,
    *,
    configured_workdays: Iterable[int] | None = None,
    sunday_exemptions: set[datetime.date] | None = None,
) -> bool:
    weekday = day.weekday()
    if weekday == 6:
        return sunday_exemptions is not None and day in sunday_exemptions

    allowed = set(normalize_workdays(configured_workdays))
    return weekday in allowed
