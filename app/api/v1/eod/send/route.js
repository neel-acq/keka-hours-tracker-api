import { authHandler } from '@/lib/auth.js';
import * as teams from '@/lib/services/teams.js';
import { jsonOk, jsonError, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

export async function POST(request) {
  return authHandler(request, async ({ user }) => {
    const body = await request.json();
    if (!body.message) {
      return withCors(jsonError('message required'));
    }
    const result = await teams.sendTeamsMessage(user.id, body.message);
    if (!result.success) {
      return withCors(jsonError(result.error || 'Send failed', 400));
    }
    return withCors(jsonOk({ sent: true }));
  });
}
