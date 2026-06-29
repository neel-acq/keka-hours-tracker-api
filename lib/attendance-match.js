import { getAttendanceDateKey, toKekaDateStr } from './timezone.js';

export function matchesTodayEntry(entry, today = new Date()) {
  if (!entry) return false;

  const todayKey = toKekaDateStr(today);

  if (entry.attendanceDate) {
    return getAttendanceDateKey(entry.attendanceDate) === todayKey;
  }

  if (!entry.date) return false;

  const todayDay = Number(todayKey.split('-')[2]);
  const todayMonth = new Date(`${todayKey}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'Asia/Kolkata'
  }).toLowerCase();

  const dayFirst = entry.date.match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (dayFirst) {
    return parseInt(dayFirst[1], 10) === todayDay &&
      dayFirst[2].toLowerCase() === todayMonth;
  }

  const monthFirst = entry.date.match(/([A-Za-z]{3})\s+(\d{1,2})/);
  if (monthFirst) {
    return parseInt(monthFirst[2], 10) === todayDay &&
      monthFirst[1].toLowerCase() === todayMonth;
  }

  return false;
}

export function findTodayEntry(entries, today = new Date()) {
  if (!entries?.length) return null;
  return entries.find((entry) => matchesTodayEntry(entry, today)) || null;
}
