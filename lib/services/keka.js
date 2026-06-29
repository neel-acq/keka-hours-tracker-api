import * as queries from '../db/queries.js';
import { getSupabase } from '../supabase.js';
import { normalizeKekaSubdomain } from '../user-info.js';
import { findTodayEntry } from '../attendance-match.js';
import {
  addDaysToDateKey,
  formatAttendanceDisplayDate,
  formatTime12h,
  getAttendanceDateKey,
  toKekaDateStr
} from '../timezone.js';

async function resolveKekaBaseUrl(userId, subdomain) {
  const slug = normalizeKekaSubdomain(subdomain);
  if (slug) return `https://${slug}.keka.com`;

  if (userId) {
    const sb = getSupabase();
    const { data } = await sb
      .from('extension_users')
      .select('subdomain')
      .eq('id', userId)
      .maybeSingle();
    const fromDb = normalizeKekaSubdomain(data?.subdomain);
    if (fromDb) return `https://${fromDb}.keka.com`;
  }

  return 'https://acquaint.keka.com';
}

export async function fetchKekaAttendanceSummary(userId, tokenOverride, subdomain) {
  const tokenRow = tokenOverride ? { token: tokenOverride } : await queries.getLatestToken(userId);
  const token = tokenRow?.token;
  if (!token) {
    throw new Error('No Keka token stored. Sync credentials first.');
  }

  const base = await resolveKekaBaseUrl(userId, subdomain);
  const response = await fetch(`${base}/k/attendance/api/mytime/attendance/summary`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Referer: `${base}/`
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
    attendance_date: getAttendanceDateKey(item.attendanceDate),
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
  const sevenDaysAgoStr = addDaysToDateKey(todayStr, -7);
  return rawItems.filter((item) => {
    if (!item.attendanceDate) return false;
    const itemDate = getAttendanceDateKey(item.attendanceDate);
    return itemDate >= sevenDaysAgoStr && itemDate <= todayStr;
  });
}

export function parseApiEntryForClient(item) {
  const day = buildDayRecord(item);
  const inOutArray = (item.originalTimeEntries || []).map((te) => {
    const type = parseSwipeType(te.punchStatus);
    return type
      ? {
          type,
          time: formatTime12h(new Date(te.timestamp)),
          premise: te.premiseName || 'Unknown'
        }
      : null;
  }).filter(Boolean);

  const attendanceDate = getAttendanceDateKey(item.attendanceDate);
  const date = formatAttendanceDisplayDate(item.attendanceDate);

  let status = day.status;
  if (item.attendanceDayStatus === 1) status = 'Present';
  else if (item.attendanceDayStatus === 0) status = 'Absent';

  return {
    attendanceDate,
    date,
    checkIn: day.check_in,
    checkOut: day.check_out,
    grossHours: day.gross_hours,
    effectiveHours: day.effective_hours,
    breakTime: day.break_duration,
    duration: day.gross_hours,
    inOutArray,
    shift: item.shiftPolicyName || null,
    shiftStart: item.shiftStartTime ? formatTime12h(new Date(item.shiftStartTime)) : null,
    shiftEnd: item.shiftEndTime ? formatTime12h(new Date(item.shiftEndTime)) : null,
    late: item.arrivalMessage || null,
    status
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

export async function getTodayAttendanceForClient(userId, token, subdomain) {
  const data = await fetchKekaAttendanceSummary(userId, token, subdomain);
  const recent = filterRecentApiItems(data.data || []);
  const todayDateKey = toKekaDateStr(new Date());
  const entries = recent
    .map(parseApiEntryForClient)
    .sort((a, b) => (b.attendanceDate || '').localeCompare(a.attendanceDate || ''));
  const todayEntry = findTodayEntry(entries) || null;
  return {
    scrapedAt: new Date().toISOString(),
    source: 'API',
    todayDateKey,
    todayEntry,
    entries
  };
}
