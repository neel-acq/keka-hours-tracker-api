import { authHandler } from '@/lib/auth.js';
import * as alerts from '@/lib/services/alerts.js';
import { toClientAlertResult } from '@/lib/client-dto.js';
import { jsonOk, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

export async function GET(request) {
  return authHandler(request, async ({ user }) => {
    const url = new URL(request.url);
    const language = url.searchParams.get('language') || 'en';
    const notificationsEnabled = url.searchParams.get('notificationsEnabled') !== 'false';
    const workspaceAlertsEnabled = url.searchParams.get('workspaceAlertsEnabled') !== 'false';
    const workspaceAlertInterval = parseInt(url.searchParams.get('workspaceAlertInterval') || '15', 10);

    let scrapedAttendance = null;
    const attendanceParam = url.searchParams.get('attendance');
    if (attendanceParam) {
      try {
        scrapedAttendance = JSON.parse(attendanceParam);
      } catch {
        scrapedAttendance = null;
      }
    }

    const result = await alerts.checkAlerts(user.id, {
      language,
      notificationsEnabled,
      workspaceAlertsEnabled,
      workspaceAlertInterval,
      scrapedAttendance
    });

    return withCors(jsonOk(toClientAlertResult(result)));
  });
}

export async function POST(request) {
  return authHandler(request, async ({ user }) => {
    const body = await request.json().catch(() => ({}));
    if (body.test === true) {
      return withCors(jsonOk(toClientAlertResult(alerts.buildTestAlert(body.language || 'en'))));
    }
    const result = await alerts.checkAlerts(user.id, body);
    return withCors(jsonOk(toClientAlertResult(result)));
  });
}
