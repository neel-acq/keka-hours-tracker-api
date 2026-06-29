import { authHandler } from '@/lib/auth.js';
import * as keka from '@/lib/services/keka.js';
import { jsonOk, jsonError, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

export async function POST(request) {
  return authHandler(request, async ({ user, token }) => {
    const body = await request.json().catch(() => ({}));
    let rawItems = body.rawApiItems;

    if (!rawItems) {
      const data = await keka.fetchKekaAttendanceSummary(user.id, token);
      rawItems = data.data;
    }

    if (!rawItems) {
      return withCors(jsonError('No attendance data to sync'));
    }

    const syncedDays = await keka.syncAttendanceToDb(user.id, rawItems);
    return withCors(jsonOk({ daysSynced: syncedDays.length, dates: syncedDays.map((d) => d.dayDate) }));
  });
}
