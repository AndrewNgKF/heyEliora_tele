import {
  claimReminder,
  completeReminder,
  failReminder,
  getDueReminders,
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
      await failReminder(
        msg.id,
        error instanceof Error ? error.message : String(error),
      );
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
