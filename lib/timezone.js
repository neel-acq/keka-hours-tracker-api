export const KEKA_TIMEZONE = 'Asia/Kolkata';

/** YYYY-MM-DD in Keka office timezone (IST). */
export function toKekaDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: KEKA_TIMEZONE }).format(date);
}

/** Display as "29 Jun" (day first) for extension matching. */
export function formatAttendanceDisplayDate(attendanceDateStr) {
  const dateKey = attendanceDateStr.split('T')[0];
  const day = parseInt(dateKey.split('-')[2], 10);
  const monthLabel = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: KEKA_TIMEZONE
  });
  return `${day} ${monthLabel}`;
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
