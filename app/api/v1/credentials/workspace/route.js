import { authHandler } from '@/lib/auth.js';
import * as queries from '@/lib/db/queries.js';
import { jsonOk, jsonError, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

export async function POST(request) {
  return authHandler(request, async ({ user }) => {
    const body = await request.json();
    if (!body.csrfToken || !body.cookies) {
      return withCors(jsonError('csrfToken and cookies object required'));
    }
    await queries.upsertWorkspaceSession(
      user.id,
      body.csrfToken,
      body.cookies,
      body.expiresAt || null
    );
    return withCors(jsonOk({ synced: true }));
  });
}

export async function GET(request) {
  return authHandler(request, async ({ user }) => {
    const session = await queries.getWorkspaceSession(user.id);
    return withCors(jsonOk({
      configured: !!session,
      updatedAt: session?.updatedAt || null
    }));
  });
}
