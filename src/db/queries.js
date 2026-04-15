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

// --- Goals ---

/**
 * Add a goal for a user
 * @param {string} telegramId
 * @param {string} goal
 */
export async function addGoal(telegramId, goal) {
  await db.execute({
    sql: "INSERT INTO goals (telegram_id, goal) VALUES (?, ?)",
    args: [telegramId, goal],
  });
}

/**
 * Get all active goals for a user
 * @param {string} telegramId
 * @returns {Promise<Array<{id: number, goal: string}>>}
 */
export async function getGoals(telegramId) {
  const result = await db.execute({
    sql: "SELECT id, goal FROM goals WHERE telegram_id = ? AND active = 1 ORDER BY created_at",
    args: [telegramId],
  });
  return result.rows.map((r) => ({ id: Number(r.id), goal: r.goal }));
}

/**
 * Remove a goal by id
 * @param {string} telegramId
 * @param {number} goalId
 */
export async function removeGoal(telegramId, goalId) {
  await db.execute({
    sql: "UPDATE goals SET active = 0 WHERE id = ? AND telegram_id = ?",
    args: [goalId, telegramId],
  });
}

/**
 * Update an existing goal
 * @param {string} telegramId
 * @param {number} goalId
 * @param {string} newGoal
 */
export async function updateGoal(telegramId, goalId, newGoal) {
  await db.execute({
    sql: "UPDATE goals SET goal = ? WHERE id = ? AND telegram_id = ? AND active = 1",
    args: [newGoal, goalId, telegramId],
  });
}

// --- Preferences ---

/**
 * Set or update user preferences
 * @param {string} telegramId
 * @param {{workStyle?: string, tone?: string, schedulePref?: string}} prefs
 */
export async function setPreferences(telegramId, prefs) {
  await db.execute({
    sql: `INSERT INTO preferences (telegram_id, work_style, tone, schedule_pref, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(telegram_id) DO UPDATE SET
            work_style = COALESCE(?, work_style),
            tone = COALESCE(?, tone),
            schedule_pref = COALESCE(?, schedule_pref),
            updated_at = CURRENT_TIMESTAMP`,
    args: [
      telegramId,
      prefs.workStyle || null,
      prefs.tone || null,
      prefs.schedulePref || null,
      prefs.workStyle || null,
      prefs.tone || null,
      prefs.schedulePref || null,
    ],
  });
}

/**
 * Get user preferences
 * @param {string} telegramId
 * @returns {Promise<{workStyle: string|null, tone: string|null, schedulePref: string|null}|null>}
 */
export async function getPreferences(telegramId) {
  const result = await db.execute({
    sql: "SELECT work_style, tone, schedule_pref FROM preferences WHERE telegram_id = ?",
    args: [telegramId],
  });
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    workStyle: r.work_style,
    tone: r.tone,
    schedulePref: r.schedule_pref,
  };
}

// --- Entries ---

/**
 * Add a progress entry tied to a goal
 * @param {string} telegramId
 * @param {number} goalId
 * @param {string} content
 */
export async function addEntry(telegramId, goalId, content) {
  await db.execute({
    sql: "INSERT INTO goal_entries (telegram_id, goal_id, content) VALUES (?, ?, ?)",
    args: [telegramId, goalId, content],
  });
}

/**
 * Get recent entries for a specific goal
 * @param {string} telegramId
 * @param {number} goalId
 * @param {number} [limit=10]
 * @returns {Promise<Array<{id: number, content: string, created_at: string}>>}
 */
export async function getEntriesByGoal(telegramId, goalId, limit = 10) {
  const result = await db.execute({
    sql: `SELECT id, content, created_at FROM goal_entries
          WHERE telegram_id = ? AND goal_id = ?
          ORDER BY created_at DESC LIMIT ?`,
    args: [telegramId, goalId, limit],
  });
  return result.rows.map((r) => ({
    id: Number(r.id),
    content: r.content,
    created_at: r.created_at,
  }));
}

/**
 * Get all recent entries across all goals
 * @param {string} telegramId
 * @param {number} [limit=15]
 * @returns {Promise<Array<{id: number, goal_id: number, goal: string, content: string, created_at: string}>>}
 */
export async function getRecentEntries(telegramId, limit = 15) {
  const result = await db.execute({
    sql: `SELECT e.id, e.goal_id, g.goal, e.content, e.created_at
          FROM goal_entries e
          JOIN goals g ON e.goal_id = g.id
          WHERE e.telegram_id = ?
          ORDER BY e.created_at DESC LIMIT ?`,
    args: [telegramId, limit],
  });
  return result.rows.map((r) => ({
    id: Number(r.id),
    goal_id: Number(r.goal_id),
    goal: r.goal,
    content: r.content,
    created_at: r.created_at,
  }));
}
