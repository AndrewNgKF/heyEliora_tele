import {
  createScheduledMessage,
  updateReminder,
  cancelReminder,
  saveGoal,
  updateGoal,
  removeGoal,
  setPreferences,
  logProgress,
  isValidTimezone,
  setTimezone,
  updateNudgeSettings,
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
    name: "update_reminder",
    description:
      "Update an existing reminder's time, content, or schedule type. Use this instead of creating a new reminder when the user wants to reschedule or edit one. Cancel the old + create new is wrong — use this tool instead.",
    input_schema: {
      type: "object",
      properties: {
        reminder_id: {
          type: "string",
          description: "The id of the existing reminder to update",
        },
        content: {
          type: "string",
          description: "Updated reminder text, if changed",
        },
        remind_at_utc: {
          type: "string",
          description: "Updated ISO-8601 timestamp in UTC, if the time changed",
        },
        schedule_type: {
          type: "string",
          enum: ["one_time", "daily", "weekly"],
          description: "Updated schedule type, if changed",
        },
      },
      required: ["reminder_id"],
    },
  },
  {
    name: "cancel_reminder",
    description:
      "Cancel an existing reminder. Confirm with the user before calling this.",
    input_schema: {
      type: "object",
      properties: {
        reminder_id: {
          type: "string",
          description: "The id of the reminder to cancel",
        },
      },
      required: ["reminder_id"],
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
  {
    name: "update_nudge_settings",
    description:
      "Update how often Eliora proactively checks in with the user. Call this when the user mentions wanting more or fewer check-ins, nudges, or accountability reminders. Examples: 'check in daily' → frequency='daily', 'stop nagging me' → enabled=false, 'nudge me weekly' → frequency='weekly'.",
    input_schema: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description:
            "Whether nudges are enabled. Set false only if user explicitly wants NO check-ins.",
        },
        frequency: {
          type: "string",
          enum: ["daily", "every_3_days", "weekly"],
          description:
            "How often Eliora checks in. daily = every day, every_3_days = default, weekly = once a week.",
        },
        quiet_start: {
          type: "string",
          description:
            "Time to stop nudging (HH:MM, 24h). E.g. '22:00' for 10pm.",
        },
        quiet_end: {
          type: "string",
          description:
            "Time to resume nudging (HH:MM, 24h). E.g. '08:00' for 8am.",
        },
      },
    },
    cache_control: { type: "ephemeral" },
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
      const reminderId = await createScheduledMessage(telegramId, {
        content: input.content,
        runAt: input.remind_at_utc,
        scheduleType: input.schedule_type,
        kind: "reminder",
        source: "user",
      });
      return `Reminder saved (id:${reminderId}) for ${input.remind_at_utc} (${input.schedule_type}): "${input.content}"`;
    }
    case "update_reminder": {
      await updateReminder(telegramId, input.reminder_id, {
        content: input.content,
        runAt: input.remind_at_utc,
        scheduleType: input.schedule_type,
      });
      return `Reminder ${input.reminder_id} updated.`;
    }
    case "cancel_reminder": {
      await cancelReminder(telegramId, input.reminder_id);
      return `Reminder ${input.reminder_id} cancelled.`;
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
    case "update_nudge_settings": {
      await updateNudgeSettings(telegramId, {
        enabled: input.enabled,
        frequency: input.frequency,
        quietStart: input.quiet_start,
        quietEnd: input.quiet_end,
      });
      const parts = [];
      if (input.enabled != null) parts.push(`enabled: ${input.enabled}`);
      if (input.frequency) parts.push(`frequency: ${input.frequency}`);
      if (input.quiet_start)
        parts.push(`quiet hours start: ${input.quiet_start}`);
      if (input.quiet_end) parts.push(`quiet hours end: ${input.quiet_end}`);
      return `Nudge settings updated — ${parts.join(", ")}`;
    }
    default:
      return `Unknown tool: ${toolName}`;
  }
}
