import { Bot, InlineKeyboard } from "grammy";
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

// Register command menu (visible in the / button)
bot.api.setMyCommands([
  { command: "start", description: "Welcome + quick start" },
  { command: "goals", description: "View your goals" },
  { command: "progress", description: "Recent progress entries" },
  { command: "whatsup", description: "Accountability check-in" },
  { command: "preferences", description: "View your preferences" },
  { command: "howto", description: "What Eliora can do" },
  { command: "forget", description: "Clear conversation history" },
]);

// /start command
bot.command("start", async (ctx) => {
  await ensureUser(ctx.from.id.toString(), ctx.from.first_name);
  const name = ctx.from.first_name || "there";

  const keyboard = new InlineKeyboard()
    .text("Set a goal 🎯", "action:setgoal")
    .text("What can you do? 💡", "action:howto")
    .row()
    .text("My goals 📋", "action:goals")
    .text("Check-in 👋", "action:whatsup");

  await ctx.reply(
    `Hey ${name}! I'm *Eliora* — your personal AI assistant.\n\n` +
      `I live right here in Telegram. Tell me what you're working on, what you want to achieve, or what's on your plate — and I'll help you stay sharp.\n\n` +
      `🎯 *Goals* — I'll help you define them clearly and track your progress\n` +
      `📊 *Accountability* — honest check-ins based on what you're actually doing\n` +
      `🧠 *Memory* — I remember your goals, preferences, and context\n\n` +
      `Just talk to me like you would a friend. I'll figure out the rest.`,
    { parse_mode: "Markdown", reply_markup: keyboard },
  );
});

// /forget command — clears conversation history
bot.command("forget", async (ctx) => {
  const userId = ctx.from.id.toString();
  await clearHistory(userId);
  await ctx.reply("Done — I've forgotten our conversation. Fresh start!");
});

// /howto command — show what Eliora can do
bot.command("howto", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Set a goal 🎯", "action:setgoal")
    .text("Check-in 👋", "action:whatsup");

  await ctx.reply(
    `*Here's what I can do:*\n\n` +
      `🎯 *Goals* — Tell me what you're working toward. I'll ask questions to make it specific, then track it.\n` +
      `📝 *Progress* — Just tell me what you did (or didn't do). I'll log it against your goals automatically.\n` +
      `📊 *Check-ins* — /whatsup gives you an honest accountability report.\n` +
      `🗣 *Preferences* — Tell me how you like to work — I'll remember.\n` +
      `🧹 *Fresh start* — /forget clears our conversation history.\n\n` +
      `*Coming soon:* Read your documents, check your inbox, draft replies, manage your calendar — all through conversation.\n\n` +
      `No commands needed — just talk to me naturally.`,
    { parse_mode: "Markdown", reply_markup: keyboard },
  );
});

// /goals command — view or remove goals (adding happens conversationally)
bot.command("goals", async (ctx) => {
  const userId = ctx.from.id.toString();
  const text = ctx.message.text.replace("/goals", "").trim();

  // /goals remove a3kf9x
  if (text.startsWith("remove ")) {
    const goalId = text.replace("remove ", "").trim();
    if (!goalId) {
      await ctx.reply("Usage: /goals remove <id>");
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
    .map((g, i) => {
      let line = `${i + 1}. ${g.goal} (id:${g.id})`;
      if (g.baseline || g.target) {
        const parts = [];
        if (g.baseline) parts.push(`from: ${g.baseline}`);
        if (g.target) parts.push(`target: ${g.target}`);
        line += `\n   📊 ${parts.join(" → ")}`;
      }
      return line;
    })
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

  const goalList = goals
    .map((g) => {
      let line = `- ${g.goal}`;
      if (g.baseline) line += ` (baseline: ${g.baseline})`;
      if (g.target) line += ` (target: ${g.target})`;
      return line;
    })
    .join("\n");
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

// Handle inline button callbacks
bot.on("callback_query:data", async (ctx) => {
  const action = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();

  const userId = ctx.from.id.toString();
  await ensureUser(userId, ctx.from.first_name);

  switch (action) {
    case "action:setgoal": {
      const reply = await chat(
        userId,
        "I want to set a new goal. Help me figure out what to work on.",
      );
      try {
        await ctx.reply(reply, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(reply);
      }
      break;
    }
    case "action:goals": {
      const goals = await getGoals(userId);
      if (goals.length === 0) {
        await ctx.reply(
          "You don't have any goals set yet.\n\nJust tell me what you're working toward and I'll help you define it.",
        );
      } else {
        const list = goals
          .map((g, i) => {
            let line = `${i + 1}. ${g.goal} (id:${g.id})`;
            if (g.baseline || g.target) {
              const parts = [];
              if (g.baseline) parts.push(`from: ${g.baseline}`);
              if (g.target) parts.push(`target: ${g.target}`);
              line += `\n   📊 ${parts.join(" → ")}`;
            }
            return line;
          })
          .join("\n");
        await ctx.reply(`Your current goals:\n\n${list}`);
      }
      break;
    }
    case "action:whatsup": {
      const goals = await getGoals(userId);
      if (goals.length === 0) {
        await ctx.reply(
          "You haven't set any goals yet. Tell me what you're working on!",
        );
      } else {
        const goalList = goals
          .map((g) => {
            let line = `- ${g.goal}`;
            if (g.baseline) line += ` (baseline: ${g.baseline})`;
            if (g.target) line += ` (target: ${g.target})`;
            return line;
          })
          .join("\n");
        const entries = await getRecentEntries(userId, 10);
        const entryContext =
          entries.length > 0
            ? `\n\nRecent activity:\n${entries.map((e) => `- [${e.created_at}] (${e.goal}) ${e.content}`).join("\n")}`
            : "\n\nNo progress entries logged yet.";
        const reply = await chat(
          userId,
          `[SYSTEM CHECK-IN] Give me a quick accountability check-in. Here are my goals:\n${goalList}${entryContext}\n\nBased on my recent activity and our conversations, how am I tracking? Be honest — call me out if I'm drifting.`,
        );
        try {
          await ctx.reply(reply, { parse_mode: "Markdown" });
        } catch {
          await ctx.reply(reply);
        }
      }
      break;
    }
    case "action:howto": {
      await ctx.reply(
        `*Here's what I can do:*\n\n` +
          `🎯 *Goals* — Tell me what you're working toward. I'll ask questions to make it specific, then track it.\n` +
          `📝 *Progress* — Just tell me what you did (or didn't do). I'll log it against your goals automatically.\n` +
          `📊 *Check-ins* — /whatsup gives you an honest accountability report.\n` +
          `🗣 *Preferences* — Tell me how you like to work — I'll remember.\n` +
          `🧹 *Fresh start* — /forget clears our conversation history.\n\n` +
          `*Coming soon:* Read your documents, check your inbox, draft replies, manage your calendar — all through conversation.\n\n` +
          `No commands needed — just talk to me naturally.`,
        { parse_mode: "Markdown" },
      );
      break;
    }
  }
});

// Handle all text messages
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const userMessage = ctx.message.text;

  await ensureUser(userId, ctx.from.first_name);

  try {
    const reply = await chat(userId, userMessage);
    try {
      await ctx.reply(reply, { parse_mode: "Markdown" });
    } catch {
      // Fallback to plain text if Markdown parsing fails
      await ctx.reply(reply);
    }
  } catch (err) {
    console.error("[eliora] error:", err);
    await ctx.reply("Sorry, something went wrong. Try again in a moment.");
  }
});
