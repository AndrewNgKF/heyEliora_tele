import { Composer, InlineKeyboard } from "grammy";
import { chat } from "../llm/chat.js";
import {
  clearHistory,
  getGoals,
  removeGoal,
  getPreferences,
  getRecentProgress,
  checkUsage,
  incrementUsage,
  getUserMeta,
} from "../db/queries.js";
import {
  getTierConfig,
  TIMEZONE_OPTIONS,
  HOWTO_TEXT,
} from "../config/CONSTANTS.js";
import { formatGoalList, performCheckIn } from "./helpers.js";

export const commands = new Composer();

// /start
commands.command("start", async (ctx) => {
  const name = ctx.userName || "there";

  const keyboard = new InlineKeyboard()
    .text("Set a goal 🎯", "action:setgoal")
    .text("What can you do? 💡", "action:howto")
    .row()
    .text("My goals 📋", "action:goals")
    .text("Check-in 👋", "action:whatsup");

  await ctx.replyMd(
    `Hey ${name}! I'm *Eliora* — your personal AI assistant.\n\n` +
      `I live right here in Telegram. Tell me what you're working on, what you want to achieve, or what's on your plate — and I'll help you stay sharp.\n\n` +
      `🎯 *Goals* — I'll help you define them clearly and track your progress\n` +
      `📊 *Accountability* — honest check-ins based on what you're actually doing\n` +
      `🧠 *Memory* — I remember your goals, preferences, and context\n\n` +
      `Just talk to me like you would a friend. I'll figure out the rest.`,
    { reply_markup: keyboard },
  );
});

// /forget
commands.command("forget", async (ctx) => {
  await clearHistory(ctx.userId);
  await ctx.reply("Done — I've forgotten our conversation. Fresh start!");
});

// /howto
commands.command("howto", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Set a goal 🎯", "action:setgoal")
    .text("Check-in 👋", "action:whatsup");

  await ctx.replyMd(HOWTO_TEXT, { reply_markup: keyboard });
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
    `Your current goals:\n\n${formatGoalList(goals)}\n\nRemove: /goals remove <id>\nOr just tell me about a new goal and we'll work through it together.`,
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

  const reply = await performCheckIn(ctx.userId, goals);
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
  const config = getTierConfig(tier);
  const usage = await checkUsage(ctx.userId);
  const used = config.dailyLimit - usage.remaining;

  await ctx.replyMd(
    `📊 *Usage today*\n\n` +
      `Tier: *${tier}*\n` +
      `Messages: ${used} / ${usage.limit}\n` +
      `Remaining: ${usage.remaining}`,
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

  const config = getTierConfig(tier);
  const used = config.dailyLimit - usage.remaining;

  let text = `👤 *${name}'s Profile*\n`;

  text += `\n*Plan:* ${tier}`;
  text += `\n*Timezone:* ${timezone}`;
  text += `\n*Usage today:* ${used} / ${usage.limit} messages`;

  if (goals.length > 0) {
    text += `\n\n🎯 *Goals (${goals.length})*`;
    for (const g of goals) {
      text += `\n• ${g.goal}`;
      if (g.target) text += ` → ${g.target}`;
    }
  } else {
    text += `\n\n🎯 *Goals:* None set yet`;
  }

  if (prefs && (prefs.workStyle || prefs.tone || prefs.schedulePref)) {
    text += `\n\n⚙️ *Preferences*`;
    if (prefs.workStyle) text += `\n• Work style: ${prefs.workStyle}`;
    if (prefs.tone) text += `\n• Tone: ${prefs.tone}`;
    if (prefs.schedulePref) text += `\n• Schedule: ${prefs.schedulePref}`;
  }

  if (entries.length > 0) {
    text += `\n\n📝 *Recent activity*`;
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

// --- Free-form text messages (must be last) ---

commands.on("message:text", async (ctx) => {
  const usage = await checkUsage(ctx.userId);
  if (!usage.allowed) {
    await ctx.reply(
      `You've hit your daily limit of ${usage.limit} messages. Resets at midnight in your timezone.\n\nWant more? Upgrades coming soon.`,
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
