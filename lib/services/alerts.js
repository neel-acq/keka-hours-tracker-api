import * as queries from '../db/queries.js';
import * as keka from './keka.js';
import * as workspace from './workspace.js';
import * as teams from './teams.js';

const STOP_TIMER_THRESHOLD_HOURS = 8 + 5 / 60;

const ALERT_STRINGS = {
  en: {
    alert_dismiss: 'Dismiss',
    alert_open_workspace: 'Open Workspace',
    alert_reminder_label: 'Reminder',
    alert_exit_title: 'Exit Reminder',
    alert_exit_message_early: '10 minutes until 7 PM! Almost freedom time!',
    alert_exit_message: '10 minutes until your exit time!',
    alert_effective_title: '8 Hours Complete',
    alert_target_exit_title: 'Target Exit',
    alert_test_title: 'Test Alert',
    alert_test_message: 'Your alerts are working correctly.',
    alert_ws_start_title: 'Start Workspace Timer',
    alert_ws_start_message: 'You are punched in on Keka but no workspace timer is running.',
    alert_ws_stop_title: 'Stop Workspace Timer',
    alert_ws_stop_message: 'You have logged 8h 5m+. Consider stopping your timer and sending EOD.',
    eod_modal_label: 'EOD'
  }
};

function t(key, lang = 'en') {
  return ALERT_STRINGS[lang]?.[key] || ALERT_STRINGS.en[key] || key;
}

function isLunchBreak() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 13 * 60 && minutes < 14 * 60;
}

function isWeekdayWorkHours() {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 10 * 60 && minutes < 21 * 60;
}

function hasKekaInToday(scrapedAttendance) {
  if (!scrapedAttendance?.entries) return false;
  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.toLocaleString('en-US', { month: 'short' });
  const todayEntry = scrapedAttendance.entries.find((entry) => {
    if (!entry.date) return false;
    const dateMatch = entry.date.match(/(\d+)\s+(\w+)/);
    if (!dateMatch) return false;
    return parseInt(dateMatch[1]) === todayDay &&
      dateMatch[2].toLowerCase() === todayMonth.toLowerCase();
  }) || scrapedAttendance.entries[0];

  if (!todayEntry) return false;
  if (todayEntry.inOutArray?.length) {
    return todayEntry.inOutArray.some((s) => s.type === 'IN' && s.time && s.time !== 'MISSING');
  }
  return !!(todayEntry.checkIn && todayEntry.checkIn !== 'MISSING');
}

function getTodayDateString() {
  return new Date().toDateString();
}

function canSendStartAlert(lastAlertAt, intervalMinutes) {
  const intervalMs = Math.max(1, intervalMinutes || 15) * 60 * 1000;
  return Date.now() - (lastAlertAt || 0) >= intervalMs;
}

function buildStrings(lang) {
  const keys = Object.keys(ALERT_STRINGS.en);
  const strings = {};
  keys.forEach((k) => { strings[k] = t(k, lang); });
  return strings;
}

export async function checkAlerts(userId, options = {}) {
  const {
    language = 'en',
    notificationsEnabled = true,
    workspaceAlertsEnabled = true,
    workspaceAlertInterval = 15
  } = options;

  if (notificationsEnabled === false) {
    return { alert: null, skipped: true, reason: 'notifications_disabled' };
  }

  const strings = buildStrings(language);

  // Workspace timer alerts
  if (workspaceAlertsEnabled !== false && isWeekdayWorkHours()) {
    try {
      const wsStatus = await workspace.fetchWorkspaceStatus(userId);
      const alertState = await queries.getAlertState(userId);
      const today = getTodayDateString();

      let scrapedAttendance = options.scrapedAttendance;
      if (!scrapedAttendance) {
        try {
          scrapedAttendance = await keka.getTodayAttendanceForClient(userId);
        } catch {
          scrapedAttendance = null;
        }
      }

      const hasKekaIn = hasKekaInToday(scrapedAttendance);
      const { activeTimer, timesheet } = wsStatus;

      if (
        hasKekaIn &&
        !activeTimer &&
        !isLunchBreak() &&
        canSendStartAlert(alertState.last_workspace_start_alert_at, workspaceAlertInterval)
      ) {
        await queries.upsertAlertState(userId, {
          last_workspace_start_alert_at: Date.now()
        });
        return {
          alert: {
            id: 'workspace_start_timer',
            variant: 'action',
            title: t('alert_ws_start_title', language),
            label: t('alert_reminder_label', language),
            message: t('alert_ws_start_message', language),
            strings,
            actions: [
              { id: 'open_workspace', label: t('alert_open_workspace', language), primary: true },
              { id: 'dismiss', label: t('alert_dismiss', language) }
            ]
          }
        };
      }

      const totalHours = timesheet?.totalDecimal || 0;
      if (
        activeTimer &&
        totalHours >= STOP_TIMER_THRESHOLD_HOURS &&
        alertState.workspace_stop_alert_sent_date !== today
      ) {
        await queries.upsertAlertState(userId, {
          workspace_stop_alert_sent_date: today
        });
        const suggestedMessage = await teams.computeSmartEodSuggestion(userId, scrapedAttendance);
        return {
          alert: {
            id: 'workspace_stop_timer',
            variant: 'eod',
            title: t('alert_ws_stop_title', language),
            label: t('eod_modal_label', language),
            message: `${t('alert_ws_stop_message', language)} (${timesheet.totalHours} logged)`,
            suggestedMessage,
            strings,
            actions: []
          }
        };
      }
    } catch {
      // workspace session missing — skip workspace alerts
    }
  }

  return { alert: null };
}

export function buildTestAlert(language = 'en') {
  const strings = buildStrings(language);
  return {
    alert: {
      id: 'test',
      variant: 'info',
      title: t('alert_test_title', language),
      label: t('alert_reminder_label', language),
      message: t('alert_test_message', language),
      strings,
      actions: [{ id: 'dismiss', label: t('alert_dismiss', language) }]
    }
  };
}
