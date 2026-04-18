import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupTestDb } from "../helpers/db.js";

let testDb;
vi.mock("../../src/db/index.js", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock
const { executeTool } = await import("../../src/llm/tools.js");
const {
  ensureUser,
  getGoals,
  getPreferences,
  listReminders,
  getNudgeSettings,
} = await import("../../src/db/queries.js");

const TG_ID = "999888777";

describe("executeTool", () => {
  beforeEach(async () => {
    testDb = await setupTestDb();
    await ensureUser(TG_ID, "TestUser");
  });

  it("save_goal creates a goal and returns confirmation", async () => {
    const result = await executeTool(TG_ID, "save_goal", {
      goal: "Read 20 books this year",
      baseline: "3 books last year",
      target: "20 books by December",
    });
    expect(result).toContain("Goal saved");
    expect(result).toContain("Read 20 books");

    const goals = await getGoals(TG_ID);
    expect(goals).toHaveLength(1);
    expect(goals[0].goal).toBe("Read 20 books this year");
  });

  it("update_goal modifies an existing goal", async () => {
    await executeTool(TG_ID, "save_goal", { goal: "Read books" });
    const goals = await getGoals(TG_ID);

    const result = await executeTool(TG_ID, "update_goal", {
      goal_id: goals[0].id,
      goal: "Read 30 books",
      target: "30 by year end",
    });
    expect(result).toContain("Goal updated");

    const updated = await getGoals(TG_ID);
    expect(updated[0].goal).toBe("Read 30 books");
  });

  it("remove_goal soft-deletes a goal", async () => {
    await executeTool(TG_ID, "save_goal", { goal: "Temp goal" });
    const goals = await getGoals(TG_ID);

    const result = await executeTool(TG_ID, "remove_goal", {
      goal_id: goals[0].id,
    });
    expect(result).toContain("Goal removed");

    const after = await getGoals(TG_ID);
    expect(after).toHaveLength(0);
  });

  it("save_preference stores a preference", async () => {
    const result = await executeTool(TG_ID, "save_preference", {
      key: "tone",
      value: "casual and supportive",
    });
    expect(result).toContain("Preference saved");

    const prefs = await getPreferences(TG_ID);
    expect(prefs.tone).toBe("casual and supportive");
  });

  it("track_progress logs an entry", async () => {
    await executeTool(TG_ID, "save_goal", { goal: "Exercise daily" });
    const goals = await getGoals(TG_ID);

    const result = await executeTool(TG_ID, "track_progress", {
      goal_id: goals[0].id,
      content: "Ran 5km today",
    });
    expect(result).toContain("Entry logged");
  });

  it("set_reminder creates a scheduled message", async () => {
    const result = await executeTool(TG_ID, "set_reminder", {
      content: "Take vitamins",
      remind_at_utc: "2026-04-19T08:00:00.000Z",
      schedule_type: "daily",
    });
    expect(result).toContain("Reminder saved");

    const reminders = await listReminders(TG_ID);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].content).toBe("Take vitamins");
    expect(reminders[0].scheduleType).toBe("daily");
  });

  it("update_reminder modifies an existing reminder", async () => {
    await executeTool(TG_ID, "set_reminder", {
      content: "Old reminder",
      remind_at_utc: "2026-04-19T08:00:00.000Z",
      schedule_type: "one_time",
    });
    const reminders = await listReminders(TG_ID);

    const result = await executeTool(TG_ID, "update_reminder", {
      reminder_id: reminders[0].id,
      content: "Updated reminder",
    });
    expect(result).toContain("updated");

    const updated = await listReminders(TG_ID);
    expect(updated[0].content).toBe("Updated reminder");
  });

  it("cancel_reminder cancels a reminder", async () => {
    await executeTool(TG_ID, "set_reminder", {
      content: "Cancel me",
      remind_at_utc: "2026-04-19T08:00:00.000Z",
      schedule_type: "one_time",
    });
    const reminders = await listReminders(TG_ID);

    const result = await executeTool(TG_ID, "cancel_reminder", {
      reminder_id: reminders[0].id,
    });
    expect(result).toContain("cancelled");

    const after = await listReminders(TG_ID);
    expect(after).toHaveLength(0);
  });

  it("set_timezone with valid timezone", async () => {
    const result = await executeTool(TG_ID, "set_timezone", {
      timezone: "Asia/Singapore",
    });
    expect(result).toContain("Timezone set to Asia/Singapore");
  });

  it("set_timezone rejects invalid timezone", async () => {
    const result = await executeTool(TG_ID, "set_timezone", {
      timezone: "Mars/Olympus",
    });
    expect(result).toContain("Invalid timezone");
  });

  it("update_nudge_settings changes frequency", async () => {
    const result = await executeTool(TG_ID, "update_nudge_settings", {
      enabled: true,
      frequency: "daily",
      quiet_start: "23:00",
      quiet_end: "07:00",
    });
    expect(result).toContain("Nudge settings updated");

    const settings = await getNudgeSettings(TG_ID);
    expect(settings.frequency).toBe("daily");
    expect(settings.quietStart).toBe("23:00");
  });

  it("update_nudge_settings can disable nudges", async () => {
    const result = await executeTool(TG_ID, "update_nudge_settings", {
      enabled: false,
    });
    expect(result).toContain("enabled: false");

    const settings = await getNudgeSettings(TG_ID);
    expect(settings.enabled).toBe(false);
  });
});
