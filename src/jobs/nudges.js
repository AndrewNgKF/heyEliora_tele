import Anthropic from "@anthropic-ai/sdk";
import {
  getNudgeCandidates,
  hasPendingNudge,
  getGoals,
  getRecentProgress,
  getActivityStreak,
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
 * Ask Claude to generate a contextual nudge message.
 * @param {Array} goals
 * @param {Array} entries
 * @param {{summary: string}|null} summaryRow
 * @param {boolean} isFirstNudge
 * @returns {Promise<string>}
 */
async function generateNudgeContent(
  goals,
  entries,
  summaryRow,
  isFirstNudge,
  activity,
) {
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

  const streakContext =
    activity.streak > 1
      ? `\n\nStreak: ${activity.streak} consecutive days with entries. ${activity.weekTotal} of last 7 days active.`
      : activity.weekTotal > 0
        ? `\n\nActivity: entries on ${activity.weekTotal} of the last 7 days. No active streak.`
        : "";

  const summaryContext = summaryRow
    ? `\n\nWhat you know about this user:\n${summaryRow.summary}`
    : "";

  const firstNudgeNote = isFirstNudge
    ? `\nThis is the FIRST nudge you're sending this user. End with a brief, casual note like: "(I'll check in like this from time to time — just tell me if you want more or less of it.)"`
    : "";

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: `You are Eliora, a warm and direct personal AI assistant. Write a short proactive check-in message to send to the user — like a friend who remembers what they're working on.

Rules:
- Your output is sent DIRECTLY to the user as-is. Do NOT include meta-commentary, explanations, markdown dividers, or notes about what you're doing.
- Keep it to 2-3 sentences max.
- Be specific — reference their actual goals and recent activity.
- If they have no goals yet, warmly encourage them to share what they're working on so you can actually help.
- If their recent activity shows consecutive days of entries, mention the streak briefly: "3 days running — you're building momentum."
- If there's a big gap since their last entry, name it: "Haven't seen an update on X in a while."
- If recent entries suggest they've hit or exceeded a goal target, celebrate it.
- When relevant, weave in one sharp insight from a domain expert. Name them and the concept. "Attia's framework says this — if you're not measuring protein, you're guessing." Keep it brief and applied to their situation, not generic.
- Don't be generic or corporate. Talk like a friend who reads a lot.
- Use Telegram formatting (*bold*, _italic_).
- No greetings like "Hi!" — just get into it.
- Always address the user as "you", never "they" or "the user".${summaryContext}${firstNudgeNote}`,
    messages: [
      {
        role: "user",
        content: `Write a check-in message for this user.\n\nGoals:\n${goalContext}\n\nRecent activity:\n${entryContext}${streakContext}`,
      },
    ],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Evaluate due users, generate nudge content, and queue for delivery.
 * Content is inserted into scheduled_messages — sender.js handles delivery.
 * @returns {Promise<{ evaluated: number, nudged: number, skipped: number, errors: number }>}
 */
export async function processNudges() {
  const candidates = await getNudgeCandidates();

  let nudged = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of candidates) {
    try {
      if (isQuietHours(user.timezone, user.quietStart, user.quietEnd)) {
        skipped++;
        continue;
      }

      const pending = await hasPendingNudge(user.telegramId);
      if (pending) {
        skipped++;
        continue;
      }

      const isFirstNudge = !user.lastNudgeAt;
      const [goals, entries, summaryRow, activity] = await Promise.all([
        getGoals(user.telegramId),
        getRecentProgress(user.telegramId, 5),
        getUserSummary(user.telegramId),
        getActivityStreak(user.telegramId, user.timezone),
      ]);

      // No data at all — static message, skip the LLM call
      let message;
      if (goals.length === 0 && entries.length === 0 && !summaryRow) {
        message = isFirstNudge
          ? "So — what's the one thing you're trying to get done this month? Give me something to work with and I'll actually keep you on track.\n\n_(I'll check in like this from time to time — tell me if you want more or less of it.)_"
          : "Still here when you're ready. What are you working on right now? Even one goal gives me something to actually help with.";
      } else {
        message = await generateNudgeContent(
          goals,
          entries,
          summaryRow,
          isFirstNudge,
          activity,
        );
      }

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
