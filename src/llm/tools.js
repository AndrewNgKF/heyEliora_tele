import {
  createReminder,
  saveGoal,
  updateGoal,
  removeGoal,
  setPreferences,
  logProgress,
  isValidTimezone,
  setTimezone,
} from "../db/queries.js";

/** Tool definitions sent to Claude */
export const TOOLS = [
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
  {
    name: "set_reminder",
    description:
      "Create a reminder when the user asks to be reminded at a specific time. Support one-time, daily, and weekly reminders. Ask a follow-up if the timing or recurrence is ambiguous. Convert the reminder time to UTC before calling this tool.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "What the user wants to be reminded about",
        },
        remind_at_utc: {
          type: "string",
          description:
            "ISO-8601 timestamp in UTC, e.g. 2026-04-18T14:30:00.000Z",
        },
        schedule_type: {
          type: "string",
          enum: ["one_time", "daily", "weekly"],
          description: "Whether this reminder repeats",
        },
      },
      required: ["content", "remind_at_utc", "schedule_type"],
    },
  },
  {
    name: "set_timezone",
    description:
      "Set the user's timezone. Convert whatever they say (city, abbreviation, offset) to a valid IANA timezone like 'America/New_York' or 'Asia/Singapore'. Call silently when the user mentions where they live or their timezone.",
    input_schema: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description:
            "IANA timezone identifier (e.g. 'America/New_York', 'Europe/London', 'Asia/Tokyo')",
        },
      },
      required: ["timezone"],
    },
  },
];

/**
 * Execute a tool call from Claude
 * @param {string} telegramId
 * @param {string} toolName
 * @param {Record<string, any>} input
 * @returns {Promise<string>}
 */
export async function executeTool(telegramId, toolName, input) {
  switch (toolName) {
    case "set_reminder": {
      const reminderId = await createReminder(telegramId, {
        content: input.content,
        runAt: input.remind_at_utc,
        scheduleType: input.schedule_type,
        kind: "reminder",
        source: "user",
      });
      return `Reminder saved (id:${reminderId}) for ${input.remind_at_utc} (${input.schedule_type}): "${input.content}"`;
    }
    case "save_goal":
      await saveGoal(telegramId, input.goal, input.baseline, input.target);
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
      await logProgress(telegramId, input.goal_id, input.content);
      return `Entry logged for goal ${input.goal_id}: "${input.content}"`;
    case "set_timezone":
      if (!isValidTimezone(input.timezone)) {
        return `Invalid timezone: "${input.timezone}". Use an IANA timezone like "America/New_York" or "Asia/Tokyo".`;
      }
      await setTimezone(telegramId, input.timezone);
      return `Timezone set to ${input.timezone}`;
    default:
      return `Unknown tool: ${toolName}`;
  }
}
