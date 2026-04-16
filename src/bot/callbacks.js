import { Composer } from "grammy";
import { chat } from "../llm/chat.js";
import {
  getGoals,
  isValidTimezone,
  setTimezone,
  checkUsage,
  incrementUsage,
} from "../db/queries.js";
import { HOWTO_TEXT } from "../config/CONSTANTS.js";
import { formatGoalList, performCheckIn } from "./helpers.js";

export const callbacks = new Composer();

callbacks.on("callback_query:data", async (ctx) => {
  const action = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();

  // Timezone buttons
  if (action.startsWith("tz:")) {
    const tz = action.slice(3);
    if (isValidTimezone(tz)) {
      await setTimezone(ctx.userId, tz);
      await ctx.replyMd(`Timezone set to *${tz}* ✓`);
    } else {
      await ctx.reply(
        "That timezone didn't work. Tell me where you are and I'll set it.",
      );
    }
    return;
  }

  switch (action) {
    case "action:setgoal": {
      const usage = await checkUsage(ctx.userId);
      if (!usage.allowed) {
        await ctx.reply(
          `You've hit your daily limit of ${usage.limit} messages. Resets at midnight in your timezone.`,
        );
        break;
      }
      try {
        const {
          text: reply,
          inputTokens,
          outputTokens,
        } = await chat(
          ctx.userId,
          "I want to set a new goal. Help me figure out what to work on.",
        );
        await incrementUsage(ctx.userId, inputTokens, outputTokens);
        await ctx.replyMd(reply);
      } catch (err) {
        console.error("[eliora] callback setgoal error:", err);
        await ctx.reply("Sorry, something went wrong. Try again in a moment.");
      }
      break;
    }
    case "action:goals": {
      const goals = await getGoals(ctx.userId);
      if (goals.length === 0) {
        await ctx.reply(
          "You don't have any goals set yet.\n\nJust tell me what you're working toward and I'll help you define it.",
        );
      } else {
        await ctx.reply(`Your current goals:\n\n${formatGoalList(goals)}`);
      }
      break;
    }
    case "action:whatsup": {
      const goals = await getGoals(ctx.userId);
      if (goals.length === 0) {
        await ctx.reply(
          "You haven't set any goals yet. Tell me what you're working on!",
        );
        break;
      }
      const usage = await checkUsage(ctx.userId);
      if (!usage.allowed) {
        await ctx.reply(
          `You've hit your daily limit of ${usage.limit} messages. Resets at midnight in your timezone.`,
        );
        break;
      }
      try {
        const reply = await performCheckIn(ctx.userId, goals);
        await ctx.replyMd(reply);
      } catch (err) {
        console.error("[eliora] callback whatsup error:", err);
        await ctx.reply("Sorry, something went wrong. Try again in a moment.");
      }
      break;
    }
    case "action:howto": {
      await ctx.replyMd(HOWTO_TEXT);
      break;
    }
  }
});
