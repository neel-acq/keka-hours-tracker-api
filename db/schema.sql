-- Keka Hours Tracker API — append-only migrations
-- Run: node db/apply-migrations.mjs
-- Or paste only NEW @migration blocks into Supabase SQL Editor

-- @migration 001_initial
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extension_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keka_user_id TEXT NOT NULL UNIQUE,
  email TEXT,
  tenant_id TEXT,
  subdomain TEXT,
  display_name TEXT,
  last_seen_at TIMESTAMPTZ,
  extension_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES extension_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_captured_at ON auth_tokens(captured_at DESC);

CREATE TABLE IF NOT EXISTS attendance_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES extension_users(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  check_in TEXT,
  check_out TEXT,
  gross_hours TEXT,
  effective_hours TEXT,
  break_duration TEXT,
  status TEXT,
  shift_name TEXT,
  total_gross_hours NUMERIC,
  total_effective_hours NUMERIC,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS attendance_swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_day_id UUID NOT NULL REFERENCES attendance_days(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  swipe_type TEXT NOT NULL,
  swipe_time TEXT,
  premise TEXT,
  raw_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(attendance_day_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_attendance_days_user_date ON attendance_days(user_id, attendance_date);

-- @migration 002_workspace_sessions
CREATE TABLE IF NOT EXISTS workspace_sessions (
  user_id UUID PRIMARY KEY REFERENCES extension_users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  cookie_payload_encrypted TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- @migration 003_teams_credentials
CREATE TABLE IF NOT EXISTS teams_credentials (
  user_id UUID PRIMARY KEY REFERENCES extension_users(id) ON DELETE CASCADE,
  skype_token_encrypted TEXT,
  token_expiry TIMESTAMPTZ,
  from_id TEXT,
  display_name TEXT,
  conversation_id TEXT,
  prewritten_messages JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- @migration 004_user_alert_state
CREATE TABLE IF NOT EXISTS user_alert_state (
  user_id UUID PRIMARY KEY REFERENCES extension_users(id) ON DELETE CASCADE,
  last_workspace_start_alert_at BIGINT DEFAULT 0,
  workspace_stop_alert_sent_date TEXT DEFAULT '',
  effective_8h_notification_sent BOOLEAN DEFAULT false,
  target_exit_notification_sent BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- @migration 005_user_company_name
ALTER TABLE extension_users
  ADD COLUMN IF NOT EXISTS company_name TEXT;
