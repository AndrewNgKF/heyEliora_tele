import { createClient } from "@libsql/client";

const url = process.env.TURSO_URL;
if (!url) throw new Error("TURSO_URL is required in .env");

export const db = createClient({
  url,
  authToken: process.env.TURSO_TOKEN,
});

/**
 * Create tables if they don't exist
 */
export async function initDb() {
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
  ]);

  console.log("[eliora] database initialized");
}
