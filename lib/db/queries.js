/**
 * All Supabase DB queries — single file per project convention.
 */
import { getSupabase } from '../supabase.js';
import { encrypt, decrypt } from '../crypto.js';

// --- Users ---

function pickNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export async function upsertUser(userInfo) {
  const sb = getSupabase();
  const existing = userInfo.keka_user_id
    ? await getUserByKekaId(userInfo.keka_user_id)
    : null;

  const row = {
    keka_user_id: userInfo.keka_user_id,
    email: userInfo.email ?? existing?.email ?? null,
    tenant_id: userInfo.tenant_id ?? existing?.tenant_id ?? null,
    subdomain: userInfo.subdomain ?? existing?.subdomain ?? null,
    display_name: pickNonEmptyString(userInfo.display_name, existing?.display_name),
    company_name: pickNonEmptyString(userInfo.company_name, existing?.company_name),
    extension_version: userInfo.extension_version ?? null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await sb
    .from('extension_users')
    .upsert(row, { onConflict: 'keka_user_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (row.display_name) {
    await sb
      .from('teams_credentials')
      .update({
        display_name: row.display_name,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', data.id);
  }

  return data;
}

export async function updateUserProfile(kekaUserId, profile) {
  const display_name = pickNonEmptyString(profile?.display_name);
  const company_name = pickNonEmptyString(profile?.company_name);
  if (!display_name && !company_name) return null;

  const sb = getSupabase();
  const existing = await getUserByKekaId(kekaUserId);
  if (!existing) return null;

  const row = {
    display_name: display_name || existing.display_name,
    company_name: company_name || existing.company_name,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from('extension_users')
    .update(row)
    .eq('keka_user_id', kekaUserId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (row.display_name) {
    await sb
      .from('teams_credentials')
      .update({
        display_name: row.display_name,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', data.id);
  }

  return data;
}

export async function getUserByKekaId(kekaUserId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('extension_users')
    .select('*')
    .eq('keka_user_id', kekaUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// --- Auth tokens ---

export async function saveToken(userId, token, source, expiresAt) {
  const sb = getSupabase();
  const { data: latest } = await sb
    .from('auth_tokens')
    .select('token')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.token === token) return false;

  const { error } = await sb.from('auth_tokens').insert({
    user_id: userId,
    token,
    source: source || 'unknown',
    expires_at: expiresAt,
    captured_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function getLatestToken(userId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('auth_tokens')
    .select('token, expires_at, captured_at')
    .eq('user_id', userId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// --- Attendance ---

export async function upsertAttendanceDay(userId, dayRecord) {
  const sb = getSupabase();
  const { swipes, ...dayFields } = dayRecord;

  const { data: dayRow, error } = await sb
    .from('attendance_days')
    .upsert(
      { user_id: userId, ...dayFields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,attendance_date' }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (!swipes?.length) {
    return { dayDate: dayFields.attendance_date, swipeCount: 0 };
  }

  const swipeRows = swipes.map((s) => ({
    attendance_day_id: dayRow.id,
    sequence: s.sequence,
    swipe_type: s.swipe_type,
    swipe_time: s.swipe_time,
    premise: s.premise,
    raw_timestamp: s.raw_timestamp
  }));

  const { error: swipeErr } = await sb
    .from('attendance_swipes')
    .upsert(swipeRows, { onConflict: 'attendance_day_id,sequence' });
  if (swipeErr) throw new Error(swipeErr.message);

  return { dayDate: dayFields.attendance_date, swipeCount: swipes.length };
}

export async function getAttendanceDays(userId, fromDate, toDate) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('attendance_days')
    .select('*, attendance_swipes(*)')
    .eq('user_id', userId)
    .gte('attendance_date', fromDate)
    .lte('attendance_date', toDate)
    .order('attendance_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// --- Workspace sessions ---

export async function upsertWorkspaceSession(userId, csrfToken, cookiePayload, expiresAt) {
  const sb = getSupabase();
  const encrypted = encrypt(JSON.stringify(cookiePayload));
  const { error } = await sb.from('workspace_sessions').upsert({
    user_id: userId,
    csrf_token: csrfToken,
    cookie_payload_encrypted: encrypted,
    expires_at: expiresAt || null,
    updated_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
}

export async function getWorkspaceSession(userId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('workspace_sessions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  let cookies = {};
  try {
    cookies = JSON.parse(decrypt(data.cookie_payload_encrypted));
  } catch {
    return null;
  }
  return {
    csrf: data.csrf_token,
    cookies,
    cookieHeader: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
    updatedAt: data.updated_at,
    expiresAt: data.expires_at
  };
}

// --- Teams credentials ---

export async function upsertTeamsCredentials(userId, creds) {
  const sb = getSupabase();
  const { data: existing } = await sb
    .from('teams_credentials')
    .select('from_id, display_name, conversation_id, prewritten_messages, token_expiry')
    .eq('user_id', userId)
    .maybeSingle();

  const row = {
    user_id: userId,
    updated_at: new Date().toISOString()
  };

  if (creds.skypeToken) row.skype_token_encrypted = encrypt(creds.skypeToken);
  row.token_expiry = creds.tokenExpiry ?? existing?.token_expiry ?? null;
  row.from_id = creds.fromId !== undefined && creds.fromId !== null
    ? creds.fromId
    : (existing?.from_id ?? null);
  row.display_name = creds.displayName !== undefined && creds.displayName !== null
    ? creds.displayName
    : (existing?.display_name ?? null);
  row.conversation_id = creds.conversationId !== undefined && creds.conversationId !== null
    ? creds.conversationId
    : (existing?.conversation_id ?? null);
  row.prewritten_messages = creds.prewrittenMessages !== undefined
    ? creds.prewrittenMessages
    : (existing?.prewritten_messages ?? []);

  const { error } = await sb.from('teams_credentials').upsert(row);
  if (error) throw new Error(error.message);
}

export async function getTeamsCredentials(userId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('teams_credentials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  let skypeToken = null;
  if (data.skype_token_encrypted) {
    try {
      skypeToken = decrypt(data.skype_token_encrypted);
    } catch {
      return null;
    }
  }
  return {
    skypeToken,
    tokenExpiry: data.token_expiry,
    fromId: data.from_id,
    displayName: data.display_name,
    conversationId: data.conversation_id,
    prewrittenMessages: data.prewritten_messages || []
  };
}

// --- Alert state ---

export async function getAlertState(userId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('user_alert_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || {
    last_workspace_start_alert_at: 0,
    workspace_stop_alert_sent_date: '',
    effective_8h_notification_sent: false,
    target_exit_notification_sent: false
  };
}

export async function upsertAlertState(userId, patch) {
  const sb = getSupabase();
  const { error } = await sb.from('user_alert_state').upsert({
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
}

// --- User preferences (stored as JSON on extension_users metadata later; for now alert state only) ---

export async function getUserPreferences(userId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('user_alert_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// --- Admin / Reset ---

export async function clearAllData() {
  const sb = getSupabase();
  const tablesWithId = [
    'attendance_swipes',
    'attendance_days',
    'auth_tokens',
    'extension_users'
  ];
  const tablesWithUserId = [
    'workspace_sessions',
    'teams_credentials',
    'user_alert_state'
  ];

  for (const table of tablesWithId) {
    const { error } = await sb.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
  }
  for (const table of tablesWithUserId) {
    const { error } = await sb.from(table).delete().not('user_id', 'is', null);
    if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
  }
}

