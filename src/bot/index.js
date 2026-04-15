import { Bot } from "grammy";
import { chat } from "../llm/chat.js";
import { ensureUser, clearHistory } from "../db/queries.js";

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
