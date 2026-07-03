import { handleOptions, withCors, jsonError } from '@/lib/http.js';

export function OPTIONS() {
  return handleOptions();
}

/** Timer start from extension UI is disabled — use Workspace timesheet page. */
export async function POST() {
  return withCors(jsonError('Starting timers from the extension is disabled. Open Workspace timesheet.', 410));
}
