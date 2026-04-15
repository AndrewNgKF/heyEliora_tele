import Anthropic from "@anthropic-ai/sdk";
import {
  saveMessage,
  getHistory,
  getGoals,
  getPreferences,
  addGoal,
  updateGoal,
  removeGoal,
  setPreferences,
  addEntry,
  getRecentEntries,
} from "../db/queries.js";

const client = new Anthropic();

const BASE_PROMPT = `You are Eliora, a personal AI assistant on Telegram. Warm, direct, concise. Like a sharp friend who's incredibly organized. Conversational, not corporate.

## Formatting
You're on Telegram. Use *bold* (single asterisk), _italic_ (underscores), and \`code\`. Never use ** or other markdown — Telegram won't render it.

## Goals
- When a user mentions a goal: ask clarifying questions first (how much, by when, baseline, target). Never save vague goals.
- Use save_goal only for NEW goals, after refining. Include baseline and target when possible.
- Use update_goal (not remove+save) when a goal changes. Never duplicate.
- Use remove_goal only when the user wants to abandon a goal. Confirm first.
- Metrics don't have to be numeric. "Can make pasta" → "Cook 3 meals/week from scratch" is fine.

## Preferences
When a user mentions work style, tone, or scheduling needs — save_preference silently.

## Progress tracking
- When the user mentions goal-relevant activity, call track_progress silently. Positive and negative.
- Only goal-relevant activity. Always use the correct goal_id. Brief factual note.
- Never call track_progress twice for the same activity.

## Accountability
You know the user's goals, baselines, targets, and recent entries. Reference them. If something seems off-track, say so — you tell the truth.`;

const TOOLS = [
  {
    name: "save_goal",
    description:
      "Save a brand new goal. Only for NEW goals, not updates. Only call after refining through conversation.",
    input_schema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The refined, specific goal" },
        baseline: {
          type: "string",
          description:
            "Where the user is starting from (e.g. '85kg', 'can run 2km', '0 subscribers')",
        },
        target: {
          type: "string",
          description:
            "What a good result looks like (e.g. '75kg by September', 'run 10km', '1000 subscribers')",
        },
      },
      required: ["goal"],
    },
  },
  {
    name: "update_goal",
    description:
      "Update an existing goal when the user refines, changes, or evolves it. Use instead of save_goal for existing goals.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "The id of the existing goal" },
        goal: { type: "string", description: "The updated goal text" },
        baseline: {
          type: "string",
          description: "Updated starting point, if changed",
        },
        target: {
          type: "string",
          description: "Updated target, if changed",
        },
      },
      required: ["goal_id", "goal"],
    },
  },
  {
    name: "remove_goal",
    description:
      "Remove a goal the user no longer wants to pursue. Confirm with the user before calling this.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: {
          type: "string",
          description: "The id of the goal to remove",
        },
      },
      required: ["goal_id"],
    },
  },
  {
    name: "save_preference",
    description:
      "Save a user preference about work style, communication tone, or schedule.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          enum: ["workStyle", "tone", "schedulePref"],
          description: "The preference type",
        },
        value: { type: "string", description: "The preference value" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "track_progress",
    description:
      "Silently log a progress entry when the user mentions goal-relevant activity. Works for both positive and negative progress. Do NOT ask the user before calling this.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: {
          type: "string",
          description: "The id of the goal this entry relates to",
        },
        content: {
          type: "string",
          description:
            "Brief factual note about what the user did or didn't do",
        },
      },
      required: ["goal_id", "content"],
    },
  },
];

const MAX_HISTORY = 10;

/**
 * Build a personalized system prompt from user data
 * @param {string} telegramId
 * @returns {Promise<string>}
 */
async function buildSystemPrompt(telegramId) {
  const [goals, prefs, entries] = await Promise.all([
    getGoals(telegramId),
    getPreferences(telegramId),
    getRecentEntries(telegramId),
  ]);

  let prompt = BASE_PROMPT;

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
 * Execute a tool call
 * @param {string} telegramId
 * @param {string} toolName
 * @param {Record<string, any>} input
 * @returns {Promise<string>}
 */
async function executeTool(telegramId, toolName, input) {
  switch (toolName) {
    case "save_goal":
      await addGoal(telegramId, input.goal, input.baseline, input.target);
      return `Goal saved: "${input.goal}"${input.baseline ? ` (baseline: ${input.baseline})` : ""}${input.target ? ` (target: ${input.target})` : ""}`;
    case "update_goal":
      await updateGoal(
        telegramId,
        input.goal_id,
        input.goal,
        input.baseline,
        input.target,
      );
      return `Goal updated (id:${input.goal_id}): "${input.goal}"${input.baseline ? ` (baseline: ${input.baseline})` : ""}${input.target ? ` (target: ${input.target})` : ""}`;
    case "remove_goal":
      await removeGoal(telegramId, input.goal_id);
      return `Goal removed (id:${input.goal_id})`;
    case "save_preference":
      await setPreferences(telegramId, { [input.key]: input.value });
      return `Preference saved: ${input.key} = "${input.value}"`;
    case "track_progress":
      await addEntry(telegramId, input.goal_id, input.content);
      return `Entry logged for goal ${input.goal_id}: "${input.content}"`;
    default:
      return `Unknown tool: ${toolName}`;
  }
}

/**
 * Chat with Eliora
 * @param {string} userId
 * @param {string} message
 * @returns {Promise<string>}
 */
export async function chat(userId, message) {
  // Save user message to DB
  await saveMessage(userId, "user", message);

  // Load history + build personalized prompt in parallel
  const [history, systemPrompt] = await Promise.all([
    getHistory(userId, MAX_HISTORY),
    buildSystemPrompt(userId),
  ]);

  let messages = history.map((m) => ({ role: m.role, content: m.content }));
  let maxSteps = 3;

  // Loop to handle tool calls
  while (maxSteps > 0) {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools: TOOLS,
    });

    // If no tool use, extract text and return
    if (response.stop_reason === "end_turn") {
      const text = extractText(response.content);
      await saveMessage(userId, "assistant", text);
      return text;
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
          const result = await executeTool(userId, block.name, block.input);
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
    await saveMessage(userId, "assistant", text);
    return text;
  }

  // If we ran out of steps
  const fallback = "I got stuck in a loop — let's try that again.";
  await saveMessage(userId, "assistant", fallback);
  return fallback;
}
