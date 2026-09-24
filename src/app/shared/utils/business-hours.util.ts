const BUSINESS_TIME_ZONE = 'America/New_York';
const BUSINESS_WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 17;

/** Mon–Fri 9am–5pm America/New_York, evaluated once at call time. */
export function isBusinessHours(date: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);

  const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '-1');

  return BUSINESS_WEEKDAYS.has(weekday) && hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
}
