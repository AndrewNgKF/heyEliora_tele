import { createClient } from "@libsql/client";
import { vi } from "vitest";

/**
 * Creates a fresh in-memory libsql client and mocks `src/db/index.js`
 * so all queries hit this ephemeral DB.
 * Call in beforeEach so each test gets a clean slate.
 */
export async function setupTestDb() {
  const db = createClient({ url: "file::memory:" });

  // Create schema (mirrors src/db/index.js initDb)
  await db.execute("PRAGMA foreign_keys = ON");
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      name TEXT,
      tier TEXT DEFAULT 'free',
      timezone TEXT DEFAULT 'UTC',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(telegram_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      goal TEXT NOT NULL,
      baseline TEXT,
      target TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(telegram_id, active)`,
    `CREATE TABLE IF NOT EXISTS preferences (
      telegram_id TEXT PRIMARY KEY,
      work_style TEXT,
      tone TEXT,
      schedule_pref TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS goal_entries (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_entries_user ON goal_entries(telegram_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_entries_goal ON goal_entries(goal_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS daily_usage (
      telegram_id TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      PRIMARY KEY (telegram_id, usage_date)
    )`,
    `CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'reminder',
      source TEXT NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      schedule_type TEXT NOT NULL DEFAULT 'one_time',
      run_at TEXT NOT NULL,
      goal_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_sent_at TEXT,
      sent_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_status ON scheduled_messages(telegram_id, status, run_at)`,
    `CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due ON scheduled_messages(status, run_at)`,
    `CREATE TABLE IF NOT EXISTS nudge_settings (
      telegram_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      frequency TEXT NOT NULL DEFAULT 'every_3_days',
      quiet_start TEXT DEFAULT '22:00',
      quiet_end TEXT DEFAULT '08:00',
      last_nudge_at TEXT,
      next_nudge_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_summary (
      telegram_id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      messages_at_summary INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ]);

  return db;
}
