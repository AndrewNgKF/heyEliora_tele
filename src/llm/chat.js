import Anthropic from "@anthropic-ai/sdk";
import {
  saveMessage,
  getHistory,
  getGoals,
  getPreferences,
  getRecentProgress,
  listReminders,
  getUserMeta,
} from "../db/queries.js";
import {
  getTierConfig,
  MAX_HISTORY,
  MAX_TOOL_STEPS,
} from "../config/CONSTANTS.js";
import { TOOLS, executeTool } from "./tools.js";

const client = new Anthropic();

const BASE_PROMPT = `You are Eliora, a personal AI assistant on Telegram. Warm, direct, concise. Like a sharp friend who's incredibly organized. Conversational, not corporate.

## Formatting
You're on Telegram. Use *bold* (single asterisk), _italic_ (underscores), and \`code\`. Never use ** or other markdown — Telegram won't render it.

## Goals
- When a user mentions a goal: if needed, ask clarifying questions (how much, by when, baseline, target).
- Use save_goal only for NEW goals, after refining. Include baseline and target when possible.
- Use update_goal (not remove+save) when a goal changes. Never duplicate.
- Use remove_goal only when the user wants to abandon a goal. Confirm first.
- Metrics don't have to be numeric. "Can make pasta" → "Cook 3 meals/week from scratch" is fine.

## Preferences
When a user mentions work style, tone, or scheduling needs — save_preference silently.

## Reminders
- When a user asks to be reminded about something, use set_reminder.
- Support one-time, daily, and weekly reminders.
- If timing or recurrence is ambiguous, ask a brief follow-up before creating it.
- Avoid creating duplicate reminders when one already covers the same intent.
- If the user's timezone is UTC (the default — meaning they haven't set one yet) and they mention a specific time, ask once, casually: "Quick one — what timezone are you in so I get the time right?" Then set the reminder after they reply. Don't ask if the timezone is already set.

## Progress tracking
- When the user mentions goal-relevant activity, call track_progress silently. Positive and negative.
- Only goal-relevant activity. Always use the correct goal_id. Brief factual note.
- Never call track_progress twice for the same activity.

## Accountability
You know the user's goals, baselines, targets, and recent entries. Reference them. If something seems off-track, say so — you tell the truth.`;

/**
 * Build a personalized system prompt from user data
 * @param {string} telegramId
 * @param {string} timezone - IANA timezone for the user (e.g. "Asia/Singapore")
 * @returns {Promise<string>}
 */
async function buildSystemPrompt(telegramId, timezone = "UTC") {
  const [goals, prefs, entries, reminders] = await Promise.all([
    getGoals(telegramId),
    getPreferences(telegramId),
    getRecentProgress(telegramId),
    listReminders(telegramId, 5),
  ]);

  const now = new Date().toLocaleString("en-US", {
    timeZone: timezone,
    hour12: false,
    dateStyle: "full",
    timeStyle: "short",
  });
  let prompt =
    BASE_PROMPT +
    `\n\nUser timezone: ${timezone}. Current local time for the user: ${now}. Always convert user-mentioned times to UTC before calling set_reminder.`;

  if (goals.length > 0) {
    const goalList = goals
      .map((g) => {
        let line = `- [id:${g.id}] ${g.goal}`;
        if (g.baseline) line += ` | baseline: ${g.baseline}`;
        if (g.target) line += ` | target: ${g.target}`;
        return line;
      })
      .join("\n");
    prompt += `\n\nThe user's current goals and ambitions:\n${goalList}\nKeep these in mind. Reference their baseline and target when giving accountability feedback. When relevant, check if what they're doing aligns with these goals. Gently call it out if something seems off-track.`;
  }

  if (entries.length > 0) {
    const entryList = entries
      .map((e) => `- [${e.created_at}] (goal: ${e.goal}) ${e.content}`)
      .join("\n");
    prompt += `\n\nRecent progress entries:\n${entryList}\nUse these to give informed accountability feedback. Notice patterns, celebrate streaks, call out gaps.`;
  }

  if (reminders.length > 0) {
    const reminderList = reminders
      .map(
        (r) =>
          `- [id:${r.id}] ${r.content} | next: ${r.runAt} | type: ${r.scheduleType} | source: ${r.source}`,
      )
      .join("\n");
    prompt += `\n\nScheduled reminders and nudges:\n${reminderList}\nAvoid duplicating an existing reminder if one already covers the same intent.`;
  }

  if (prefs) {
    const parts = [];
    if (prefs.workStyle) parts.push(`Work style: ${prefs.workStyle}`);
    if (prefs.tone) parts.push(`Preferred tone: ${prefs.tone}`);
    if (prefs.schedulePref)
      parts.push(`Schedule preferences: ${prefs.schedulePref}`);
    if (parts.length > 0) {
      prompt += `\n\nUser preferences:\n${parts.join("\n")}`;
    }
  }

  return prompt;
}

/**
 * Extract text from a Claude response
 * @param {Array<{type: string, text?: string}>} content
 * @returns {string}
 */
function extractText(content) {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Chat with Eliora
 * @param {string} userId
 * @param {string} message
 * @returns {Promise<string>}
 */
export async function chat(userId, message) {
  // Load history + build personalized prompt + get tier config in parallel
  const [history, { tier, timezone }] = await Promise.all([
    getHistory(userId, MAX_HISTORY),
    getUserMeta(userId),
  ]);
  const systemPrompt = await buildSystemPrompt(userId, timezone);

  const tierConfig = getTierConfig(tier);

  let messages = history.map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: "user", content: message });
  let maxSteps = MAX_TOOL_STEPS;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Loop to handle tool calls
  while (maxSteps > 0) {
    const response = await client.messages.create({
      model: tierConfig.model,
      max_tokens: tierConfig.maxTokens,
      system: systemPrompt,
      messages,
      tools: TOOLS,
    });

    totalInputTokens += response.usage?.input_tokens || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;

    // If no tool use, extract text and return
    if (response.stop_reason === "end_turn") {
      const text = extractText(response.content);
      await saveMessage(userId, "user", message);
      await saveMessage(userId, "assistant", text);
      return {
        text,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      };
    }

    // Handle tool calls
    if (response.stop_reason === "tool_use") {
      // Add assistant's response (includes tool_use blocks)
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool call and collect results
      const toolResults = [];
      const trackedEntries = new Set();
      for (const block of response.content) {
        if (block.type === "tool_use") {
          // Deduplicate track_progress calls within the same response
          if (block.name === "track_progress") {
            const key = `${block.input.goal_id}:${block.input.content}`;
            if (trackedEntries.has(key)) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: "Already logged this entry — skipped duplicate.",
              });
              continue;
            }
            trackedEntries.add(key);
          }
          const result = await executeTool(
            userId,
            block.name,
            block.input,
          ).catch((err) => `Tool error: ${err.message}`);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
      maxSteps--;
      continue;
    }

    // Fallback — extract any text
    const text =
      extractText(response.content) ||
      "Hmm, I got a bit lost there. What were we talking about?";
    await saveMessage(userId, "user", message);
    await saveMessage(userId, "assistant", text);
    return {
      text,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    };
  }

  // If we ran out of steps
  const fallback = "I got stuck in a loop — let's try that again.";
  await saveMessage(userId, "user", message);
  await saveMessage(userId, "assistant", fallback);
  return {
    text: fallback,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
}
