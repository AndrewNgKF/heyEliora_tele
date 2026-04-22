import { Composer, InlineKeyboard } from "grammy";
import { chat } from "../llm/chat.js";
import {
  clearHistory,
  forgetUser,
  getGoals,
  listReminders,
  cancelReminder,
  removeGoal,
  getPreferences,
  getRecentProgress,
  checkUsage,
  incrementUsage,
  getUserMeta,
  getUserSummary,
  getNudgeSettings,
  getActivityStreak,
  saveFeedback,
} from "../db/queries.js";
import { TIMEZONE_OPTIONS, HOWTO_TEXT } from "../config/CONSTANTS.js";
import {
  formatGoalList,
  formatReminderList,
  performCheckIn,
} from "./helpers.js";

export const commands = new Composer();

// /start
commands.command("start", async (ctx) => {
  const name = ctx.userName || "there";

  const keyboard = new InlineKeyboard().text("Tell me more", "action:howto");

  await ctx.replyMd(
    `Hey ${name}, I'm *Eliora*! \n\n` +
      `I remember what you're working on, notice patterns and trends, and provide strategic advice!\n\n` +
      `So let's start here: \n\nWhat's the most pressing thing on your mind right now?`,
    { reply_markup: keyboard },
  );
});

// /forget
commands.command("forget", async (ctx) => {
  await forgetUser(ctx.userId);
  await ctx.reply(
    "Done — I've forgotten everything. Your profile is kept, but goals, preferences, history, and all notes are wiped. Fresh start!",
  );
});

// /howto
commands.command("howto", async (ctx) => {
  await ctx.replyMd(HOWTO_TEXT);
});

// /goals
commands.command("goals", async (ctx) => {
  const text = ctx.message.text.replace("/goals", "").trim();

  if (text.startsWith("remove ")) {
    const goalId = text.replace("remove ", "").trim();
    if (!goalId) {
      await ctx.reply("Usage: /goals remove <id>");
      return;
    }
    await removeGoal(ctx.userId, goalId);
    await ctx.reply("Goal removed.");
    return;
  }

  const goals = await getGoals(ctx.userId);
  if (goals.length === 0) {
    await ctx.reply(
      "You don't have any goals set yet.\n\nJust tell me what you're working toward and I'll help you define it.",
    );
    return;
  }

  await ctx.reply(
    `Your current goals:\n\n${formatGoalList(goals)}\n\nRemove: /goals remove <ID>\n\nOr just tell me about a new goal and we'll work through it together.`,
  );
});

// /preferences
commands.command("preferences", async (ctx) => {
  const prefs = await getPreferences(ctx.userId);
  if (!prefs || (!prefs.workStyle && !prefs.tone && !prefs.schedulePref)) {
    await ctx.reply(
      "No preferences set yet.\n\nJust tell me how you like to work — I'll pick it up naturally.",
    );
    return;
  }
  const lines = [];
  if (prefs.workStyle) lines.push(`Work style: ${prefs.workStyle}`);
  if (prefs.tone) lines.push(`Tone: ${prefs.tone}`);
  if (prefs.schedulePref) lines.push(`Schedule: ${prefs.schedulePref}`);
  await ctx.reply(`Your preferences:\n\n${lines.join("\n")}`);
});

// /whatsup
commands.command("whatsup", async (ctx) => {
  const goals = await getGoals(ctx.userId);
  if (goals.length === 0) {
    await ctx.reply(
      "You haven't set any goals yet. Try /goals to add some first!",
    );
    return;
  }

  const usage = await checkUsage(ctx.userId);
  if (!usage.allowed) {
    await ctx.reply(
      `You've hit your daily limit of ${usage.limit} messages. Resets at midnight in your timezone.`,
    );
    return;
  }

  const {
    text: reply,
    inputTokens,
    outputTokens,
  } = await performCheckIn(ctx.userId, goals);
  await incrementUsage(ctx.userId, inputTokens, outputTokens);
  await ctx.replyMd(reply);
});

// /progress
commands.command("progress", async (ctx) => {
  const entries = await getRecentProgress(ctx.userId, 15);
  if (entries.length === 0) {
    await ctx.reply(
      "No progress entries yet.\n\nJust tell me what you've been up to and I'll start tracking it against your goals.",
    );
    return;
  }

  const byGoal = {};
  for (const e of entries) {
    if (!byGoal[e.goal]) byGoal[e.goal] = [];
    byGoal[e.goal].push(e);
  }

  let text = "Your recent progress:\n";
  for (const [goal, goalEntries] of Object.entries(byGoal)) {
    text += `\n📌 ${goal}\n`;
    for (const e of goalEntries) {
      const date = new Date(e.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      text += `  ${date} — ${e.content}\n`;
    }
  }
  await ctx.reply(text);
});

// /remind
commands.command("remind", async (ctx) => {
  const text = ctx.message.text.replace("/remind", "").trim();
  if (!text) {
    await ctx.reply(
      "Tell me what and when. Examples: /remind me to stretch at 3pm tomorrow, /remind me every day at 9am to plan, /remind me every Monday at 8am to review goals",
    );
    return;
  }

  const usage = await checkUsage(ctx.userId);
  if (!usage.allowed) {
    await ctx.reply(
      `You've hit your daily limit of ${usage.limit} messages. Resets at midnight in your timezone.`,
    );
    return;
  }

  try {
    const {
      text: reply,
      inputTokens,
      outputTokens,
    } = await chat(ctx.userId, `Please help me set this reminder: ${text}`);
    await incrementUsage(ctx.userId, inputTokens, outputTokens);
    await ctx.replyMd(reply);
  } catch (err) {
    console.error("[eliora] /remind error:", err);
    await ctx.reply("Sorry, something went wrong. Try again in a moment.");
  }
});

// /reminders
commands.command("reminders", async (ctx) => {
  const text = ctx.message.text.replace("/reminders", "").trim();

  if (text.startsWith("cancel ")) {
    const reminderId = text.replace("cancel ", "").trim();
    if (!reminderId) {
      await ctx.reply("Usage: /reminders cancel <id>");
      return;
    }
    await cancelReminder(ctx.userId, reminderId);
    await ctx.reply("Reminder cancelled.");
    return;
  }

  const reminders = await listReminders(ctx.userId, 20);
  if (reminders.length === 0) {
    await ctx.reply(
      "You don't have any active reminders. Ask me naturally, or use /remind to set one.",
    );
    return;
  }

  const { timezone } = await getUserMeta(ctx.userId);

  await ctx.reply(
    `Your active reminders:\n\n${formatReminderList(reminders, timezone)}\n\nCancel one with: /reminders cancel <id>`,
  );
});

// /timezone
commands.command("timezone", async (ctx) => {
  const { timezone } = await getUserMeta(ctx.userId);

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < TIMEZONE_OPTIONS.length; i++) {
    const [label, tz] = TIMEZONE_OPTIONS[i];
    keyboard.text(label, `tz:${tz}`);
    if (i % 2 === 1) keyboard.row();
  }

  await ctx.replyMd(
    `Your timezone: *${timezone}*\n\nTap to change, or just tell me where you live and I'll figure it out.`,
    { reply_markup: keyboard },
  );
});

// /usage
commands.command("usage", async (ctx) => {
  const { tier } = await getUserMeta(ctx.userId);
  const usage = await checkUsage(ctx.userId);
  const used = usage.limit - usage.remaining;

  await ctx.replyMd(
    `*Usage today*\n\n` +
      `Tier: *${tier}*\n` +
      `Messages: ${used} / ${usage.limit} (${usage.remaining} left)`,
  );
});

// /profile
commands.command("profile", async (ctx) => {
  const name = ctx.userName || "Unknown";

  const [{ tier, timezone }, usage, goals, prefs, entries] = await Promise.all([
    getUserMeta(ctx.userId),
    checkUsage(ctx.userId),
    getGoals(ctx.userId),
    getPreferences(ctx.userId),
    getRecentProgress(ctx.userId, 5),
  ]);

  const used = usage.limit - usage.remaining;

  let text = `*${name}'s Profile*\n`;

  text += `\n*Plan:* ${tier}`;
  text += `\n*Timezone:* ${timezone}`;
  text += `\n*Usage today:* ${used} / ${usage.limit} messages`;

  if (goals.length > 0) {
    text += `\n\n*Goals (${goals.length})*`;
    for (const g of goals) {
      text += `\n• ${g.goal}`;
      if (g.target) text += ` → ${g.target}`;
    }
  } else {
    text += `\n\n*Goals:* None set yet`;
  }

  if (prefs && (prefs.workStyle || prefs.tone || prefs.schedulePref)) {
    text += `\n\n*Preferences*`;
    if (prefs.workStyle) text += `\n• Work style: ${prefs.workStyle}`;
    if (prefs.tone) text += `\n• Tone: ${prefs.tone}`;
    if (prefs.schedulePref) text += `\n• Schedule: ${prefs.schedulePref}`;
  }

  if (entries.length > 0) {
    text += `\n\n*Recent activity*`;
    for (const e of entries) {
      const date = new Date(e.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      text += `\n• ${date} — ${e.content}`;
    }
  }

  await ctx.replyMd(text);
});

// /mydata — full transparency: everything Eliora knows about you
commands.command("mydata", async (ctx) => {
  const name = ctx.userName || "Unknown";

  const [
    { tier, timezone, createdAt },
    usage,
    goals,
    prefs,
    entries,
    summary,
    nudge,
    activity,
  ] = await Promise.all([
    getUserMeta(ctx.userId),
    checkUsage(ctx.userId),
    getGoals(ctx.userId),
    getPreferences(ctx.userId),
    getRecentProgress(ctx.userId, 10),
    getUserSummary(ctx.userId),
    getNudgeSettings(ctx.userId),
    getActivityStreak(ctx.userId, (await getUserMeta(ctx.userId)).timezone),
  ]);

  const used = usage.limit - usage.remaining;

  let text = `*Everything Eliora knows about ${name}*\n`;
  text += `_This is all the data stored about you._\n`;

  // Account
  text += `\n*Account*`;
  text += `\n• Plan: ${tier}`;
  text += `\n• Timezone: ${timezone}`;
  text += `\n• Joined: ${new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`;

  // Usage
  text += `\n\n*Usage today*`;
  text += `\n• Messages: ${used} / ${usage.limit} (${usage.remaining} left)`;

  // Goals
  if (goals.length > 0) {
    text += `\n\n*Goals (${goals.length})*`;
    for (const g of goals) {
      text += `\n• ${g.goal}`;
      if (g.target) text += ` → ${g.target}`;
      if (g.deadline) text += ` (by ${g.deadline})`;
    }
  } else {
    text += `\n\n*Goals:* None set`;
  }

  // Preferences
  if (prefs && (prefs.workStyle || prefs.tone || prefs.schedulePref)) {
    text += `\n\n*Preferences*`;
    if (prefs.workStyle) text += `\n• Work style: ${prefs.workStyle}`;
    if (prefs.tone) text += `\n• Tone: ${prefs.tone}`;
    if (prefs.schedulePref) text += `\n• Schedule: ${prefs.schedulePref}`;
  } else {
    text += `\n\n*Preferences:* None set`;
  }

  // Activity
  text += `\n\n*Activity*`;
  text += `\n• Current streak: ${activity.streak} days`;
  text += `\n• Active days (last 7): ${activity.last7}`;

  // Recent progress
  if (entries.length > 0) {
    text += `\n\n*Recent progress (last ${entries.length})*`;
    for (const e of entries) {
      const date = new Date(e.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      text += `\n• ${date} — ${e.content}`;
    }
  } else {
    text += `\n\n*Progress entries:* None yet`;
  }

  // Nudge settings
  text += `\n\n*Nudge settings*`;
  text += `\n• Enabled: ${nudge.enabled ? "Yes" : "No"}`;
  text += `\n• Frequency: ${nudge.frequency.replace(/_/g, " ")}`;
  text += `\n• Quiet hours: ${nudge.quietStart} – ${nudge.quietEnd}`;

  // AI summary — the "brain"
  if (summary && summary.summary) {
    text += `\n\n*Eliora's internal notes about you*`;
    text += `\n_This is the summary she uses to remember context between conversations:_\n`;
    text += `\n${summary.summary}`;
  } else {
    text += `\n\n*Eliora's internal notes:* None yet (built after a few conversations)`;
  }

  text += `\n\n---`;
  text += `\nTo delete everything: /forget`;

  await ctx.replyMd(text);
});

// /feedback — let users send feedback to the team
commands.command("feedback", async (ctx) => {
  const text = ctx.message.text.replace(/^\/feedback(@\w+)?/, "").trim();

  if (!text) {
    await ctx.reply(
      "Tell me what's on your mind.\n\n" +
        "Usage: /feedback <your message>\n\n" +
        "Example: /feedback I love the streak tracking, but I wish I could pause nudges for a few days.",
    );
    return;
  }

  if (text.length > 2000) {
    await ctx.reply(
      "That's a lot to chew on \u2014 please keep feedback under 2000 characters.",
    );
    return;
  }

  try {
    await saveFeedback(ctx.userId, ctx.userName || null, text);
  } catch (err) {
    console.error("[eliora] /feedback save error:", err);
    await ctx.reply("Sorry, couldn't save that. Try again in a moment.");
    return;
  }

  // Optional: forward to admin chat if configured
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (adminChatId) {
    const from = ctx.userName ? `${ctx.userName} (${ctx.userId})` : ctx.userId;
    ctx.api
      .sendMessage(adminChatId, `\u{1F4E9} Feedback from ${from}:\n\n${text}`)
      .catch((err) =>
        console.error("[eliora] /feedback admin forward error:", err),
      );
  }

  await ctx.reply(
    "Got it \u2014 thank you. Every note is read by the team and shapes what comes next.",
  );
});

// --- Free-form text messages (must be last) ---

// In-memory dedup for media groups (albums). Telegram delivers each photo in
// an album as its own update within ~1s, sharing a media_group_id. We reply
// once on the first photo asking the user to send them one at a time, and
// silently drop the rest. On Vercel serverless this Map lives per-instance;
// worst case (cold split across instances) the user gets the "send one at a
// time" reply twice, which is still the correct guidance.
const seenMediaGroups = new Map(); // media_group_id -> expires_at_ms
function claimMediaGroup(id) {
  const now = Date.now();
  // Sweep stale entries (>10 min old) so the map doesn't leak.
  for (const [k, exp] of seenMediaGroups) {
    if (exp < now) seenMediaGroups.delete(k);
  }
  if (seenMediaGroups.has(id)) return false;
  seenMediaGroups.set(id, now + 10 * 60 * 1000);
  return true;
}

// /photo — user sends an image (food, workout screenshot, journal page, etc.)
// We download bytes from Telegram (URL contains the bot token, must not leave
// our infra), base64-encode, and pass inline to Claude. Image bytes are not
// persisted anywhere; only the caption + an "[image]" marker are saved to
// message history so future turns know visual context existed.
commands.on("message:photo", async (ctx) => {
  // Albums: we don't process any of the photos. Reply once on the first one
  // asking the user to send them one at a time, then silently drop the rest.
  if (ctx.message.media_group_id) {
    const isFirst = claimMediaGroup(ctx.message.media_group_id);
    if (!isFirst) return;
    await ctx.reply(
      "I can only look at one photo at a time. Send them one by one and tell me what you want me to notice on each.",
    );
    return;
  }

  const usage = await checkUsage(ctx.userId);
  if (!usage.allowed) {
    await ctx.reply(
      `You've hit your daily limit of ${usage.limit} messages. Resets at midnight in your timezone.\n\nWant more? Please Upgrade to a paid plan to increase your limits and support development!`,
    );
    return;
  }

  try {
    // Telegram includes the same photo at multiple resolutions, ascending.
    // Last entry is the largest — that's what we want for vision quality.
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    const file = await ctx.api.getFile(largest.file_id);
    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Telegram file fetch failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    // Defense in depth: Telegram compresses message:photo client-side to
    // ~1280px JPEG (typically 150-500 KB), so this should never trigger.
    // But if someone finds a way around it, fail safely before we burn
    // tokens or hit Anthropic's 5 MB image cap.
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    if (buffer.length > MAX_IMAGE_BYTES) {
      await ctx.reply(
        "That image is too large for me to read. Try sending a smaller version?",
      );
      return;
    }

    const data = buffer.toString("base64");

    const lower = (file.file_path || "").toLowerCase();
    const mediaType = lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
        ? "image/webp"
        : lower.endsWith(".gif")
          ? "image/gif"
          : "image/jpeg";

    const caption = ctx.message.caption || "";
    const {
      text: reply,
      inputTokens,
      outputTokens,
    } = await chat(ctx.userId, caption, {
      image: { mediaType, data },
    });
    await incrementUsage(ctx.userId, inputTokens, outputTokens);
    await ctx.replyMd(reply);
  } catch (err) {
    console.error("[eliora] image error:", err);
    await ctx.reply(
      "Sorry, I couldn't process that image. Try sending it again?",
    );
  }
});

// /document — user sent a file (PDF, video, audio, or an uncompressed image).
// We don't process these yet. Politely tell them to resend as a photo so it
// goes through Telegram's compression and our vision pipeline.
commands.on("message:document", async (ctx) => {
  await ctx.reply(
    "I can read images, but only when sent as a photo or screenshot. Try sending it again with the photo button — that way I can take a look.",
  );
});

commands.on("message:text", async (ctx) => {
  const usage = await checkUsage(ctx.userId);
  if (!usage.allowed) {
    await ctx.reply(
      `You've hit your daily limit of ${usage.limit} messages. Resets at midnight in your timezone.\n\nWant more? Please Upgrade to a paid plan to increase your limits and support development!`,
    );
    return;
  }

  try {
    const {
      text: reply,
      inputTokens,
      outputTokens,
    } = await chat(ctx.userId, ctx.message.text);
    await incrementUsage(ctx.userId, inputTokens, outputTokens);
    await ctx.replyMd(reply);
  } catch (err) {
    console.error("[eliora] error:", err);
    await ctx.reply("Sorry, something went wrong. Try again in a moment.");
  }
});
