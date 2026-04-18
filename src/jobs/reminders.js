/**
 * Compute the next run time for recurring reminders.
 * @param {{scheduleType: string, runAt: string}} reminder
 * @returns {string|null}
 */
export function getNextRunAt(reminder) {
  const current = new Date(reminder.runAt);
  if (Number.isNaN(current.getTime())) return null;

  switch (reminder.scheduleType) {
    case "daily":
      current.setUTCDate(current.getUTCDate() + 1);
      return current.toISOString();
    case "weekly":
      current.setUTCDate(current.getUTCDate() + 7);
      return current.toISOString();
    default:
      return null;
  }
}
import {
  claimReminder,
  completeReminder,
  failReminder,
  getDueReminders,
} from "../db/queries.js";

/**
 * Compute the next run time for recurring reminders.
 * @param {{scheduleType: string, runAt: string}} reminder
 * @returns {string|null}
 */
function getNextRunAt(reminder) {
  const current = new Date(reminder.runAt);
  if (Number.isNaN(current.getTime())) return null;

  switch (reminder.scheduleType) {
    case "daily":
      current.setUTCDate(current.getUTCDate() + 1);
      return current.toISOString();
    case "weekly":
      current.setUTCDate(current.getUTCDate() + 7);
      return current.toISOString();
    default:
      return null;
  }
}

/**
 * Format the scheduled message payload for Telegram.
 * @param {{kind: string, source: string, content: string}} msg
 */
function formatReminderMessage(msg) {
  return `⏰ *Reminder*\n\n${msg.content}`;
}

/**
 * Process due reminders and send them via Telegram.
 * @param {import("grammy").Bot} bot
 * @returns {Promise<{ processed: number, sent: number, failed: number, skipped: number }>}
 */
export async function processDueReminders(bot) {
  const nowIso = new Date().toISOString();
  const due = await getDueReminders(nowIso, 50);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const reminder of due) {
    const claimed = await claimReminder(reminder.id, nowIso);
    if (!claimed) {
      skipped++;
      continue;
    }

    try {
      await bot.api.sendMessage(
        reminder.telegramId,
        formatReminderMessage(reminder),
        { parse_mode: "Markdown" },
      );

      await completeReminder(reminder.id, getNextRunAt(reminder));
      sent++;
    } catch (error) {
      await failReminder(
        reminder.id,
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
