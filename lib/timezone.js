export const KEKA_TIMEZONE = 'Asia/Kolkata';

/** YYYY-MM-DD in Keka office timezone (IST). */
export function toKekaDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: KEKA_TIMEZONE }).format(date);
}

/** Calendar date for a Keka attendanceDate value (handles UTC offsets). */
export function getAttendanceDateKey(dateStr) {
  if (dateStr == null || dateStr === '') return null;

  if (typeof dateStr === 'number') {
    const parsed = new Date(dateStr);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: KEKA_TIMEZONE }).format(parsed);
    }
    return null;
  }

  const s = String(dateStr).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  const hasOffset = /[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(s) || hasOffset) {
    const normalized = hasOffset ? s : `${s.replace(' ', 'T')}Z`;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: KEKA_TIMEZONE }).format(parsed);
    }
  }

  return s.split('T')[0] || null;
}

/** Add calendar days to a YYYY-MM-DD key in IST. */
export function addDaysToDateKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toKekaDateStr(dt);
}

/**
 * Parse Keka punch/shift timestamps.
 * Keka encodes office wall-clock time in ISO strings; treat components as IST.
 * Epoch milliseconds are absolute instants.
 */
export function parseKekaTimestamp(value) {
  if (value == null || value === '') return null;

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const s = String(value).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2}(?:\.\d+)?)/);
  if (iso) {
    const parsed = new Date(`${iso[1]}T${iso[2]}+05:30`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Display as "29 Jun" (day first) for extension matching. */
export function formatAttendanceDisplayDate(attendanceDateStr) {
  const dateKey = getAttendanceDateKey(attendanceDateStr);
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  const monthLabel = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: KEKA_TIMEZONE
  });
  return `${d} ${monthLabel}`;
}

export function formatTime12h(date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: KEKA_TIMEZONE
  });
}
