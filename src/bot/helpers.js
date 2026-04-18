import { getRecentProgress } from "../db/queries.js";
import { chat } from "../llm/chat.js";

/**
 * Format goals as a numbered list with baseline/target.
 * Used by /goals command and action:goals callback.
 * @param {Array<{id: string, goal: string, baseline?: string, target?: string}>} goals
 * @returns {string}
 */
export function formatGoalList(goals) {
  return goals
    .map((g, i) => {
      let line = `${i + 1}. ${g.goal} (id:${g.id})`;
      if (g.baseline || g.target) {
        const parts = [];
        if (g.baseline) parts.push(`from: ${g.baseline}`);
        if (g.target) parts.push(`target: ${g.target}`);
        line += `\n   ${parts.join(" → ")}`;
      }
      return line;
    })
    .join("\n");
}

/**
 * Run a full accountability check-in: format goals + entries, call LLM.
 * Used by /whatsup command and action:whatsup callback.
 * @param {string} userId
 * @param {Array<{goal: string, baseline?: string, target?: string}>} goals
 * @returns {Promise<string>} The LLM's check-in reply
 */
export async function performCheckIn(userId, goals) {
  const goalList = goals
    .map((g) => {
      let line = `- ${g.goal}`;
      if (g.baseline) line += ` (baseline: ${g.baseline})`;
      if (g.target) line += ` (target: ${g.target})`;
      return line;
    })
    .join("\n");

  const entries = await getRecentProgress(userId, 10);
  const entryContext =
    entries.length > 0
      ? `\n\nRecent activity:\n${entries.map((e) => `- [${e.created_at}] (${e.goal}) ${e.content}`).join("\n")}`
      : "\n\nNo progress entries logged yet.";

  const { text } = await chat(
    userId,
    `[SYSTEM CHECK-IN] Give me a quick accountability check-in. Here are my goals:\n${goalList}${entryContext}\n\nBased on my recent activity and our conversations, how am I tracking? Be honest — call me out if I'm drifting.`,
  );
  return text;
}

/**
 * Format reminders as a readable list for Telegram.
 * @param {Array<{id: string, content: string, runAt: string, scheduleType: string, source: string}>} reminders
 * @param {string} timezone
 */
export function formatReminderList(reminders, timezone) {
  return reminders
    .map((reminder) => {
      const localTime = new Date(reminder.runAt).toLocaleString("en-US", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      const repeatLabel =
        reminder.scheduleType === "one_time"
          ? "one-time"
          : reminder.scheduleType;
      const sourceLabel =
        reminder.source === "user" ? "you asked" : reminder.source;
      return `• ${reminder.content}\n  ${localTime} (${timezone}) · ${repeatLabel} · ${sourceLabel}\n  id:${reminder.id}`;
    })
    .join("\n\n");
}
