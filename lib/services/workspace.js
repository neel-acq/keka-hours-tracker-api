import * as queries from '../db/queries.js';

const WORKSPACE_BASE = 'https://workspace.acquaintsoft.com';
const WORKSPACE_TIMESHEETS_URL = `${WORKSPACE_BASE}/admin/staff/timesheets`;
const TIMER_TRACKING_URL = `${WORKSPACE_BASE}/admin/tasks/timer_tracking?single_task=true`;

function parseHtmlText(html) {
  if (!html) return '';
  return html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function parseProjectName(html) {
  if (!html) return '';
  const match = html.match(/>([^<]+)<\/a>\s*$/);
  return match ? match[1].trim() : parseHtmlText(html);
}

function buildTimesheetsBody(csrf) {
  const params = new URLSearchParams();
  params.set('csrf_token_name', csrf);
  params.set('draw', '1');
  for (let i = 0; i < 7; i++) {
    params.set(`columns[${i}][data]`, String(i));
    params.set(`columns[${i}][name]`, '');
    params.set(`columns[${i}][searchable]`, 'true');
    params.set(`columns[${i}][orderable]`, 'true');
    params.set(`columns[${i}][search][value]`, '');
    params.set(`columns[${i}][search][regex]`, 'false');
  }
  params.set('order[0][column]', '2');
  params.set('order[0][dir]', 'desc');
  params.set('start', '0');
  params.set('length', '25');
  params.set('search[value]', '');
  params.set('search[regex]', 'false');
  params.set('range', 'today');
  params.set('period-from', '');
  params.set('period-to', '');
  return params.toString();
}

function buildTasksBody(csrf) {
  const params = new URLSearchParams();
  params.set('csrf_token_name', csrf);
  params.set('draw', '1');
  for (let i = 0; i < 9; i++) {
    params.set(`columns[${i}][data]`, String(i));
    params.set(`columns[${i}][name]`, '');
    params.set(`columns[${i}][searchable]`, 'true');
    params.set(`columns[${i}][orderable]`, 'true');
    params.set(`columns[${i}][search][value]`, '');
    params.set(`columns[${i}][search][regex]`, 'false');
  }
  params.set('order[0][column]', '4');
  params.set('order[0][dir]', 'desc');
  params.set('start', '0');
  params.set('length', '50');
  params.set('search[value]', '');
  params.set('search[regex]', 'false');
  return params.toString();
}

async function postWorkspaceApi(url, body, referer, session) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: session.cookieHeader,
      Referer: referer
    },
    body
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Workspace HTTP ${response.status}: ${text.slice(0, 100)}`);
  return JSON.parse(text);
}

function parseTimesheetSummary(response) {
  const entries = (response.aaData || []).map((row) => ({
    task: parseHtmlText(row[0]),
    start: row[1] || '',
    end: row[2] || null,
    note: row[3] || '',
    project: parseProjectName(row[4]),
    duration: row[5] || '',
    decimal: parseFloat(row[6]) || 0
  }));
  const runningEntry = entries.find((e) => e.start && !e.end);
  return {
    totalHours: response.logged_time?.total_logged_time_h || '00:00',
    totalDecimal: parseFloat(response.logged_time?.total_logged_time_d) || 0,
    entries,
    runningEntry: runningEntry || null,
    syncedAt: new Date().toISOString()
  };
}

function parseTaskFromCell(cell) {
  if (!cell) return null;
  const idMatch = cell.match(/tasks\/view\/(\d+)/);
  if (!idMatch) return null;
  const nameMatch = cell.match(/main-tasks-table-href-name[^>]*>([^<]+)</);
  const projectMatch = cell.match(/task-table-related[^>]*>([^<]+)</);
  return {
    taskId: idMatch[1],
    taskName: nameMatch?.[1]?.trim() || 'Unknown task',
    projectName: projectMatch?.[1]?.trim() || '',
    isRunning: cell.includes('fa-clock') && cell.includes('text-danger')
  };
}

function parseTasksList(tasksResponse) {
  const seen = new Set();
  const tasks = [];
  for (const row of tasksResponse.aaData || []) {
    const cell = row['2'] || row[2] || '';
    const task = parseTaskFromCell(cell);
    if (!task || seen.has(task.taskId)) continue;
    seen.add(task.taskId);
    tasks.push(task);
  }
  return tasks;
}

function parseActiveTimer(tasksResponse) {
  for (const row of tasksResponse.aaData || []) {
    const cell = row['2'] || row[2] || '';
    if (cell.includes('fa-clock') && cell.includes('text-danger')) {
      return parseTaskFromCell(cell);
    }
  }
  return null;
}

function buildTimerTrackingBody(csrf, taskId, timerId = '', note = '') {
  const params = new URLSearchParams();
  params.set('csrf_token_name', csrf);
  params.set('task_id', String(taskId));
  params.set('timer_id', timerId || '');
  params.set('note', note || '');
  return params.toString();
}

export async function getWorkspaceSessionOrThrow(userId) {
  const session = await queries.getWorkspaceSession(userId);
  if (!session?.csrf) {
    const err = new Error('Workspace session not found. Open Workspace and sync credentials.');
    err.status = 400;
    throw err;
  }
  const hasSessionCookie = !!(
    session.cookies?.sp_session || session.cookies?.ci_session
  );
  if (!hasSessionCookie || !session.cookieHeader) {
    const err = new Error('Workspace session cookies incomplete. Re-open Workspace in Chrome and sync again.');
    err.status = 400;
    throw err;
  }
  return session;
}

export async function fetchWorkspaceStatus(userId) {
  const session = await getWorkspaceSessionOrThrow(userId);
  const [timesheetData, tasksData] = await Promise.all([
    postWorkspaceApi(WORKSPACE_TIMESHEETS_URL, buildTimesheetsBody(session.csrf), WORKSPACE_TIMESHEETS_URL, session),
    postWorkspaceApi(`${WORKSPACE_BASE}/admin/tasks/table`, buildTasksBody(session.csrf), `${WORKSPACE_BASE}/admin/tasks`, session)
  ]);

  const timesheet = parseTimesheetSummary(timesheetData);
  const activeTimer = parseActiveTimer(tasksData);
  const tasksList = parseTasksList(tasksData);

  return { success: true, timesheet, activeTimer, tasksList };
}

export async function startWorkspaceTimer(userId, taskId, note = '') {
  const session = await getWorkspaceSessionOrThrow(userId);
  const tasksData = await postWorkspaceApi(
    `${WORKSPACE_BASE}/admin/tasks/table`,
    buildTasksBody(session.csrf),
    `${WORKSPACE_BASE}/admin/tasks`,
    session
  );
  if (parseActiveTimer(tasksData)) {
    return { success: false, error: 'A timer is already running' };
  }

  await postWorkspaceApi(
    TIMER_TRACKING_URL,
    buildTimerTrackingBody(session.csrf, taskId, '', note),
    `${WORKSPACE_BASE}/admin/tasks`,
    session
  );

  return fetchWorkspaceStatus(userId);
}
