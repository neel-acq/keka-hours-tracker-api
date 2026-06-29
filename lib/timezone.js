export const KEKA_TIMEZONE = 'Asia/Kolkata';

/** YYYY-MM-DD in Keka office timezone (IST). */
export function toKekaDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: KEKA_TIMEZONE }).format(date);
}

/** Calendar date for a Keka attendanceDate value (handles UTC offsets). */
export function getAttendanceDateKey(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (/[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: KEKA_TIMEZONE }).format(parsed);
    }
  }
  return s.split('T')[0];
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
