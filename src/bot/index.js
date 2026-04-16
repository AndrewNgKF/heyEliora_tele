import { Bot } from "grammy";
import { setUserContext, syncUser, addReplyHelpers } from "./middleware.js";
import { commands } from "./commands.js";
import { callbacks } from "./callbacks.js";
import { COMMANDS } from "../config/CONSTANTS.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required in .env");

export const bot = new Bot(token);

// Register command menu (fire-and-forget is fine — logs errors)
bot.api
  .setMyCommands(COMMANDS)
  .catch((err) => console.error("[eliora] failed to set commands:", err));

// Middleware — runs before every handler
bot.use(setUserContext);
bot.use(syncUser);
bot.use(addReplyHelpers);

// Handlers
bot.use(commands);
bot.use(callbacks);
