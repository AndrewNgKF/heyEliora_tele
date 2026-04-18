import Anthropic from "@anthropic-ai/sdk";
import {
  getNudgeCandidates,
  hasPendingNudge,
  getGoals,
  getRecentProgress,
  getUserSummary,
  createScheduledMessage,
  markNudgeSent,
} from "../db/queries.js";

const client = new Anthropic();

/**
 * Check if the user's current local time is within their quiet hours.
 * @param {string} timezone
 * @param {string} quietStart - e.g. "22:00"
 * @param {string} quietEnd - e.g. "08:00"
 * @returns {boolean}
 */
function isQuietHours(timezone, quietStart, quietEnd) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const localTime = formatter.format(now); // "14:30"

    // Quiet hours can wrap midnight: 22:00 → 08:00
    if (quietStart <= quietEnd) {
      // Simple range: e.g. 01:00 → 06:00
      return localTime >= quietStart && localTime < quietEnd;
    }
    // Wraps midnight: e.g. 22:00 → 08:00
    return localTime >= quietStart || localTime < quietEnd;
  } catch {
    return false;
  }
}

/**
 * Ask Claude to generate a contextual nudge message for this user.
 * @param {Array<{id: string, goal: string, baseline?: string, target?: string}>} goals
 * @param {Array<{goal: string, content: string, created_at: string}>} entries
 * @param {string|null} summary - user_summary for deeper context
 * @param {boolean} isFirstNudge
 * @returns {Promise<string>}
 */
async function generateNudgeMessage(goals, entries, summary, isFirstNudge) {
  const goalContext =
    goals.length > 0
      ? goals
          .map((g) => {
            let line = `- ${g.goal}`;
            if (g.target) line += ` (target: ${g.target})`;
            return line;
          })
          .join("\n")
      : "No goals set yet.";

  const entryContext =
    entries.length > 0
      ? entries
          .map((e) => `- [${e.created_at}] (${e.goal}) ${e.content}`)
          .join("\n")
      : "No recent activity.";

  const summaryContext = summary
    ? `\n\nWhat you know about this user:\n${summary}`
    : "";

  const firstNudgeNote = isFirstNudge
    ? `\nThis is the FIRST nudge you're sending this user. End with a brief, casual note like: "(I'll check in like this from time to time — just tell me if you want more or less of it.)"`
    : "";

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: `You are Eliora, a warm and direct personal AI assistant. You're sending a proactive check-in message — like a friend who remembers what the user is working on and understands who they are. Keep it SHORT (2-3 sentences max). Be specific — reference their actual goals, recent activity, and what you know about them. Don't be generic or corporate. Use Telegram formatting (*bold*, _italic_). No greetings like "Hi!" — just get into it.${summaryContext}${firstNudgeNote}`,
    messages: [
      {
        role: "user",
        content: `Generate a nudge message for this user.\n\nGoals:\n${goalContext}\n\nRecent activity:\n${entryContext}`,
      },
    ],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Evaluate due users and generate nudges.
 * Only processes users whose next_nudge_at has passed (pre-filtered by SQL).
 * Inserts nudge messages into scheduled_messages for delivery by /cron/deliver.
 * @returns {Promise<{ evaluated: number, nudged: number, skipped: number, errors: number }>}
 */
export async function processNudges() {
  const candidates = await getNudgeCandidates();

  let nudged = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of candidates) {
    try {
      // Skip if quiet hours (can't pre-filter — depends on user's local time)
      if (isQuietHours(user.timezone, user.quietStart, user.quietEnd)) {
        skipped++;
        continue;
      }

      // Skip if there's already a pending nudge in the queue
      const pending = await hasPendingNudge(user.telegramId);
      if (pending) {
        skipped++;
        continue;
      }

      // Generate the nudge with full context
      const isFirstNudge = !user.lastNudgeAt;
      const [goals, entries, summaryRow] = await Promise.all([
        getGoals(user.telegramId),
        getRecentProgress(user.telegramId, 5),
        getUserSummary(user.telegramId),
      ]);

      const message = await generateNudgeMessage(
        goals,
        entries,
        summaryRow?.summary || null,
        isFirstNudge,
      );

      // Insert into scheduled_messages for immediate delivery
      await createScheduledMessage(user.telegramId, {
        content: message,
        runAt: new Date().toISOString(),
        scheduleType: "one_time",
        kind: "nudge",
        source: "system",
      });

      await markNudgeSent(user.telegramId);
      nudged++;
    } catch (error) {
      console.error(
        `[eliora] nudge error for ${user.telegramId}:`,
        error instanceof Error ? error.message : error,
      );
      errors++;
    }
  }

  return { evaluated: candidates.length, nudged, skipped, errors };
}
