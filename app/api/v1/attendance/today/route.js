import { authHandler } from '@/lib/auth.js';
import * as keka from '@/lib/services/keka.js';
import { toClientAttendance } from '@/lib/client-dto.js';
import { jsonOk, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

export async function GET(request) {
  return authHandler(request, async ({ user, token }) => {
    const attendance = await keka.getTodayAttendanceForClient(
      user.id,
      token,
      user.subdomain
    );
    return withCors(jsonOk({ attendance: toClientAttendance(attendance) }));
  });
}
