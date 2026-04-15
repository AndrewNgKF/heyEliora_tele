import { Bot } from "grammy";
import { chat } from "../llm/chat.js";
import {
  ensureUser,
  clearHistory,
  getGoals,
  removeGoal,
  getPreferences,
  getRecentEntries,
} from "../db/queries.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required in .env");

export const bot = new Bot(token);

// /start command
bot.command("start", async (ctx) => {
  await ensureUser(ctx.from.id.toString(), ctx.from.first_name);
  await ctx.reply(
    "Hey! I'm Eliora, your personal assistant. Tell me what's on your mind.",
  );
});

// /forget command — clears conversation history
bot.command("forget", async (ctx) => {
  const userId = ctx.from.id.toString();
  await clearHistory(userId);
  await ctx.reply("Done — I've forgotten our conversation. Fresh start!");
});

// /goals command — view or remove goals (adding happens conversationally)
bot.command("goals", async (ctx) => {
  const userId = ctx.from.id.toString();
  const text = ctx.message.text.replace("/goals", "").trim();

  // /goals remove 2
  if (text.startsWith("remove ")) {
    const goalId = parseInt(text.replace("remove ", ""), 10);
    if (isNaN(goalId)) {
      await ctx.reply("Usage: /goals remove <number>");
      return;
    }
    await removeGoal(userId, goalId);
    await ctx.reply("Goal removed.");
    return;
  }

  // /goals (no args or with text) — list current goals
  const goals = await getGoals(userId);
  if (goals.length === 0) {
    await ctx.reply(
      "You don't have any goals set yet.\n\nJust tell me what you're working toward and I'll help you define it.",
    );
    return;
  }
  const list = goals
    .map((g, i) => `${i + 1}. ${g.goal} (id:${g.id})`)
    .join("\n");
  await ctx.reply(
    `Your current goals:\n\n${list}\n\nRemove: /goals remove <id>\nOr just tell me about a new goal and we'll work through it together.`,
  );
});

// /preferences command — view current preferences (setting happens conversationally)
bot.command("preferences", async (ctx) => {
  const userId = ctx.from.id.toString();
  const prefs = await getPreferences(userId);
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

// /whatsup command — goal alignment check-in
bot.command("whatsup", async (ctx) => {
  const userId = ctx.from.id.toString();
  const goals = await getGoals(userId);

  if (goals.length === 0) {
    await ctx.reply(
      "You haven't set any goals yet. Try /goals to add some first!",
    );
    return;
  }

  const goalList = goals.map((g) => `- ${g.goal}`).join("\n");
  const entries = await getRecentEntries(userId, 10);
  const entryContext =
    entries.length > 0
      ? `\n\nRecent activity:\n${entries.map((e) => `- [${e.created_at}] (${e.goal}) ${e.content}`).join("\n")}`
      : "\n\nNo progress entries logged yet.";

  const reply = await chat(
    userId,
    `[SYSTEM CHECK-IN] Give me a quick accountability check-in. Here are my goals:\n${goalList}${entryContext}\n\nBased on my recent activity and our conversations, how am I tracking? Be honest — call me out if I'm drifting.`,
  );
  await ctx.reply(reply);
});

// /progress command — view recent progress entries
bot.command("progress", async (ctx) => {
  const userId = ctx.from.id.toString();
  const entries = await getRecentEntries(userId, 15);

  if (entries.length === 0) {
    await ctx.reply(
      "No progress entries yet.\n\nJust tell me what you've been up to and I'll start tracking it against your goals.",
    );
    return;
  }

  // Group entries by goal
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

// Handle all text messages
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const userMessage = ctx.message.text;

  await ensureUser(userId, ctx.from.first_name);

  try {
    const reply = await chat(userId, userMessage);
    await ctx.reply(reply);
  } catch (err) {
    console.error("[eliora] error:", err);
    await ctx.reply("Sorry, something went wrong. Try again in a moment.");
  }
});
