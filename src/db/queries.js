import { db } from "./index.js";

/**
 * Ensure a user exists, create if not
 * @param {string} telegramId
 * @param {string} [name]
 */
export async function ensureUser(telegramId, name) {
  await db.execute({
    sql: `INSERT INTO users (telegram_id, name) VALUES (?, ?)
          ON CONFLICT(telegram_id) DO UPDATE SET name = ?`,
    args: [telegramId, name || null, name || null],
  });
}

/**
 * Save a message to the database
 * @param {string} telegramId
 * @param {string} role - "user" or "assistant"
 * @param {string} content
 */
export async function saveMessage(telegramId, role, content) {
  await db.execute({
    sql: "INSERT INTO messages (telegram_id, role, content) VALUES (?, ?, ?)",
    args: [telegramId, role, content],
  });
}

/**
 * Get recent conversation history for a user
 * @param {string} telegramId
 * @param {number} [limit=20]
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
export async function getHistory(telegramId, limit = 20) {
  const result = await db.execute({
    sql: `SELECT role, content FROM messages
          WHERE telegram_id = ?
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [telegramId, limit],
  });
  // Reverse so oldest first (chronological order)
  return result.rows
    .map((r) => ({ role: r.role, content: r.content }))
    .reverse();
}

/**
 * Delete all messages for a user
 * @param {string} telegramId
 */
export async function clearHistory(telegramId) {
  await db.execute({
    sql: "DELETE FROM messages WHERE telegram_id = ?",
    args: [telegramId],
  });
}
