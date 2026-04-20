import {
  claimReminder,
  completeReminder,
  failReminder,
  getDueReminders,
  updateNudgeSettings,
} from "../db/queries.js";
import { getNextRunAt } from "./reminders.js";

/**
 * Format a scheduled message for Telegram based on its kind.
 * @param {{kind: string, content: string}} msg
 * @returns {string}
 */
function formatMessage(msg) {
  if (msg.kind === "nudge") {
    return `👋 ${msg.content}`;
  }
  return `⏰ *Reminder*\n\n${msg.content}`;
}

/**
 * Drain the scheduled_messages queue — send all due messages via Telegram.
 * Handles nudges, reminders, and any future message kinds.
 * @param {import("grammy").Bot} bot
 * @returns {Promise<{ processed: number, sent: number, failed: number, skipped: number }>}
 */
export async function processDueMessages(bot) {
  const nowIso = new Date().toISOString();
  const due = await getDueReminders(nowIso, 50);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const msg of due) {
    const claimed = await claimReminder(msg.id, nowIso);
    if (!claimed) {
      skipped++;
      continue;
    }

    try {
      await bot.api.sendMessage(msg.telegramId, formatMessage(msg), {
        parse_mode: "Markdown",
      });

      await completeReminder(msg.id, getNextRunAt(msg));
      sent++;
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : String(error);

      // User blocked or deleted the bot — disable nudges to stop wasting LLM tokens
      const code = error?.error_code || error?.status;
      if (code === 403) {
        console.log(
          `[eliora] user ${msg.telegramId} blocked bot — disabling nudges`,
        );
        await updateNudgeSettings(msg.telegramId, { enabled: false }).catch(
          () => {},
        );
      }

      await failReminder(msg.id, errMsg);
      failed++;
    }
  }

  return {
    processed: due.length,
    sent,
    failed,
    skipped,
  };
}
