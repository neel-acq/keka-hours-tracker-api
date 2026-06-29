import * as queries from '../db/queries.js';
import {
  formatAttendanceDisplayDate,
  formatTime12h,
  toKekaDateStr
} from '../timezone.js';

const KEKA_API_BASE = 'https://acquaint.keka.com';

export async function fetchKekaAttendanceSummary(userId, tokenOverride) {
  const tokenRow = tokenOverride ? { token: tokenOverride } : await queries.getLatestToken(userId);
  const token = tokenRow?.token;
  if (!token) {
    throw new Error('No Keka token stored. Sync credentials first.');
  }

  const response = await fetch(`${KEKA_API_BASE}/k/attendance/api/mytime/attendance/summary`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 401) {
    const err = new Error('Keka token expired');
    err.status = 401;
    throw err;
  }
  if (!response.ok) {
    throw new Error(`Keka API failed: HTTP ${response.status}`);
  }

  return response.json();
}

function parseSwipeType(punchStatus) {
  if (punchStatus === 0) return 'IN';
  if (punchStatus === 1 || punchStatus === 4) return 'OUT';
  return null;
}

function deriveDayStatus(item, checkIn, checkOut, swipeCount) {
  if (item.isAnomalyDetected) return 'Anomaly Detected';
  if (item.attendanceDayStatus === 1) return 'Present';
  if (item.attendanceDayStatus === 0) return 'Absent';
  if (swipeCount > 0 && !checkOut) return 'Missing Swipe';
  return null;
}

export function buildDayRecord(item) {
  let checkIn = null;
  let checkOut = null;
  const swipes = [];

  if (item.originalTimeEntries && Array.isArray(item.originalTimeEntries)) {
    item.originalTimeEntries.forEach((timeEntry, index) => {
      const swipeType = parseSwipeType(timeEntry.punchStatus);
      if (!swipeType) return;
      const swipeDate = new Date(timeEntry.timestamp);
      const timeStr = formatTime12h(swipeDate);
      swipes.push({
        sequence: index,
        swipe_type: swipeType,
        swipe_time: timeStr,
        premise: timeEntry.premiseName || 'Unknown',
        raw_timestamp: timeEntry.timestamp
      });
      if (swipeType === 'IN' && !checkIn) checkIn = timeStr;
      if (swipeType === 'OUT') checkOut = timeStr;
    });
  }

  return {
    attendance_date: item.attendanceDate.split('T')[0],
    check_in: checkIn,
    check_out: checkOut || (checkIn ? 'MISSING' : null),
    gross_hours: item.grossHoursInHHMM || null,
    effective_hours: item.effectiveHoursInHHMM || null,
    break_duration: item.breakDurationInHHMM || null,
    status: deriveDayStatus(item, checkIn, checkOut, swipes.length),
    shift_name: item.shiftPolicyName || null,
    total_gross_hours: item.totalGrossHours ?? null,
    total_effective_hours: item.totalEffectiveHours ?? null,
    synced_at: new Date().toISOString(),
    swipes
  };
}

export function filterRecentApiItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const todayStr = toKekaDateStr(new Date());
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = toKekaDateStr(sevenDaysAgo);
  return rawItems.filter((item) => {
    if (!item.attendanceDate) return false;
    const itemDate = item.attendanceDate.split('T')[0];
    return itemDate >= sevenDaysAgoStr && itemDate <= todayStr;
  });
}

export function parseApiEntryForClient(item) {
  const day = buildDayRecord(item);
  const inOutArray = (item.originalTimeEntries || []).map((te, i) => {
    const type = parseSwipeType(te.punchStatus);
    return type ? { type, time: formatTime12h(new Date(te.timestamp)) } : null;
  }).filter(Boolean);

  const attendanceDate = item.attendanceDate.split('T')[0];
  const date = formatAttendanceDisplayDate(item.attendanceDate);

  return {
    attendanceDate,
    date,
    checkIn: day.check_in,
    checkOut: day.check_out,
    grossHours: day.gross_hours,
    effectiveHours: day.effective_hours,
    breakTime: day.break_duration,
    inOutArray
  };
}

export async function syncAttendanceToDb(userId, rawApiItems) {
  const recent = filterRecentApiItems(rawApiItems);
  const syncedDays = [];
  for (const item of recent) {
    const dayRecord = buildDayRecord(item);
    const result = await queries.upsertAttendanceDay(userId, dayRecord);
    syncedDays.push(result);
  }
  return syncedDays;
}

export async function getTodayAttendanceForClient(userId, token) {
  const data = await fetchKekaAttendanceSummary(userId, token);
  const recent = filterRecentApiItems(data.data || []);
  const entries = recent
    .map(parseApiEntryForClient)
    .sort((a, b) => (b.attendanceDate || '').localeCompare(a.attendanceDate || ''));
  return {
    scrapedAt: new Date().toISOString(),
    source: 'API',
    entries
  };
}
