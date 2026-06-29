import { authHandler } from '@/lib/auth.js';
import * as teams from '@/lib/services/teams.js';
import * as keka from '@/lib/services/keka.js';
import { jsonOk, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

export async function GET(request) {
  return authHandler(request, async ({ user, token }) => {
    let scrapedAttendance = null;
    try {
      scrapedAttendance = await keka.getTodayAttendanceForClient(
        user.id,
        token,
        user.subdomain
      );
    } catch {
      scrapedAttendance = null;
    }
    const suggestion = await teams.computeSmartEodSuggestion(user.id, scrapedAttendance);
    return withCors(jsonOk({ suggestion }));
  });
}
