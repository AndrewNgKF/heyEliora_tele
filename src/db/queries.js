import { db } from "./index.js";
import { generateId } from "../utils/id.js";
import { getTierConfig, HARD_DAILY_CAP } from "../config/CONSTANTS.js";

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
 * @param {string} [baseline]
 * @param {string} [target]
 */
export async function saveGoal(telegramId, goal, baseline, target) {
  const id = generateId();
  await db.execute({
    sql: "INSERT INTO goals (id, telegram_id, goal, baseline, target) VALUES (?, ?, ?, ?, ?)",
    args: [id, telegramId, goal, baseline || null, target || null],
  });
}

/**
 * Get all active goals for a user
 * @param {string} telegramId
 * @returns {Promise<Array<{id: string, goal: string, baseline: string|null, target: string|null}>>}
 */
export async function getGoals(telegramId) {
  const result = await db.execute({
    sql: "SELECT id, goal, baseline, target FROM goals WHERE telegram_id = ? AND active = 1 ORDER BY created_at",
    args: [telegramId],
  });
  return result.rows.map((r) => ({
    id: r.id,
    goal: r.goal,
    baseline: r.baseline || null,
    target: r.target || null,
  }));
}

/**
 * Remove a goal by id
 * @param {string} telegramId
 * @param {string} goalId
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
 * @param {string} goalId
 * @param {string} newGoal
 * @param {string} [baseline]
 * @param {string} [target]
 */
export async function updateGoal(
  telegramId,
  goalId,
  newGoal,
  baseline,
  target,
) {
  await db.execute({
    sql: `UPDATE goals SET goal = ?, baseline = COALESCE(?, baseline), target = COALESCE(?, target)
          WHERE id = ? AND telegram_id = ? AND active = 1`,
    args: [newGoal, baseline || null, target || null, goalId, telegramId],
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
 * @param {string} goalId
 * @param {string} content
 */
export async function logProgress(telegramId, goalId, content) {
  const id = generateId();
  await db.execute({
    sql: "INSERT INTO goal_entries (id, telegram_id, goal_id, content) VALUES (?, ?, ?, ?)",
    args: [id, telegramId, goalId, content],
  });
}

/**
 * Get recent entries for a specific goal
 * @param {string} telegramId
 * @param {string} goalId
 * @param {number} [limit=10]
 * @returns {Promise<Array<{id: string, content: string, created_at: string}>>}
 */
export async function getEntriesByGoal(telegramId, goalId, limit = 10) {
  const result = await db.execute({
    sql: `SELECT id, content, created_at FROM goal_entries
          WHERE telegram_id = ? AND goal_id = ?
          ORDER BY created_at DESC LIMIT ?`,
    args: [telegramId, goalId, limit],
  });
  return result.rows.map((r) => ({
    id: r.id,
    content: r.content,
    created_at: r.created_at,
  }));
}

/**
 * Get all recent entries across all goals
 * @param {string} telegramId
 * @param {number} [limit=15]
 * @returns {Promise<Array<{id: string, goal_id: string, goal: string, content: string, created_at: string}>>}
 */
export async function getRecentProgress(telegramId, limit = 15) {
  const result = await db.execute({
    sql: `SELECT e.id, e.goal_id, g.goal, e.content, e.created_at
          FROM goal_entries e
          JOIN goals g ON e.goal_id = g.id
          WHERE e.telegram_id = ?
          ORDER BY e.created_at DESC LIMIT ?`,
    args: [telegramId, limit],
  });
  return result.rows.map((r) => ({
    id: r.id,
    goal_id: r.goal_id,
    goal: r.goal,
    content: r.content,
    created_at: r.created_at,
  }));
}

// --- Usage ---

/**
 * Get today's date string in the user's timezone
 * @param {string} timezone - IANA timezone (e.g. "America/New_York")
 * @returns {string} YYYY-MM-DD
 */
function getTodayForTimezone(timezone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date());
  } catch {
    // Invalid timezone — fall back to UTC
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Get user's tier and timezone
 * @param {string} telegramId
 * @returns {Promise<{ tier: string, timezone: string }>}
 */
export async function getUserMeta(telegramId) {
  const result = await db.execute({
    sql: "SELECT tier, timezone FROM users WHERE telegram_id = ?",
    args: [telegramId],
  });
  if (result.rows.length === 0) return { tier: "free", timezone: "UTC" };
  return {
    tier: result.rows[0].tier || "free",
    timezone: result.rows[0].timezone || "UTC",
  };
}

/**
 * Validate an IANA timezone string
 * @param {string} tz
 * @returns {boolean}
 */
export function isValidTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Set a user's timezone
 * @param {string} telegramId
 * @param {string} timezone - IANA timezone (e.g. "America/New_York")
 */
export async function setTimezone(telegramId, timezone) {
  await db.execute({
    sql: "UPDATE users SET timezone = ? WHERE telegram_id = ?",
    args: [timezone, telegramId],
  });
}

/**
 * Check if user can send a message (within daily limit).
 * @param {string} telegramId
 * @returns {Promise<{ allowed: boolean, remaining: number, limit: number }>}
 */
export async function checkUsage(telegramId) {
  const { tier, timezone } = await getUserMeta(telegramId);
  const config = getTierConfig(tier);
  const limit = Math.min(config.dailyLimit, HARD_DAILY_CAP);
  const today = getTodayForTimezone(timezone);

  const result = await db.execute({
    sql: "SELECT message_count FROM daily_usage WHERE telegram_id = ? AND usage_date = ?",
    args: [telegramId, today],
  });

  const count =
    result.rows.length > 0 ? Number(result.rows[0].message_count) : 0;
  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count),
    limit,
  };
}

/**
 * Increment the daily message count and token usage for a user
 * @param {string} telegramId
 * @param {number} [inputTokens=0]
 * @param {number} [outputTokens=0]
 */
export async function incrementUsage(
  telegramId,
  inputTokens = 0,
  outputTokens = 0,
) {
  const { timezone } = await getUserMeta(telegramId);
  const today = getTodayForTimezone(timezone);

  await db.execute({
    sql: `INSERT INTO daily_usage (telegram_id, usage_date, message_count, input_tokens, output_tokens)
          VALUES (?, ?, 1, ?, ?)
          ON CONFLICT(telegram_id, usage_date) DO UPDATE SET
            message_count = message_count + 1,
            input_tokens = input_tokens + ?,
            output_tokens = output_tokens + ?`,
    args: [
      telegramId,
      today,
      inputTokens,
      outputTokens,
      inputTokens,
      outputTokens,
    ],
  });
}

// --- Reminders ---

/**
 * Create a reminder or scheduled system nudge.
 * @param {string} telegramId
 * @param {{
 *   content: string,
 *   runAt: string,
 *   scheduleType?: "one_time"|"daily"|"weekly",
 *   kind?: string,
 *   source?: string,
 *   goalId?: string|null,
 * }} reminder
 * @returns {Promise<string>}
 */
export async function createReminder(telegramId, reminder) {
  const id = generateId();
  await db.execute({
    sql: `INSERT INTO reminders (
            id, telegram_id, kind, source, content, schedule_type,
            run_at, goal_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      telegramId,
      reminder.kind || "reminder",
      reminder.source || "user",
      reminder.content,
      reminder.scheduleType || "one_time",
      reminder.runAt,
      reminder.goalId || null,
    ],
  });
  return id;
}

/**
 * List reminders for a user.
 * @param {string} telegramId
 * @param {number} [limit=20]
 */
export async function listReminders(telegramId, limit = 20) {
  const result = await db.execute({
    sql: `SELECT id, kind, source, content, schedule_type, run_at, goal_id, status, sent_count
          FROM reminders
          WHERE telegram_id = ? AND status IN ('active', 'processing')
          ORDER BY run_at ASC
          LIMIT ?`,
    args: [telegramId, limit],
  });

  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    source: row.source,
    content: row.content,
    scheduleType: row.schedule_type,
    runAt: row.run_at,
    goalId: row.goal_id || null,
    status: row.status,
    sentCount: Number(row.sent_count || 0),
  }));
}

/**
 * Cancel a reminder for a user.
 * @param {string} telegramId
 * @param {string} reminderId
 */
export async function cancelReminder(telegramId, reminderId) {
  await db.execute({
    sql: `UPDATE reminders
          SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND telegram_id = ? AND status IN ('active', 'processing')`,
    args: [reminderId, telegramId],
  });
}

/**
 * Get due reminders.
 * @param {string} nowIso
 * @param {number} [limit=50]
 */
export async function getDueReminders(nowIso, limit = 50) {
  const result = await db.execute({
    sql: `SELECT id, telegram_id, kind, source, content, schedule_type, run_at, goal_id, sent_count
          FROM reminders
          WHERE status = 'active' AND run_at <= ?
          ORDER BY run_at ASC
          LIMIT ?`,
    args: [nowIso, limit],
  });

  return result.rows.map((row) => ({
    id: row.id,
    telegramId: row.telegram_id,
    kind: row.kind,
    source: row.source,
    content: row.content,
    scheduleType: row.schedule_type,
    runAt: row.run_at,
    goalId: row.goal_id || null,
    sentCount: Number(row.sent_count || 0),
  }));
}

/**
 * Claim a reminder before sending so concurrent cron runs don't duplicate it.
 * @param {string} reminderId
 * @param {string} nowIso
 * @returns {Promise<boolean>}
 */
export async function claimReminder(reminderId, nowIso) {
  const result = await db.execute({
    sql: `UPDATE reminders
          SET status = 'processing', updated_at = CURRENT_TIMESTAMP, last_error = NULL
          WHERE id = ? AND status = 'active' AND run_at <= ?`,
    args: [reminderId, nowIso],
  });
  return Number(result.rowsAffected || 0) > 0;
}

/**
 * Mark a reminder as delivered and optionally schedule the next run.
 * @param {string} reminderId
 * @param {string|null} nextRunAt
 */
export async function completeReminder(reminderId, nextRunAt) {
  await db.execute({
    sql: `UPDATE reminders
          SET status = CASE WHEN ? IS NULL THEN 'sent' ELSE 'active' END,
              run_at = COALESCE(?, run_at),
              last_sent_at = CURRENT_TIMESTAMP,
              sent_count = sent_count + 1,
              updated_at = CURRENT_TIMESTAMP,
              last_error = NULL
          WHERE id = ?`,
    args: [nextRunAt, nextRunAt, reminderId],
  });
}

/**
 * Return a claimed reminder back to the queue after a send failure.
 * @param {string} reminderId
 * @param {string} errorMessage
 */
export async function failReminder(reminderId, errorMessage) {
  await db.execute({
    sql: `UPDATE reminders
          SET status = 'active',
              last_error = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
    args: [errorMessage.slice(0, 500), reminderId],
  });
}
