#!/usr/bin/env node
/**
 * Applies only unapplied @migration blocks from db/schema.sql
 * Usage: node db/apply-migrations.mjs
 * Requires: SUPABASE_DB_URL in .env or environment
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

function parseMigrations(sql) {
  const blocks = [];
  const regex = /-- @migration (\S+)\s*\n([\s\S]*?)(?=\n-- @migration |\s*$)/g;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    blocks.push({ version: match[1], sql: match[2].trim() });
  }
  return blocks;
}

async function main() {
  loadEnvFile();
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const migrations = parseMigrations(sql);

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { rows: applied } = await client.query('SELECT version FROM schema_migrations');
  const appliedSet = new Set(applied.map((r) => r.version));

  for (const m of migrations) {
    if (appliedSet.has(m.version)) {
      console.log(`skip ${m.version} (already applied)`);
      continue;
    }
    console.log(`apply ${m.version}...`);
    await client.query('BEGIN');
    try {
      await client.query(m.sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
        [m.version]
      );
      await client.query('COMMIT');
      console.log(`ok ${m.version}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`failed ${m.version}:`, err.message);
      process.exit(1);
    }
  }

  await client.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
