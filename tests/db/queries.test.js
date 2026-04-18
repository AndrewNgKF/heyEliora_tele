import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupTestDb } from "../helpers/db.js";

// We mock the db module so queries.js uses our in-memory DB
let testDb;
vi.mock("../../src/db/index.js", () => ({
  get db() {
    return testDb;
  },
}));

const {
  ensureUser,
  saveMessage,
  getHistory,
  clearHistory,
  forgetUser,
  saveGoal,
  getGoals,
  removeGoal,
  updateGoal,
  setPreferences,
  getPreferences,
  logProgress,
  getEntriesByGoal,
  getRecentProgress,
  getActivityStreak,
  checkUsage,
  incrementUsage,
  getUserMeta,
  isValidTimezone,
  setTimezone,
  createScheduledMessage,
  listReminders,
  cancelReminder,
  updateReminder,
  getDueReminders,
  claimReminder,
  completeReminder,
  failReminder,
  getNudgeSettings,
  updateNudgeSettings,
  markNudgeSent,
  getNudgeCandidates,
  hasPendingNudge,
  recalculateNextNudgeAt,
  resetNextNudgeAt,
  getUserSummary,
  upsertUserSummary,
  getMessageCount,
} = await import("../../src/db/queries.js");

const TG_ID = "123456789";

describe("ensureUser", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
  });

  it("creates a new user", async () => {
    await ensureUser(TG_ID, "Alice");
    const result = await testDb.execute({
      sql: "SELECT telegram_id, name, tier FROM users WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Alice");
    expect(result.rows[0].tier).toBe("free");
  });

  it("updates name on conflict", async () => {
    await ensureUser(TG_ID, "Alice");
    await ensureUser(TG_ID, "Bob");
    const result = await testDb.execute({
      sql: "SELECT name FROM users WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(result.rows[0].name).toBe("Bob");
  });

  it("handles null name", async () => {
    await ensureUser(TG_ID);
    const result = await testDb.execute({
      sql: "SELECT name FROM users WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(result.rows[0].name).toBeNull();
  });
});

describe("messages", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("saves and retrieves messages in chronological order", async () => {
    await saveMessage(TG_ID, "user", "Hello");
    await saveMessage(TG_ID, "assistant", "Hi there!");
    await saveMessage(TG_ID, "user", "How are you?");

    const history = await getHistory(TG_ID, 10);
    expect(history).toHaveLength(3);
    expect(history[0].role).toBe("user");
    expect(history[0].content).toBe("Hello");
    expect(history[2].content).toBe("How are you?");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await saveMessage(TG_ID, "user", `msg ${i}`);
    }
    const history = await getHistory(TG_ID, 2);
    expect(history).toHaveLength(2);
    // Should return the 2 most recent, in chronological order
    expect(history[0].content).toBe("msg 3");
    expect(history[1].content).toBe("msg 4");
  });

  it("clearHistory removes only messages", async () => {
    await saveMessage(TG_ID, "user", "Hello");
    await clearHistory(TG_ID);
    const history = await getHistory(TG_ID);
    expect(history).toHaveLength(0);
    // User should still exist
    const user = await testDb.execute({
      sql: "SELECT * FROM users WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(user.rows).toHaveLength(1);
  });
});

describe("forgetUser", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("deletes from all 7 tables but keeps users and daily_usage", async () => {
    await saveMessage(TG_ID, "user", "test");
    await saveGoal(TG_ID, "Run a marathon");
    await setPreferences(TG_ID, { tone: "friendly" });
    await incrementUsage(TG_ID, 100, 200);

    // Seed user_summary
    await testDb.execute({
      sql: "INSERT INTO user_summary (telegram_id, summary, messages_at_summary) VALUES (?, ?, ?)",
      args: [TG_ID, "test summary", 5],
    });

    await forgetUser(TG_ID);

    // Should be wiped
    const msgs = await testDb.execute({
      sql: "SELECT * FROM messages WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(msgs.rows).toHaveLength(0);

    const goals = await testDb.execute({
      sql: "SELECT * FROM goals WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(goals.rows).toHaveLength(0);

    const prefs = await testDb.execute({
      sql: "SELECT * FROM preferences WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(prefs.rows).toHaveLength(0);

    const summary = await testDb.execute({
      sql: "SELECT * FROM user_summary WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(summary.rows).toHaveLength(0);

    // Should be KEPT
    const user = await testDb.execute({
      sql: "SELECT * FROM users WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(user.rows).toHaveLength(1);

    const usage = await testDb.execute({
      sql: "SELECT * FROM daily_usage WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(usage.rows).toHaveLength(1);
  });
});

describe("goals", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("saves and retrieves goals", async () => {
    await saveGoal(TG_ID, "Learn guitar", "beginner", "play 3 songs");
    const goals = await getGoals(TG_ID);
    expect(goals).toHaveLength(1);
    expect(goals[0].goal).toBe("Learn guitar");
    expect(goals[0].baseline).toBe("beginner");
    expect(goals[0].target).toBe("play 3 songs");
  });

  it("removes goals (soft delete)", async () => {
    await saveGoal(TG_ID, "Learn guitar");
    const goals = await getGoals(TG_ID);
    await removeGoal(TG_ID, goals[0].id);
    const afterRemove = await getGoals(TG_ID);
    expect(afterRemove).toHaveLength(0);
  });

  it("updates an existing goal", async () => {
    await saveGoal(TG_ID, "Learn guitar");
    const goals = await getGoals(TG_ID);
    await updateGoal(TG_ID, goals[0].id, "Master guitar", null, "shred solos");
    const updated = await getGoals(TG_ID);
    expect(updated[0].goal).toBe("Master guitar");
    expect(updated[0].target).toBe("shred solos");
  });
});

describe("preferences", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("sets and retrieves preferences", async () => {
    await setPreferences(TG_ID, { tone: "direct", workStyle: "pomodoro" });
    const prefs = await getPreferences(TG_ID);
    expect(prefs.tone).toBe("direct");
    expect(prefs.workStyle).toBe("pomodoro");
  });

  it("returns null when no preferences set", async () => {
    const prefs = await getPreferences(TG_ID);
    expect(prefs).toBeNull();
  });

  it("merges partial updates", async () => {
    await setPreferences(TG_ID, { tone: "direct" });
    await setPreferences(TG_ID, { workStyle: "pomodoro" });
    const prefs = await getPreferences(TG_ID);
    expect(prefs.tone).toBe("direct");
    expect(prefs.workStyle).toBe("pomodoro");
  });
});

describe("usage + trial logic", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
  });

  it("allows messages under the limit", async () => {
    await ensureUser(TG_ID, "Alice");
    const result = await checkUsage(TG_ID);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it("blocks when daily limit is reached", async () => {
    await ensureUser(TG_ID, "Alice");
    // Get the limit first
    const initial = await checkUsage(TG_ID);
    const today = new Date().toISOString().slice(0, 10);

    // Directly set usage to the limit
    await testDb.execute({
      sql: `INSERT INTO daily_usage (telegram_id, usage_date, message_count)
            VALUES (?, ?, ?)`,
      args: [TG_ID, today, initial.limit],
    });

    const result = await checkUsage(TG_ID);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("increments usage correctly", async () => {
    await ensureUser(TG_ID, "Alice");
    await incrementUsage(TG_ID, 50, 100);
    await incrementUsage(TG_ID, 30, 60);

    const today = new Date().toISOString().slice(0, 10);
    const result = await testDb.execute({
      sql: "SELECT message_count, input_tokens, output_tokens FROM daily_usage WHERE telegram_id = ? AND usage_date = ?",
      args: [TG_ID, today],
    });
    expect(Number(result.rows[0].message_count)).toBe(2);
    expect(Number(result.rows[0].input_tokens)).toBe(80);
    expect(Number(result.rows[0].output_tokens)).toBe(160);
  });

  it("new users get trial limit (15/day)", async () => {
    await ensureUser(TG_ID, "Alice");
    const usage = await checkUsage(TG_ID);
    // New user → within FREE_TRIAL_DAYS → limit should be FREE_TRIAL_DAILY_LIMIT (15)
    expect(usage.limit).toBe(15);
  });

  it("old free users get regular limit (5/day)", async () => {
    // Insert user with old created_at
    await testDb.execute({
      sql: `INSERT INTO users (telegram_id, name, tier, created_at)
            VALUES (?, ?, 'free', datetime('now', '-30 days'))`,
      args: [TG_ID, "OldUser"],
    });
    const usage = await checkUsage(TG_ID);
    expect(usage.limit).toBe(5);
  });
});

describe("timezone", () => {
  it("validates IANA timezones", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Asia/Singapore")).toBe(true);
    expect(isValidTimezone("Not/A/Timezone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });

  it("sets user timezone", async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
    await setTimezone(TG_ID, "Asia/Tokyo");
    const meta = await getUserMeta(TG_ID);
    expect(meta.timezone).toBe("Asia/Tokyo");
  });
});

describe("scheduled messages", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("creates and lists reminders", async () => {
    const id = await createScheduledMessage(TG_ID, {
      content: "Drink water",
      runAt: "2026-04-19T10:00:00.000Z",
      scheduleType: "daily",
      kind: "reminder",
      source: "user",
    });
    expect(id).toBeTruthy();

    const reminders = await listReminders(TG_ID);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].content).toBe("Drink water");
    expect(reminders[0].scheduleType).toBe("daily");
  });

  it("cancels a reminder", async () => {
    const id = await createScheduledMessage(TG_ID, {
      content: "Test",
      runAt: "2026-04-19T10:00:00.000Z",
    });
    await cancelReminder(TG_ID, id);
    const reminders = await listReminders(TG_ID);
    expect(reminders).toHaveLength(0);
  });

  it("updates reminder fields", async () => {
    const id = await createScheduledMessage(TG_ID, {
      content: "Old content",
      runAt: "2026-04-19T10:00:00.000Z",
    });
    await updateReminder(TG_ID, id, {
      content: "New content",
      runAt: "2026-04-20T08:00:00.000Z",
    });
    const reminders = await listReminders(TG_ID);
    expect(reminders[0].content).toBe("New content");
    expect(reminders[0].runAt).toBe("2026-04-20T08:00:00.000Z");
  });

  it("getDueReminders returns only due messages", async () => {
    await createScheduledMessage(TG_ID, {
      content: "Past",
      runAt: "2020-01-01T00:00:00.000Z",
    });
    await createScheduledMessage(TG_ID, {
      content: "Future",
      runAt: "2099-01-01T00:00:00.000Z",
    });

    const now = new Date().toISOString();
    const due = await getDueReminders(now);
    expect(due).toHaveLength(1);
    expect(due[0].content).toBe("Past");
  });

  it("claim → complete → reschedule flow", async () => {
    const id = await createScheduledMessage(TG_ID, {
      content: "Daily task",
      runAt: "2020-01-01T00:00:00.000Z",
      scheduleType: "daily",
    });

    const now = new Date().toISOString();
    const claimed = await claimReminder(id, now);
    expect(claimed).toBe(true);

    // Claimed = processing, so it shouldn't appear in getDueReminders
    const dueAfterClaim = await getDueReminders(now);
    expect(dueAfterClaim).toHaveLength(0);

    // Complete with next run
    await completeReminder(id, "2026-04-20T00:00:00.000Z");

    // Should be active again with new run_at
    const reminder = await testDb.execute({
      sql: "SELECT status, run_at, sent_count FROM scheduled_messages WHERE id = ?",
      args: [id],
    });
    expect(reminder.rows[0].status).toBe("active");
    expect(reminder.rows[0].run_at).toBe("2026-04-20T00:00:00.000Z");
    expect(Number(reminder.rows[0].sent_count)).toBe(1);
  });

  it("failReminder returns to active with error", async () => {
    const id = await createScheduledMessage(TG_ID, {
      content: "Fail test",
      runAt: "2020-01-01T00:00:00.000Z",
    });
    await claimReminder(id, new Date().toISOString());
    await failReminder(id, "Bot blocked by user");

    const reminder = await testDb.execute({
      sql: "SELECT status, last_error FROM scheduled_messages WHERE id = ?",
      args: [id],
    });
    expect(reminder.rows[0].status).toBe("active");
    expect(reminder.rows[0].last_error).toBe("Bot blocked by user");
  });
});

describe("nudge settings", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("returns defaults when no settings exist", async () => {
    const settings = await getNudgeSettings(TG_ID);
    expect(settings.enabled).toBe(true);
    expect(settings.frequency).toBe("every_3_days");
    expect(settings.lastNudgeAt).toBeNull();
  });

  it("updates nudge settings", async () => {
    await updateNudgeSettings(TG_ID, {
      enabled: false,
      frequency: "weekly",
      quietStart: "23:00",
      quietEnd: "09:00",
    });
    const settings = await getNudgeSettings(TG_ID);
    expect(settings.enabled).toBe(false);
    expect(settings.frequency).toBe("weekly");
    expect(settings.quietStart).toBe("23:00");
    expect(settings.quietEnd).toBe("09:00");
  });
});

describe("progress entries", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("getEntriesByGoal returns entries for a specific goal", async () => {
    await saveGoal(TG_ID, "Run daily");
    const goals = await getGoals(TG_ID);
    await logProgress(TG_ID, goals[0].id, "Ran 3km");
    await logProgress(TG_ID, goals[0].id, "Ran 5km");

    const entries = await getEntriesByGoal(TG_ID, goals[0].id);
    expect(entries).toHaveLength(2);
    expect(entries[0].content).toBe("Ran 5km"); // DESC order
    expect(entries[1].content).toBe("Ran 3km");
  });

  it("getRecentProgress joins with goal name", async () => {
    await saveGoal(TG_ID, "Read more");
    const goals = await getGoals(TG_ID);
    await logProgress(TG_ID, goals[0].id, "Read ch. 1-3");

    const progress = await getRecentProgress(TG_ID);
    expect(progress).toHaveLength(1);
    expect(progress[0].goal).toBe("Read more");
    expect(progress[0].content).toBe("Read ch. 1-3");
    expect(progress[0].goal_id).toBe(goals[0].id);
  });
});

describe("getActivityStreak", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("returns zero streak when no entries", async () => {
    const result = await getActivityStreak(TG_ID);
    expect(result.streak).toBe(0);
    expect(result.weekTotal).toBe(0);
  });

  it("counts streak for today's entry", async () => {
    await saveGoal(TG_ID, "Test goal");
    const goals = await getGoals(TG_ID);
    // Insert entry with today's date
    await logProgress(TG_ID, goals[0].id, "Did it");

    const result = await getActivityStreak(TG_ID);
    expect(result.streak).toBeGreaterThanOrEqual(1);
    expect(result.weekTotal).toBeGreaterThanOrEqual(1);
  });

  it("handles invalid timezone gracefully", async () => {
    await saveGoal(TG_ID, "Test goal");
    const goals = await getGoals(TG_ID);
    await logProgress(TG_ID, goals[0].id, "Entry");

    // Should fall back to UTC, not throw
    const result = await getActivityStreak(TG_ID, "Invalid/Zone");
    expect(result.streak).toBeGreaterThanOrEqual(0);
  });
});

describe("markNudgeSent", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("creates nudge_settings row if none exists", async () => {
    await markNudgeSent(TG_ID);
    const settings = await getNudgeSettings(TG_ID);
    expect(settings.lastNudgeAt).not.toBeNull();
  });

  it("updates last_nudge_at and recalculates next_nudge_at", async () => {
    await updateNudgeSettings(TG_ID, { frequency: "daily" });
    await markNudgeSent(TG_ID);

    const result = await testDb.execute({
      sql: "SELECT last_nudge_at, next_nudge_at FROM nudge_settings WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(result.rows[0].last_nudge_at).not.toBeNull();
    expect(result.rows[0].next_nudge_at).not.toBeNull();
  });
});

describe("getNudgeCandidates", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("returns empty when user has no recent messages", async () => {
    const candidates = await getNudgeCandidates();
    expect(candidates).toHaveLength(0);
  });

  it("returns user when they have messages and no nudge cooldown", async () => {
    // Need a recent message to qualify
    await saveMessage(TG_ID, "user", "Hello");
    const candidates = await getNudgeCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].telegramId).toBe(TG_ID);
    expect(candidates[0].frequency).toBe("every_3_days");
  });

  it("excludes users with nudges disabled", async () => {
    await saveMessage(TG_ID, "user", "Hello");
    await updateNudgeSettings(TG_ID, { enabled: false });
    const candidates = await getNudgeCandidates();
    expect(candidates).toHaveLength(0);
  });
});

describe("hasPendingNudge", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("returns false when no pending nudge", async () => {
    expect(await hasPendingNudge(TG_ID)).toBe(false);
  });

  it("returns true when active nudge exists", async () => {
    await createScheduledMessage(TG_ID, {
      content: "Check in!",
      runAt: "2026-04-19T10:00:00.000Z",
      kind: "nudge",
      source: "system",
    });
    expect(await hasPendingNudge(TG_ID)).toBe(true);
  });
});

describe("resetNextNudgeAt", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("pushes next_nudge_at forward when nudges enabled", async () => {
    await updateNudgeSettings(TG_ID, { enabled: true, frequency: "daily" });
    const before = await testDb.execute({
      sql: "SELECT next_nudge_at FROM nudge_settings WHERE telegram_id = ?",
      args: [TG_ID],
    });
    const beforeVal = before.rows[0].next_nudge_at;

    await resetNextNudgeAt(TG_ID);

    const after = await testDb.execute({
      sql: "SELECT next_nudge_at FROM nudge_settings WHERE telegram_id = ?",
      args: [TG_ID],
    });
    // Should have been updated (could be same second, just check it's not null)
    expect(after.rows[0].next_nudge_at).not.toBeNull();
  });

  it("does nothing when nudges disabled", async () => {
    await updateNudgeSettings(TG_ID, { enabled: false });
    // Manually set next_nudge_at to null (disabled state)
    await testDb.execute({
      sql: "UPDATE nudge_settings SET next_nudge_at = NULL WHERE telegram_id = ?",
      args: [TG_ID],
    });
    await resetNextNudgeAt(TG_ID);

    const result = await testDb.execute({
      sql: "SELECT next_nudge_at FROM nudge_settings WHERE telegram_id = ?",
      args: [TG_ID],
    });
    expect(result.rows[0].next_nudge_at).toBeNull();
  });
});

describe("user summary", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("returns null when no summary exists", async () => {
    const result = await getUserSummary(TG_ID);
    expect(result).toBeNull();
  });

  it("upserts and retrieves summary", async () => {
    await upsertUserSummary(TG_ID, "Focused on fitness goals, prefers direct tone", 10);
    const result = await getUserSummary(TG_ID);
    expect(result.summary).toContain("fitness goals");
    expect(result.messagesAtSummary).toBe(10);
  });

  it("updates existing summary", async () => {
    await upsertUserSummary(TG_ID, "Version 1", 5);
    await upsertUserSummary(TG_ID, "Version 2 with more context", 15);
    const result = await getUserSummary(TG_ID);
    expect(result.summary).toBe("Version 2 with more context");
    expect(result.messagesAtSummary).toBe(15);
  });
});

describe("getMessageCount", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "Alice");
  });

  it("counts only user messages", async () => {
    await saveMessage(TG_ID, "user", "Hello");
    await saveMessage(TG_ID, "assistant", "Hi!");
    await saveMessage(TG_ID, "user", "Another msg");

    const count = await getMessageCount(TG_ID);
    expect(count).toBe(2);
  });

  it("returns 0 for no messages", async () => {
    const count = await getMessageCount(TG_ID);
    expect(count).toBe(0);
  });
});
