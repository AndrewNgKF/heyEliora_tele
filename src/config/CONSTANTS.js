// ── Tiers ──────────────────────────────────────────────

/** Absolute hard cap per user per day, regardless of tier */
export const HARD_DAILY_CAP = parseInt(process.env.HARD_DAILY_CAP || "200", 10);

/** @type {Record<string, { dailyLimit: number, model: string, maxTokens: number }>} */
export const TIERS = {
  free: {
    dailyLimit: parseInt(process.env.FREE_DAILY_LIMIT || "5", 10),
    model: process.env.FREE_MODEL || "claude-haiku-4-5-20251001",
    maxTokens: 512,
  },
  lite: {
    dailyLimit: parseInt(process.env.LITE_DAILY_LIMIT || "50", 10),
    model: process.env.LITE_MODEL || "claude-haiku-4-5-20251001",
    maxTokens: 1024,
  },
  pro: {
    dailyLimit: parseInt(process.env.PRO_DAILY_LIMIT || "200", 10),
    model: process.env.PRO_MODEL || "claude-sonnet-4-20250514",
    maxTokens: 1024,
  },
};

/** Default tier for new users */
export const DEFAULT_TIER = "free";

/**
 * Get config for a tier, falling back to free if unknown
 * @param {string} tier
 * @returns {{ dailyLimit: number, model: string, maxTokens: number }}
 */
export function getTierConfig(tier) {
  return TIERS[tier] || TIERS.free;
}

// ── LLM ────────────────────────────────────────────────

/** Max conversation messages sent to the LLM */
export const MAX_HISTORY = 10;

/** Max tool-call round trips per chat() invocation */
export const MAX_TOOL_STEPS = 3;

/** Timezone picker options: [label, IANA timezone] */
export const TIMEZONE_OPTIONS = [
  ["🇺🇸 New York", "America/New_York"],
  ["🇺🇸 Chicago", "America/Chicago"],
  ["🇺🇸 Denver", "America/Denver"],
  ["🇺🇸 LA", "America/Los_Angeles"],
  ["🇬🇧 London", "Europe/London"],
  ["🇪🇺 Paris", "Europe/Paris"],
  ["🇮🇳 India", "Asia/Kolkata"],
  ["🇸🇬 Singapore", "Asia/Singapore"],
  ["🇯🇵 Tokyo", "Asia/Tokyo"],
  ["🇦🇺 Sydney", "Australia/Sydney"],
];

/** Shared howto / capabilities text */
export const HOWTO_TEXT =
  `*Here's what I can do:*\n\n` +
  `🎯 *Goals* — Tell me what you're working toward. I'll ask questions to make it specific, then track it.\n` +
  `📝 *Progress* — Just tell me what you did (or didn't do). I'll log it against your goals automatically.\n` +
  `⏰ *Reminders* — Ask for reminders, use /remind or conversationally.\n` +
  `📊 *Check-ins* — /whatsup gives you an honest accountability report.\n` +
  `🗣 *Preferences* — Tell me how you like to work — I'll remember.\n` +
  `🧹 *Fresh start* — /forget clears our conversation history.\n\n` +
  `No commands needed — just talk to me naturally.`;

/** Shared secret for cron endpoint authentication */
export const CRON_SECRET = process.env.CRON_SECRET || "";

/** Telegram command menu entries */
export const COMMANDS = [
  { command: "start", description: "Welcome + quick start" },
  { command: "profile", description: "Your profile at a glance" },
  { command: "goals", description: "View your goals" },
  { command: "progress", description: "Recent progress entries" },
  { command: "remind", description: "Set a reminder via chat" },
  { command: "reminders", description: "View active reminders" },
  { command: "whatsup", description: "Accountability check-in" },
  { command: "usage", description: "Today's usage + limits" },
  { command: "timezone", description: "Set your timezone" },
  { command: "preferences", description: "View your preferences" },
  { command: "howto", description: "What Eliora can do" },
  { command: "forget", description: "Clear conversation history" },
];
