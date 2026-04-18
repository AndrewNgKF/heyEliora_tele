import Anthropic from "@anthropic-ai/sdk";
import {
  getHistory,
  getUserSummary,
  upsertUserSummary,
  getMessageCount,
} from "../db/queries.js";
import { SUMMARY_INTERVAL, MAX_HISTORY } from "../config/CONSTANTS.js";

const client = new Anthropic();

/**
 * Check if a user's summary needs refreshing based on message count.
 * @param {string} telegramId
 * @returns {Promise<boolean>}
 */
export async function needsSummaryRefresh(telegramId) {
  const [count, existing] = await Promise.all([
    getMessageCount(telegramId),
    getUserSummary(telegramId),
  ]);

  if (!existing) return count >= SUMMARY_INTERVAL;
  return count - existing.messagesAtSummary >= SUMMARY_INTERVAL;
}

/**
 * Generate and store a rolling summary of who this user is.
 * Runs after every N messages as a side effect of chatting.
 * @param {string} telegramId
 */
export async function refreshUserSummary(telegramId) {
  const [history, existing, messageCount] = await Promise.all([
    getHistory(telegramId, MAX_HISTORY),
    getUserSummary(telegramId),
    getMessageCount(telegramId),
  ]);

  if (history.length === 0) return;

  const conversationText = history
    .map((m) => `${m.role === "user" ? "User" : "Eliora"}: ${m.content}`)
    .join("\n");

  const previousSummary = existing
    ? `\nPrevious summary (update, don't start from scratch):\n${existing.summary}`
    : "";

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: `You are analyzing conversations between a user and their AI assistant Eliora. Generate a concise rolling summary of who this person is. Include:

- What they care about (values, priorities, concerns)
- Their current life situation and context
- Communication patterns (how they talk, what motivates them)
- Emotional patterns (what stresses them, what excites them)
- Key facts (job, family, location — only if mentioned)
- Psychological observations (tendencies, blind spots, strengths)

Keep it under 300 words. Write in third person. Be specific, not generic. Update the previous summary if one exists — merge new observations, don't repeat.${previousSummary}`,
    messages: [
      {
        role: "user",
        content: `Analyze this recent conversation and generate/update the user summary:\n\n${conversationText}`,
      },
    ],
  });

  const summary = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  await upsertUserSummary(telegramId, summary, messageCount);
}
