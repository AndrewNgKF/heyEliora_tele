import { db } from "./index.js";
import { generateId } from "../utils/id.js";
import {
  HARD_DAILY_CAP,
  FREE_TRIAL_DAYS,
  FREE_TRIAL_DAILY_LIMIT,
  getTierConfig,
} from "../config/CONSTANTS.js";

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

/**
 * Delete everything about a user except their profile in `users`
 * and their usage counts in `daily_usage` (prevents trial abuse).
 * @param {string} telegramId
 */
export async function forgetUser(telegramId) {
  const tables = [
    "messages",
    "goals",
    "preferences",
    "goal_entries",
    "scheduled_messages",
    "nudge_settings",
    "user_summary",
  ];
  await Promise.all(
    tables.map((t) =>
      db.execute({
        sql: `DELETE FROM ${t} WHERE telegram_id = ?`,
        args: [telegramId],
      }),
    ),
  );
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

/**
 * Get the user's current check-in streak (consecutive days with entries)
 * and total entries in the last 7 days.
 * @param {string} telegramId
 * @param {string} [timezone="UTC"]
 * @returns {Promise<{ streak: number, weekTotal: number }>}
 */
export async function getActivityStreak(telegramId, timezone = "UTC") {
  // Get distinct dates with entries in the last 30 days
  const result = await db.execute({
    sql: `SELECT DISTINCT date(e.created_at) as entry_date
          FROM goal_entries e
          WHERE e.telegram_id = ?
            AND e.created_at > datetime('now', '-30 days')
          ORDER BY entry_date DESC`,
    args: [telegramId],
  });

  const dates = result.rows.map((r) => r.entry_date);
  if (dates.length === 0) return { streak: 0, weekTotal: 0 };

  // Calculate streak: count consecutive days backward from today
  let today;
  try {
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    today = new Date().toISOString().slice(0, 10);
  }

  let streak = 0;
  const dateSet = new Set(dates);
  const d = new Date(today + "T00:00:00Z");
  // Allow today or yesterday as the start
  if (!dateSet.has(today)) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (!dateSet.has(d.toISOString().slice(0, 10)))
      return { streak: 0, weekTotal: dates.length };
  }
  while (dateSet.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }

  // Count entries in last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekDates = dates.filter(
    (dt) => dt >= weekAgo.toISOString().slice(0, 10),
  );

  return { streak, weekTotal: weekDates.length };
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
    sql: "SELECT tier, timezone, created_at FROM users WHERE telegram_id = ?",
    args: [telegramId],
  });
  if (result.rows.length === 0)
    return { tier: "free", timezone: "UTC", createdAt: null };
  return {
    tier: result.rows[0].tier || "free",
    timezone: result.rows[0].timezone || "UTC",
    createdAt: result.rows[0].created_at || null,
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
  const { tier, timezone, createdAt } = await getUserMeta(telegramId);
  const config = getTierConfig(tier);

  let effectiveLimit = config.dailyLimit;
  if (tier === "free" && createdAt) {
    const ageMs = Date.now() - new Date(createdAt + "Z").getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= FREE_TRIAL_DAYS) effectiveLimit = FREE_TRIAL_DAILY_LIMIT;
  }
  const limit = Math.min(effectiveLimit, HARD_DAILY_CAP);
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

// --- Scheduled Messages (reminders + nudges) ---

/**
 * Create a scheduled message (reminder or system nudge).
 * @param {string} telegramId
 * @param {{
 *   content: string,
 *   runAt: string,
 *   scheduleType?: "one_time"|"daily"|"weekly",
 *   kind?: string,
 *   source?: string,
 *   goalId?: string|null,
 * }} msg
 * @returns {Promise<string>}
 */
export async function createScheduledMessage(telegramId, msg) {
  const id = generateId();
  await db.execute({
    sql: `INSERT INTO scheduled_messages (
            id, telegram_id, kind, source, content, schedule_type,
            run_at, goal_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      telegramId,
      msg.kind || "reminder",
      msg.source || "user",
      msg.content,
      msg.scheduleType || "one_time",
      msg.runAt,
      msg.goalId || null,
    ],
  });
  return id;
}

/**
 * List user-created reminders (excludes system nudges).
 * @param {string} telegramId
 * @param {number} [limit=20]
 */
export async function listReminders(telegramId, limit = 20) {
  const result = await db.execute({
    sql: `SELECT id, kind, source, content, schedule_type, run_at, goal_id, status, sent_count
          FROM scheduled_messages
          WHERE telegram_id = ? AND status IN ('active', 'processing') AND source = 'user'
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
 * Cancel a scheduled message for a user.
 * @param {string} telegramId
 * @param {string} reminderId
 */
export async function cancelReminder(telegramId, reminderId) {
  await db.execute({
    sql: `UPDATE scheduled_messages
          SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND telegram_id = ? AND status IN ('active', 'processing')`,
    args: [reminderId, telegramId],
  });
}

/**
 * Update a reminder's time, content, or schedule type.
 * @param {string} telegramId
 * @param {string} reminderId
 * @param {{ content?: string, runAt?: string, scheduleType?: string }} fields
 */
export async function updateReminder(telegramId, reminderId, fields) {
  const sets = [];
  const args = [];

  if (fields.content) {
    sets.push("content = ?");
    args.push(fields.content);
  }
  if (fields.runAt) {
    sets.push("run_at = ?");
    args.push(fields.runAt);
  }
  if (fields.scheduleType) {
    sets.push("schedule_type = ?");
    args.push(fields.scheduleType);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = CURRENT_TIMESTAMP");
  args.push(reminderId, telegramId);

  await db.execute({
    sql: `UPDATE scheduled_messages SET ${sets.join(", ")} WHERE id = ? AND telegram_id = ? AND status = 'active'`,
    args,
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
          FROM scheduled_messages
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
    sql: `UPDATE scheduled_messages
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
    sql: `UPDATE scheduled_messages
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
    sql: `UPDATE scheduled_messages
          SET status = 'active',
              last_error = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
    args: [errorMessage.slice(0, 500), reminderId],
  });
}

// --- Nudge Settings ---

/**
 * Get nudge settings for a user (returns defaults if not set).
 * @param {string} telegramId
 * @returns {Promise<{enabled: boolean, frequency: string, quietStart: string, quietEnd: string, lastNudgeAt: string|null}>}
 */
export async function getNudgeSettings(telegramId) {
  const result = await db.execute({
    sql: "SELECT enabled, frequency, quiet_start, quiet_end, last_nudge_at, next_nudge_at FROM nudge_settings WHERE telegram_id = ?",
    args: [telegramId],
  });
  if (result.rows.length === 0) {
    return {
      enabled: true,
      frequency: "every_3_days",
      quietStart: "22:00",
      quietEnd: "08:00",
      lastNudgeAt: null,
      nextNudgeAt: null,
    };
  }
  const r = result.rows[0];
  return {
    enabled: Boolean(r.enabled),
    frequency: r.frequency,
    quietStart: r.quiet_start,
    quietEnd: r.quiet_end,
    lastNudgeAt: r.last_nudge_at || null,
    nextNudgeAt: r.next_nudge_at || null,
  };
}

/**
 * Update nudge settings for a user (upsert).
 * @param {string} telegramId
 * @param {{enabled?: boolean, frequency?: string, quietStart?: string, quietEnd?: string}} settings
 */
export async function updateNudgeSettings(telegramId, settings) {
  await db.execute({
    sql: `INSERT INTO nudge_settings (telegram_id, enabled, frequency, quiet_start, quiet_end, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(telegram_id) DO UPDATE SET
            enabled = COALESCE(?, enabled),
            frequency = COALESCE(?, frequency),
            quiet_start = COALESCE(?, quiet_start),
            quiet_end = COALESCE(?, quiet_end),
            updated_at = CURRENT_TIMESTAMP`,
    args: [
      telegramId,
      settings.enabled != null ? (settings.enabled ? 1 : 0) : 1,
      settings.frequency || "every_3_days",
      settings.quietStart || "22:00",
      settings.quietEnd || "08:00",
      settings.enabled != null ? (settings.enabled ? 1 : 0) : null,
      settings.frequency || null,
      settings.quietStart || null,
      settings.quietEnd || null,
    ],
  });

  // Recalculate next_nudge_at based on new settings
  await recalculateNextNudgeAt(telegramId);
}

/**
 * Mark that a nudge was just sent to a user (upsert — creates row if none exists).
 * @param {string} telegramId
 */
export async function markNudgeSent(telegramId) {
  await db.execute({
    sql: `INSERT INTO nudge_settings (telegram_id, last_nudge_at, next_nudge_at, updated_at)
          VALUES (
            ?,
            CURRENT_TIMESTAMP,
            datetime('now', '+3 days'),
            CURRENT_TIMESTAMP
          )
          ON CONFLICT(telegram_id) DO UPDATE SET
            last_nudge_at = CURRENT_TIMESTAMP,
            next_nudge_at = datetime('now', '+' || CASE frequency
              WHEN 'daily' THEN '1'
              WHEN 'every_3_days' THEN '3'
              WHEN 'weekly' THEN '7'
              ELSE '3'
            END || ' days'),
            updated_at = CURRENT_TIMESTAMP`,
    args: [telegramId],
  });
}

/**
 * Get all users eligible for nudge evaluation.
 * Returns users who have nudges enabled and aren't in a cooldown period.
 * @returns {Promise<Array<{telegramId: string, timezone: string, frequency: string, quietStart: string, quietEnd: string, lastNudgeAt: string|null, lastMessageAt: string|null}>>}
 */
export async function getNudgeCandidates() {
  const result = await db.execute({
    sql: `SELECT
            u.telegram_id,
            u.timezone,
            COALESCE(ns.frequency, 'every_3_days') AS frequency,
            COALESCE(ns.quiet_start, '22:00') AS quiet_start,
            COALESCE(ns.quiet_end, '08:00') AS quiet_end,
            ns.last_nudge_at
          FROM users u
          LEFT JOIN nudge_settings ns ON u.telegram_id = ns.telegram_id
          WHERE COALESCE(ns.enabled, 1) = 1
            AND (
              ns.next_nudge_at IS NULL
              OR ns.next_nudge_at <= datetime('now')
            )
            AND EXISTS (
              SELECT 1 FROM messages m
              WHERE m.telegram_id = u.telegram_id
                AND m.role = 'user'
                AND m.created_at > datetime('now', '-30 days')
            )`,
  });

  return result.rows.map((r) => ({
    telegramId: r.telegram_id,
    timezone: r.timezone || "UTC",
    frequency: r.frequency,
    quietStart: r.quiet_start,
    quietEnd: r.quiet_end,
    lastNudgeAt: r.last_nudge_at || null,
  }));
}

/**
 * Check if a user already has a pending nudge.
 * @param {string} telegramId
 * @returns {Promise<boolean>}
 */
export async function hasPendingNudge(telegramId) {
  const result = await db.execute({
    sql: `SELECT 1 FROM scheduled_messages
          WHERE telegram_id = ? AND kind = 'nudge' AND status IN ('active', 'processing')
          LIMIT 1`,
    args: [telegramId],
  });
  return result.rows.length > 0;
}

/**
 * Recalculate next_nudge_at based on the user's current frequency.
 * Called after settings change or after a nudge is sent.
 * @param {string} telegramId
 */
export async function recalculateNextNudgeAt(telegramId) {
  await db.execute({
    sql: `UPDATE nudge_settings SET
            next_nudge_at = CASE WHEN enabled = 1
              THEN datetime('now', '+' || CASE frequency
                WHEN 'daily' THEN '1'
                WHEN 'every_3_days' THEN '3'
                WHEN 'weekly' THEN '7'
                ELSE '3'
              END || ' days')
              ELSE NULL
            END,
            updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ?`,
    args: [telegramId],
  });
}

/**
 * Push next_nudge_at forward from now (called when user sends a message — they're active, no nudge needed yet).
 * Only updates if a row exists and nudges are enabled.
 * @param {string} telegramId
 */
export async function resetNextNudgeAt(telegramId) {
  await db.execute({
    sql: `UPDATE nudge_settings SET
            next_nudge_at = datetime('now', '+' || CASE frequency
              WHEN 'daily' THEN '1'
              WHEN 'every_3_days' THEN '3'
              WHEN 'weekly' THEN '7'
              ELSE '3'
            END || ' days'),
            updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = ? AND enabled = 1`,
    args: [telegramId],
  });
}

// --- User Summary ---

/**
 * Get the user's rolling summary.
 * @param {string} telegramId
 * @returns {Promise<{summary: string, messagesAtSummary: number} | null>}
 */
export async function getUserSummary(telegramId) {
  const result = await db.execute({
    sql: "SELECT summary, messages_at_summary FROM user_summary WHERE telegram_id = ?",
    args: [telegramId],
  });
  if (result.rows.length === 0) return null;
  return {
    summary: result.rows[0].summary,
    messagesAtSummary: Number(result.rows[0].messages_at_summary),
  };
}

/**
 * Upsert the user's rolling summary.
 * @param {string} telegramId
 * @param {string} summary
 * @param {number} messageCount - total message count at time of summarization
 */
export async function upsertUserSummary(telegramId, summary, messageCount) {
  await db.execute({
    sql: `INSERT INTO user_summary (telegram_id, summary, messages_at_summary, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(telegram_id) DO UPDATE SET
            summary = ?,
            messages_at_summary = ?,
            updated_at = CURRENT_TIMESTAMP`,
    args: [telegramId, summary, messageCount, summary, messageCount],
  });
}

/**
 * Get total message count for a user (user messages only).
 * @param {string} telegramId
 * @returns {Promise<number>}
 */
export async function getMessageCount(telegramId) {
  const result = await db.execute({
    sql: "SELECT COUNT(*) as count FROM messages WHERE telegram_id = ? AND role = 'user'",
    args: [telegramId],
  });
  return Number(result.rows[0].count);
}
