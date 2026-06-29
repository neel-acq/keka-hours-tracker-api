import { authHandler } from '@/lib/auth.js';
import * as workspace from '@/lib/services/workspace.js';
import { toClientWorkspaceStatus } from '@/lib/client-dto.js';
import { jsonOk, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

export async function GET(request) {
  return authHandler(request, async ({ user }) => {
    const status = await workspace.fetchWorkspaceStatus(user.id);
    return withCors(jsonOk(toClientWorkspaceStatus(status)));
  });
}
