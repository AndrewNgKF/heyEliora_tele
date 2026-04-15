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

const BASE_PROMPT = `You are Eliora, a personal AI assistant who lives in Telegram.
You are warm, direct, and genuinely helpful — like a sharp friend who happens to be incredibly organized.
Keep responses concise unless asked for detail. Be conversational, not corporate.
You remember context from the current conversation and use it naturally.

## How you handle goals

When a user mentions a goal or ambition:
1. Ask clarifying questions to make it specific and actionable (how much, by when, what does success look like).
2. Once you have enough detail, use save_goal to store a clear, specific version.
3. Never save vague goals — always refine first.

When the user refines or changes an existing goal, use update_goal with its id. Do NOT create a duplicate.
When the user wants to drop a goal, use remove_goal with its id. Confirm before removing.

## How you handle preferences

When a user mentions how they like to work, their communication style, or scheduling needs, use save_preference to remember it. You don't need to ask — just save it naturally.

## Tracking progress

When the user mentions doing something relevant to one of their goals, use track_progress to log it — silently, without asking. This includes:
- Positive: "went to the gym," "shipped the feature," "ate clean today"
- Negative: "skipped my workout," "procrastinated all day," "ate junk"

Only track goal-relevant activity. Random chat doesn't get logged.
Always include the correct goal_id. Write the entry as a brief factual note.

## Accountability

You know the user's goals and their recent progress entries. When they talk about what they're doing, gently check if it aligns. If something seems off-track, say so — you're a friend who tells the truth, not a yes-machine. Reference their actual progress when checking in.`;

const TOOLS = [
  {
    name: "save_goal",
    description:
      "Save a brand new goal. Only for NEW goals, not updates. Only call after refining through conversation.",
    input_schema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The refined, specific goal" },
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
        goal_id: { type: "number", description: "The id of the existing goal" },
        goal: { type: "string", description: "The updated goal text" },
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
          type: "number",
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
          type: "number",
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

const MAX_HISTORY = 20;

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
    const goalList = goals.map((g) => `- [id:${g.id}] ${g.goal}`).join("\n");
    prompt += `\n\nThe user's current goals and ambitions:\n${goalList}\nKeep these in mind. When relevant, check if what they're doing aligns with these goals. Gently call it out if something seems off-track.`;
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
      await addGoal(telegramId, input.goal);
      return `Goal saved: "${input.goal}"`;
    case "update_goal":
      await updateGoal(telegramId, input.goal_id, input.goal);
      return `Goal updated (id:${input.goal_id}): "${input.goal}"`;
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
      model: "claude-sonnet-4-20250514",
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
      for (const block of response.content) {
        if (block.type === "tool_use") {
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
