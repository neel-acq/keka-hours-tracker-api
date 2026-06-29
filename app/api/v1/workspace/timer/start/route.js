import { authHandler } from '@/lib/auth.js';
import * as workspace from '@/lib/services/workspace.js';
import * as queries from '@/lib/db/queries.js';
import { jsonOk, jsonError, handleOptions, withCors } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

export async function POST(request) {
  return authHandler(request, async ({ user }) => {
    const body = await request.json();
    if (!body.taskId) {
      return withCors(jsonError('taskId required'));
    }
    const result = await workspace.startWorkspaceTimer(user.id, body.taskId, body.note || '');
    if (!result.success) {
      return withCors(jsonError(result.error || 'Failed to start timer', 400));
    }
    await queries.upsertAlertState(user.id, { last_workspace_start_alert_at: 0 });
    return withCors(jsonOk(result));
  });
}
