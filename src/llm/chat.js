import Anthropic from "@anthropic-ai/sdk";
import {
  saveMessage,
  getHistory,
  getGoals,
  getPreferences,
  getRecentProgress,
  getActivityStreak,
  listReminders,
  getUserMeta,
  getNudgeSettings,
  getUserSummary,
  resetNextNudgeAt,
} from "../db/queries.js";
import {
  getTierConfig,
  MAX_HISTORY,
  MAX_TOOL_STEPS,
} from "../config/CONSTANTS.js";
import { TOOLS, executeTool } from "./tools.js";
import { needsSummaryRefresh, refreshUserSummary } from "../jobs/summarize.js";

const client = new Anthropic();

const BASE_PROMPT = `You are Eliora, an *agentic* AI life optimisation coach on Telegram. Warm, direct, concise. Like a sharp friend who actually pays attention.

## Who you are
The kind of coach high performers keep in their corner. You help the user stay on their vision across work, health, mind, and relationships, notice when they drift, and tell the truth — with care, not judgment. You don't lecture. You don't motivate-poster.

You are *agentic*. You act, not just reply. You set reminders, track progress as the user talks, schedule check-ins, and reach out first when they go quiet on something that matters.

## Formatting
Telegram markdown only: *bold* (single asterisk), _italic_ (underscores), \`code\`. Never use ** — Telegram won't render it.

## Goals
- New goal: refine briefly (how much, by when, baseline, target), then save_goal.
- Goal changes: update_goal — never remove and re-save.
- remove_goal only when abandoning. Confirm first.
- Metrics needn't be numeric. "Cook 3 meals/week from scratch" is fine.

## Preferences
When the user reveals work style, tone, or schedule needs — save_preference silently.

## Reminders
- set_reminder for one_time, daily, or weekly. Ask if timing/recurrence is ambiguous.
- update_reminder for changes — never create a duplicate.
- cancel_reminder when they want it gone. Confirm first.
- If timezone is UTC (the default — meaning they haven't set one) and they mention a time, ask once: "Quick one — what timezone are you in so I get the time right?" Then set it. Don't ask if timezone is already set.

## Progress tracking
- Goal-relevant activity → track_progress silently with the correct goal_id. Positive or negative. Brief factual note. Never log the same activity twice.

## Nudges
update_nudge_settings when the user signals frequency:
- "every day" → daily | "every few days" → every_3_days | "weekly" → weekly
- "stop" → enabled=false
- "don't message me after 10pm" → quiet_start='22:00'
Acknowledge changes warmly.

## Expert-informed advice
Your lineage shapes how you think:
- *Paramahansa Yogananda* - self-realization, energy, habit change.
- *Jose Silva* — mental projection, creative visualization, energy management.
- *Tony Robbins* — state, standards, leverage, rapid change techniques.

Beyond them, draw on domain specialists when their framework genuinely fits — Pressfield's Resistance, Attia on metabolism, Naval, Cal Newport, sports science, etc.

Rules:
- Only when it actually helps. Don't force it.
- Name the source and the specific concept ("Robbins calls this state management…"), not "some people say…"
- Apply it to *their* data — their goals, entries, patterns. Generic advice is worthless.
- One sharp insight beats a lecture. Usually one reference per conversation is enough.

## Accountability & momentum
You know their goals, baselines, targets, streaks, and recent entries — passed below. Reference them naturally when relevant. Streaks, gaps, and goal-completions are worth noting when earned. Don't force it into every reply.

## New users
If no goals are set: ask one good question, refine into something specific, save it. Don't list features. After their first goal, casually mention: "I'll check in on this every few days — and if you tell me what you get done, I'll track it automatically."

## What you are not
Not a chatbot. Not a therapist. Not a hype account. A coach. Be that.`;

/**
 * Build a personalized system prompt from user data
 * @param {string} telegramId
 * @param {string} timezone - IANA timezone for the user (e.g. "Asia/Singapore")
 * @returns {Promise<string>}
 */
async function buildSystemPrompt(telegramId, timezone = "UTC") {
  const [
    goals,
    prefs,
    entries,
    reminders,
    nudgeSettings,
    summaryRow,
    activity,
  ] = await Promise.all([
    getGoals(telegramId),
    getPreferences(telegramId),
    getRecentProgress(telegramId),
    listReminders(telegramId, 5),
    getNudgeSettings(telegramId),
    getUserSummary(telegramId),
    getActivityStreak(telegramId, timezone),
  ]);

  const blocks = [
    {
      type: "text",
      text: BASE_PROMPT,
      cache_control: { type: "ephemeral" },
    },
  ];

  let personalized = `User timezone: ${timezone}. The current local time is prepended to each user message in [brackets]. Always convert user-mentioned times to UTC before calling set_reminder.`;

  if (goals.length > 0) {
    const goalList = goals
      .map((g) => {
        let line = `- [id:${g.id}] ${g.goal}`;
        if (g.baseline) line += ` | baseline: ${g.baseline}`;
        if (g.target) line += ` | target: ${g.target}`;
        return line;
      })
      .join("\n");
    personalized += `\n\nThe user's current goals and ambitions:\n${goalList}\nKeep these in mind. Reference their baseline and target when giving accountability feedback. When relevant, check if what they're doing aligns with these goals. Gently call it out if something seems off-track.`;
  }

  if (entries.length > 0) {
    const entryList = entries
      .map((e) => `- [${e.created_at}] (goal: ${e.goal}) ${e.content}`)
      .join("\n");
    personalized += `\n\nRecent progress entries:\n${entryList}\nUse these to give informed accountability feedback. Notice patterns, celebrate streaks, call out gaps.`;
  }

  if (activity.streak > 1) {
    personalized += `\n\nActivity streak: ${activity.streak} consecutive days with progress entries. Entries logged on ${activity.weekTotal} of the last 7 days.`;
  } else if (activity.weekTotal > 0) {
    personalized += `\n\nActivity this week: entries on ${activity.weekTotal} of the last 7 days. No active streak.`;
  }

  if (reminders.length > 0) {
    const reminderList = reminders
      .map(
        (r) =>
          `- [id:${r.id}] ${r.content} | next: ${r.runAt} | type: ${r.scheduleType} | source: ${r.source}`,
      )
      .join("\n");
    personalized += `\n\nScheduled reminders and nudges:\n${reminderList}\nAvoid duplicating an existing reminder if one already covers the same intent.`;
  }

  if (prefs) {
    const parts = [];
    if (prefs.workStyle) parts.push(`Work style: ${prefs.workStyle}`);
    if (prefs.tone) parts.push(`Preferred tone: ${prefs.tone}`);
    if (prefs.schedulePref)
      parts.push(`Schedule preferences: ${prefs.schedulePref}`);
    if (parts.length > 0) {
      personalized += `\n\nUser preferences:\n${parts.join("\n")}`;
    }
  }

  const nudgeDesc = nudgeSettings.enabled
    ? `Nudges: ON (${nudgeSettings.frequency}), quiet ${nudgeSettings.quietStart}–${nudgeSettings.quietEnd}`
    : "Nudges: OFF (user disabled check-ins)";
  personalized += `\n\n${nudgeDesc}`;

  if (summaryRow) {
    personalized += `\n\nWhat you know about this user (from past conversations):\n${summaryRow.summary}`;
  }

  blocks.push({
    type: "text",
    text: personalized,
    cache_control: { type: "ephemeral" },
  });
  return blocks;
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
  const systemBlocks = await buildSystemPrompt(userId, timezone);
  const tierConfig = getTierConfig(tier);

  // Timestamp in user message (not system prompt) to avoid busting cache
  const now = new Date().toLocaleString("en-US", {
    timeZone: timezone,
    hour12: false,
    dateStyle: "full",
    timeStyle: "short",
  });

  // Fire-and-forget: push next nudge forward + maybe refresh summary
  const afterChat = () => {
    resetNextNudgeAt(userId).catch(() => {});
    needsSummaryRefresh(userId)
      .then((needs) => {
        if (needs)
          refreshUserSummary(userId).catch((e) =>
            console.error("[eliora] summary refresh error:", e),
          );
      })
      .catch(() => {});
  };

  let messages = history.map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: "user", content: `[${now}] ${message}` });
  let maxSteps = MAX_TOOL_STEPS;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;

  // Loop to handle tool calls
  while (maxSteps > 0) {
    const response = await client.messages.create({
      model: tierConfig.model,
      max_tokens: tierConfig.maxTokens,
      system: systemBlocks,
      messages,
      tools: TOOLS,
    });

    totalInputTokens += response.usage?.input_tokens || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;
    totalCacheReadTokens += response.usage?.cache_read_input_tokens || 0;
    totalCacheCreationTokens +=
      response.usage?.cache_creation_input_tokens || 0;

    // If no tool use, extract text and return
    if (response.stop_reason === "end_turn") {
      const text = extractText(response.content);
      await saveMessage(userId, "user", message);
      await saveMessage(userId, "assistant", text);
      afterChat();
      return {
        text,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: totalCacheReadTokens,
        cacheCreationTokens: totalCacheCreationTokens,
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
    afterChat();
    return {
      text,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCacheReadTokens,
      cacheCreationTokens: totalCacheCreationTokens,
    };
  }

  // If we ran out of steps
  const fallback = "I got stuck in a loop — let's try that again.";
  await saveMessage(userId, "user", message);
  await saveMessage(userId, "assistant", fallback);
  afterChat();
  return {
    text: fallback,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens: totalCacheReadTokens,
    cacheCreationTokens: totalCacheCreationTokens,
  };
}
