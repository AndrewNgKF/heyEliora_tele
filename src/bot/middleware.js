import { ensureUser } from "../db/queries.js";

const TG_MAX_LENGTH = 4096;
const TRUNCATION_SUFFIX = "\n\n…(truncated)";

/** Trim a message to fit Telegram's 4096-char limit. */
function truncate(text) {
  if (text.length <= TG_MAX_LENGTH) return text;
  return (
    text.slice(0, TG_MAX_LENGTH - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX
  );
}

/**
 * Attach userId and userName to the context for all downstream handlers.
 */
export async function setUserContext(ctx, next) {
  if (ctx.from) {
    ctx.userId = ctx.from.id.toString();
    ctx.userName = ctx.from.first_name || null;
  }
  return next();
}

/**
 * Ensure the user exists in the database before handling any update.
 */
export async function syncUser(ctx, next) {
  if (ctx.userId) {
    await ensureUser(ctx.userId, ctx.userName);
  }
  return next();
}

/**
 * Add ctx.replyMd() — sends Markdown (truncated to 4096), falls back to plain text on parse errors.
 */
export async function addReplyHelpers(ctx, next) {
  ctx.replyMd = async (text, extra = {}) => {
    const safe = truncate(text);
    try {
      await ctx.reply(safe, { parse_mode: "Markdown", ...extra });
    } catch {
      await ctx.reply(safe, extra);
    }
  };
  return next();
}
