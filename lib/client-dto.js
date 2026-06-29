/** Minimal payloads for extension — full records stay in DB only. */

function slimAttendanceEntry(entry) {
  if (!entry) return null;
  return {
    date: entry.date,
    attendanceDate: entry.attendanceDate,
    checkIn: entry.checkIn,
    checkOut: entry.checkOut,
    grossHours: entry.grossHours,
    effectiveHours: entry.effectiveHours,
    breakTime: entry.breakTime,
    duration: entry.duration || entry.grossHours || null,
    inOutArray: entry.inOutArray || [],
    shift: entry.shift || null,
    shiftStart: entry.shiftStart || null,
    shiftEnd: entry.shiftEnd || null,
    late: entry.late || null,
    status: entry.status || null
  };
}

export function toClientProfile(user) {
  if (!user) return { display_name: null, company_name: null };
  return {
    display_name: user.display_name || null,
    company_name: user.company_name || null,
  };
}

export function toClientAttendance(attendance) {
  if (!attendance) return null;
  return {
    todayDateKey: attendance.todayDateKey,
    todayEntry: slimAttendanceEntry(attendance.todayEntry),
    entries: (attendance.entries || []).map(slimAttendanceEntry),
  };
}

export function toClientWorkspaceStatus(status) {
  if (!status) return { timesheet: null, activeTimer: null, tasksList: [] };
  return {
    timesheet: status.timesheet || null,
    activeTimer: status.activeTimer || null,
    tasksList: status.tasksList || [],
  };
}

export function toClientAlertResult(result) {
  return { alert: result?.alert || null };
}

export function toClientSyncMeta({ daysSynced, dates } = {}) {
  return {
    daysSynced: daysSynced ?? 0,
    dates: dates || [],
  };
}
