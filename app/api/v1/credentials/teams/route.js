import { authHandler } from '@/lib/auth.js';
import * as queries from '@/lib/db/queries.js';
import { extractTeamsFromId } from '@/lib/services/teams.js';
import { jsonOk, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

export async function POST(request) {
  return authHandler(request, async ({ user }) => {
    const body = await request.json();
    const fromId = body.fromId || (body.skypeToken ? extractTeamsFromId(body.skypeToken) : null);
    await queries.upsertTeamsCredentials(user.id, {
      skypeToken: body.skypeToken,
      tokenExpiry: body.tokenExpiry,
      fromId,
      displayName: body.displayName,
      conversationId: body.conversationId,
      prewrittenMessages: body.prewrittenMessages
    });
    return withCors(jsonOk({ synced: true }));
  });
}

export async function GET(request) {
  return authHandler(request, async ({ user }) => {
    const creds = await queries.getTeamsCredentials(user.id);
    return withCors(jsonOk({
      configured: !!(creds?.conversationId && creds?.displayName),
      hasToken: !!creds?.skypeToken
    }));
  });
}
